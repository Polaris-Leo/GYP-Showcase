/**
 * Blob 图片清单 + 选择图片弹窗 的回归测试
 *
 * 和 RECON 下其它测试一样：**不重写被测逻辑**，而是把 site/assets/admin.js 与
 * site/functions/api/blobs.js 里真正发货的那几段源码切出来，用 new Function 跑。
 * 复制一份逻辑到测试里，改了源码测试照样绿，那就什么都没测到。
 *
 * 切片边界一律用「被切的那段自己的收尾」做锚点，不用它后面某段代码的注释头 ——
 * 后面跟着的东西随时会变（这一课是 blob-key-parity-test.js 上过的）。
 *
 * 跑：node RECON/blob-gallery-test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + name);
  } else {
    failed++;
    console.log('  ✗ ' + name + (extra ? '\n      ' + extra : ''));
  }
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(name, a === e, a === e ? '' : '期望 ' + e + '\n      实际 ' + a);
}

function group(title) {
  console.log('\n' + title);
}

/* ══════════════════════════════════════════════════════════════════════
 * DOM 替身
 * ════════════════════════════════════════════════════════════════════ */

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attrs = {};
    this.handlers = {};
    this.isConnected = true;
    this.value = '';
    this.disabled = false;
    this._cls = new Set();
    this._text = '';
  }

  // className 必须成对：只写 setter 的话 sloppy 模式下读回来是 undefined，
  // 而 classList.contains 与 className 会各说各话，测试就成了摆设。
  get className() { return Array.from(this._cls).join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }

  get classList() {
    const self = this;
    return {
      add() { Array.prototype.forEach.call(arguments, (c) => self._cls.add(c)); },
      remove() { Array.prototype.forEach.call(arguments, (c) => self._cls.delete(c)); },
      contains(c) { return self._cls.has(c); },
    };
  }

  // title 走 attrs，好让 el.title = x 与 removeAttribute('title') 互相看得见
  get title() { return this.attrs.title !== undefined ? this.attrs.title : ''; }
  set title(v) { this.attrs.title = String(v); }

  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join('');
    return this._text;
  }
  set textContent(v) {
    this._text = String(v);
    this.children.forEach((c) => { c.parentElement = null; });
    this.children = [];
  }

  appendChild(child) {
    child.parentElement = this;
    this._text = '';
    this.children.push(child);
    return child;
  }
  append() { Array.prototype.forEach.call(arguments, (c) => this.appendChild(c)); }

  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }

  addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
  removeEventListener(type, fn) {
    if (this.handlers[type]) this.handlers[type] = this.handlers[type].filter((f) => f !== fn);
  }
  dispatchEvent(ev) {
    (this.handlers[ev.type] || []).forEach((f) => f.call(this, ev));
    return true;
  }
  click() { return this.dispatchEvent({ type: 'click' }); }

  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }
  get nextElementSibling() {
    if (!this.parentElement) return null;
    const i = this.parentElement.children.indexOf(this);
    return this.parentElement.children[i + 1] || null;
  }

  _all() {
    const out = [];
    const walk = (n) => n.children.forEach((c) => { out.push(c); walk(c); });
    walk(this);
    return out;
  }

  matches(sel) {
    const s = String(sel).trim();
    if (s[0] === '.') return this._cls.has(s.slice(1));
    const attr = s.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/);
    if (attr) {
      const v = this.getAttribute(attr[1]);
      if (v === null) return false;
      return attr[2] === undefined || v === attr[2];
    }
    return this.tagName === s.toUpperCase();
  }

  querySelector(sel) { return this._all().filter((n) => n.matches(sel))[0] || null; }
  querySelectorAll(sel) { return this._all().filter((n) => n.matches(sel)); }
}

const documentStub = {
  createElement: (tag) => new El(tag),
  getElementById: () => null,
};

function EventStub(type, opts) {
  this.type = type;
  this.bubbles = !!(opts && opts.bubbles);
}

/* ══════════════════════════════════════════════════════════════════════
 * 切片
 * ════════════════════════════════════════════════════════════════════ */

const adminSrc = fs.readFileSync(path.join(SITE, 'assets', 'admin.js'), 'utf8');
const blobsSrc = fs.readFileSync(path.join(SITE, 'functions', 'api', 'blobs.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(SITE, 'admin.html'), 'utf8');
const cssSrc = fs.readFileSync(path.join(SITE, 'assets', 'admin.css'), 'utf8');

function slice(src, label, startMark, endMark) {
  const start = src.indexOf(startMark);
  if (start < 0) {
    console.error('切片失败：' + label + ' 找不到起点 ' + JSON.stringify(startMark));
    process.exit(1);
  }
  const at = src.indexOf(endMark, start);
  if (at < 0) {
    console.error('切片失败：' + label + ' 找不到终点 ' + JSON.stringify(endMark));
    process.exit(1);
  }
  // 终点标记必须唯一到「从起点往后第一次出现就是那一处」——否则会短切。
  // 用 lastIndexOf 反查一次，确认没有更早的同款标记落在切片内部。
  return src.slice(start, at + endMark.length);
}

// 键名正则 + 收集器（与 blob-key-parity-test.js 切的是同一段）
const keyBlock = slice(
  adminSrc, 'BLOB_KEY_RE',
  'const BLOB_KEY_RE',
  '\n  walk(root, 0);\n  return keys;\n}\n'
);

// usedBlobKeys → paintBlobGrid 是连续的一段：中间还有 blobKeyOf / shortBlobKey /
// blobThumb / blobBadge / BLOB_FILTERS，全都要，正好一刀切下来。
const gridBlock = slice(
  adminSrc, 'paintBlobGrid',
  'function usedBlobKeys()',
  '\n  return shown.length;\n}\n'
);

const syncBlock = slice(
  adminSrc, 'syncImageControl',
  'function syncImageControl(input) {',
  "    valueEl.dataset.kind = 'url';\n    valueEl.title = raw;\n  }\n}\n"
);

const applyBlock = slice(
  adminSrc, 'applyPickedValue',
  'function applyPickedValue(value) {',
  "  showSaveStatus(value ? '已选择图片' : '已清空该字段');\n}\n"
);

// 切片体检：切多了会在 new Function 里炸，或者更糟 —— 悄悄改变被测行为。
group('组 0：切片完整性');
ok('keyBlock 只含正则与收集器', /function collectBlobKeys/.test(keyBlock)
  && !/fetch\(|document\./.test(keyBlock));
ok('gridBlock 含 paintBlobGrid 与 BLOB_FILTERS',
  /function paintBlobGrid/.test(gridBlock) && /const BLOB_FILTERS/.test(gridBlock));
ok('gridBlock 未切进面板渲染（renderBlobPanel 应在切片外）',
  !/async function renderBlobPanel/.test(gridBlock),
  '切片越界到了 renderBlobPanel，边界需要更新');
ok('syncBlock 只含 syncImageControl',
  /function syncImageControl/.test(syncBlock) && !/function attachImageControls/.test(syncBlock));
ok('applyBlock 只含 applyPickedValue',
  /function applyPickedValue/.test(applyBlock) && !/function syncImageControl/.test(applyBlock));

/* ══════════════════════════════════════════════════════════════════════
 * 沙箱
 * ════════════════════════════════════════════════════════════════════ */

const calls = { status: [], deleted: [], repainted: 0, copied: [], closed: 0, picked: [] };
let confirmAnswer = true;

const navigatorStub = {
  clipboard: {
    writeText: (t) => { calls.copied.push(t); return Promise.resolve(); },
  },
};

const sandbox = new Function(
  'document', 'data', 'showSaveStatus', 'deleteBlob', 'renderBlobPanel',
  'confirm', 'navigator', 'Event', 'pickerState', 'closePicker',
  keyBlock + '\n' + gridBlock + '\n' + syncBlock + '\n' + applyBlock + '\n' +
  'return {' +
  '  collectBlobKeys, blobKeyOf, shortBlobKey, blobBadge, BLOB_FILTERS,' +
  '  paintBlobGrid, syncImageControl, applyPickedValue,' +
  '  setData(v) { data = v; },' +
  '  setPickerTarget(t) { pickerState = t; },' +
  '};'
)(
  documentStub,
  {},
  (msg) => calls.status.push(msg),
  (key) => { calls.deleted.push(key); return Promise.resolve({ ok: true }); },
  () => { calls.repainted++; },
  () => confirmAnswer,
  navigatorStub,
  EventStub,
  { target: null },
  () => { calls.closed++; }
);

const S = sandbox;

/* ══════════════════════════════════════════════════════════════════════ */

const H32 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';   // 32 位小写十六进制
const KEY_A = 'img/' + H32 + '.png';
const KEY_B = 'img/' + '00112233445566778899aabbccddeeff' + '.webp';

function blobOf(key) {
  return { key, etag: 'W/"' + key.slice(4, 12) + '"', url: '/img?key=' + encodeURIComponent(key) };
}

group('组 1：shortBlobKey —— 键名缩写');
eq('32 位哈希截到 8 位并保留扩展名', S.shortBlobKey(KEY_A), 'a1b2c3d4….png');
eq('去掉 img/ 前缀', S.shortBlobKey('img/abc.png'), 'abc.png');
eq('哈希短于阈值时原样返回', S.shortBlobKey('img/abcdef.jpg'), 'abcdef.jpg');
eq('哈希正好 12 位不截', S.shortBlobKey('img/123456789012.png'), '123456789012.png');
eq('哈希 13 位开始截', S.shortBlobKey('img/1234567890123.png'), '12345678….png');
eq('没有扩展名也不炸', S.shortBlobKey('img/' + H32), 'a1b2c3d4…');
eq('只剥开头的 img/，中间的不动', S.shortBlobKey('img/img.png'), 'img.png');

group('组 2：blobKeyOf —— 从字段值里认出 Blob 键名');
eq('空串', S.blobKeyOf(''), '');
eq('null', S.blobKeyOf(null), '');
eq('undefined', S.blobKeyOf(undefined), '');
eq('裸键名', S.blobKeyOf(KEY_A), KEY_A);
eq('/img?key= 形态', S.blobKeyOf('/img?key=' + encodeURIComponent(KEY_A)), KEY_A);
eq('绝对地址形态', S.blobKeyOf('https://x.pages.dev/img?key=' + KEY_A), KEY_A);
eq('外部链接不误判', S.blobKeyOf('https://i0.hdslb.com/bfs/article/abc123.jpg'), '');
eq('大写十六进制不认（服务端只生成小写）', S.blobKeyOf('img/' + H32.toUpperCase() + '.png'), '');
eq('非白名单扩展名不认', S.blobKeyOf('img/' + H32 + '.svg'), '');
eq('哈希长度不足不认', S.blobKeyOf('img/abc.png'), '');

group('组 3：BLOB_FILTERS —— 使用状态筛选');
eq('all 放行使用中', S.BLOB_FILTERS.all(true), true);
eq('all 放行未使用', S.BLOB_FILTERS.all(false), true);
eq('used 只放行使用中', S.BLOB_FILTERS.used(true), true);
eq('used 拦下未使用', S.BLOB_FILTERS.used(false), false);
eq('free 只放行未使用', S.BLOB_FILTERS.free(false), true);
eq('free 拦下使用中', S.BLOB_FILTERS.free(true), false);

group('组 4：syncImageControl —— 隐藏输入框旁边那枚当前值');

function fieldWith(value) {
  const wrap = new El('div');
  const input = new El('input');
  input.value = value;
  const row = new El('div');
  row.className = 'image-control';
  const valueEl = new El('span');
  valueEl.className = 'image-value';
  row.appendChild(valueEl);
  wrap.append(input, row);
  return { input, valueEl, row };
}

let f = fieldWith('');
S.syncImageControl(f.input);
eq('空值显示未选择', f.valueEl.textContent, '未选择图片');
eq('空值 kind=none', f.valueEl.dataset.kind, 'none');
eq('空值不留 title', f.valueEl.getAttribute('title'), null);

f = fieldWith('  ' + KEY_A + '  ');
S.syncImageControl(f.input);
eq('Blob 值显示 Blob · 缩写（并且 trim 过）', f.valueEl.textContent, 'Blob · a1b2c3d4….png');
eq('Blob 值 kind=blob', f.valueEl.dataset.kind, 'blob');
eq('Blob 值 title 是完整值', f.valueEl.getAttribute('title'), KEY_A);

f = fieldWith('https://i0.hdslb.com/bfs/article/cover.jpg');
S.syncImageControl(f.input);
eq('外链显示去协议后的地址', f.valueEl.textContent, '外部链接 · i0.hdslb.com/bfs/article/cover.jpg');
eq('外链 kind=url', f.valueEl.dataset.kind, 'url');

f = fieldWith('http://example.com/' + 'x'.repeat(80) + '.png');
S.syncImageControl(f.input);
ok('超长外链截到 42 字符', f.valueEl.textContent === '外部链接 · ' + ('example.com/' + 'x'.repeat(80) + '.png').slice(0, 42),
  '实际 ' + f.valueEl.textContent);

// 回归：Blob → 空 时 title 必须被摘掉，否则鼠标悬停还在报上一张图
f = fieldWith(KEY_A);
S.syncImageControl(f.input);
f.input.value = '';
S.syncImageControl(f.input);
eq('从 Blob 改回空值时清掉 title', f.valueEl.getAttribute('title'), null);

// 没有控制行的图片输入框（理论上不存在，但别让它抛）
const bare = new El('input');
bare.value = KEY_A;
let threw = false;
try { S.syncImageControl(bare); } catch (e) { threw = true; }
ok('没有 .image-control 兄弟节点时静默返回', !threw);

group('组 5：paintBlobGrid（manage 模式，数据页面板）');

function paintManage(blobs, filter, dataForUse) {
  S.setData(dataForUse || {});
  const host = new El('div');
  const shown = S.paintBlobGrid(host, { blobs, filter: filter || 'all', mode: 'manage' });
  return { host, shown };
}

let r = paintManage([], 'all');
eq('空桶返回 0', r.shown, 0);
eq('空桶给出上传引导', r.host.querySelector('.blob-empty').textContent,
  '桶里还没有图片。用字段里的「上传图片」传一张试试。');

r = paintManage([blobOf(KEY_A)], 'free', { hero: KEY_A });
eq('筛选后为空时返回 0', r.shown, 0);
eq('筛选后为空的文案不同于空桶', r.host.querySelector('.blob-empty').textContent,
  '没有符合当前筛选的图片。');

r = paintManage([blobOf(KEY_A), blobOf(KEY_B)], 'all', { hero: { src: KEY_A } });
eq('两张图都画出来', r.shown, 2);
eq('格子数与返回值一致', r.host.querySelectorAll('.blob-tile').length, 2);
eq('manage 模式格子是 DIV', r.host.querySelectorAll('.blob-tile')[0].tagName, 'DIV');

const tileA = r.host.querySelectorAll('.blob-tile')[0];
const tileB = r.host.querySelectorAll('.blob-tile')[1];
eq('引用中的图标记使用中', tileA.querySelector('.blob-badge').textContent, '● 使用中');
eq('使用中 data-use=yes', tileA.querySelector('.blob-badge').dataset.use, 'yes');
eq('没被引用的图标记未使用', tileB.querySelector('.blob-badge').textContent, '○ 未使用');
eq('未使用 data-use=no', tileB.querySelector('.blob-badge').dataset.use, 'no');
eq('键名旁挂完整键名做 title', tileA.querySelector('.blob-key').getAttribute('title'), KEY_A);
ok('manage 模式带操作区', !!tileA.querySelector('.blob-actions'));
ok('manage 模式有缩略图', !!tileA.querySelector('.blob-thumb'));

const delA = tileA.querySelector('.blob-actions').children[1];
const delB = tileB.querySelector('.blob-actions').children[1];
eq('使用中的图删除按钮禁用', delA.disabled, true);
ok('禁用时给出替代路径的说明', /先在对应字段换掉/.test(delA.getAttribute('title')),
  '实际 title: ' + delA.getAttribute('title'));
eq('未使用的图删除按钮可用', delB.disabled, false);
eq('未使用的图不挂解释 title', delB.getAttribute('title'), null);

group('组 5b：分页 —— 一页 8 张（4 列 × 2 行）');

function manyBlobs(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    // 32 位十六进制：两位数字重复 16 次再截断，保证每张键名都不一样
    out.push(blobOf('img/' + String(i).padStart(2, '0').repeat(16).slice(0, 32) + '.png'));
  }
  return out;
}

function paintPage(blobs, page, pageSize) {
  const host = new El('div');
  const pageCalls = [];
  const shown = S.paintBlobGrid(host, {
    blobs,
    filter: 'all',
    mode: 'manage',
    page,
    pageSize,
    onPage: (p) => pageCalls.push(p),
  });
  return {
    host, shown, pageCalls,
    tiles: host.querySelectorAll('.blob-tile').length,
    pager: host.querySelector('.blob-pager'),
  };
}

S.setData({});
let pg = paintPage(manyBlobs(8), 1);
eq('正好 8 张时一页画满', pg.tiles, 8);
ok('一页装得下就不插分页条', !pg.pager);

pg = paintPage(manyBlobs(9), 1);
eq('9 张时第一页只画 8 张', pg.tiles, 8);
ok('超过一页才插分页条', !!pg.pager);
eq('返回值是筛选后的总数，不是这一页的张数', pg.shown, 9);
ok('分页条借的是条目列表那身皮肤', pg.pager.classList.contains('list-pager'));
ok('状态行同时报页码、本页范围和筛选后总数',
  /第 01 \/ 02 页/.test(pg.pager.textContent)
  && /本页 01–08/.test(pg.pager.textContent)
  && /共 09 张/.test(pg.pager.textContent),
  '实际：' + pg.pager.textContent);

pg = paintPage(manyBlobs(9), 2);
eq('第二页画剩下的 1 张', pg.tiles, 1);
ok('第二页范围是 09–09', /本页 09–09/.test(pg.pager.textContent),
  '实际：' + pg.pager.textContent);

// 删图、切筛选、导入一份更短的备份，都可能让存着的页码越界
pg = paintPage(manyBlobs(9), 7);
eq('页码越上界夹回最后一页', pg.tiles, 1);
pg = paintPage(manyBlobs(9), 0);
eq('页码越下界夹回第一页', pg.tiles, 8);

pg = paintPage(manyBlobs(20), 2);
ok('20 张分 3 页', /第 02 \/ 03 页/.test(pg.pager.textContent),
  '实际：' + pg.pager.textContent);
const pagerBtns = pg.pager.querySelectorAll('button');
pagerBtns[0].click();
eq('点「上一页」回调收到 1', pg.pageCalls, [1]);
pagerBtns[pagerBtns.length - 1].click();
eq('点「下一页」回调收到 3', pg.pageCalls, [1, 3]);

pg = paintPage(manyBlobs(20), 1);
eq('第一页的「上一页」禁用', pg.pager.querySelectorAll('button')[0].disabled, true);
pg = paintPage(manyBlobs(20), 3);
const lastPageBtns = pg.pager.querySelectorAll('button');
eq('末页的「下一页」禁用', lastPageBtns[lastPageBtns.length - 1].disabled, true);

// 不给回调就别画出一条点不动的分页条
const noCb = new El('div');
S.paintBlobGrid(noCb, { blobs: manyBlobs(9), filter: 'all', mode: 'manage' });
eq('没有 onPage 时不画分页条', noCb.querySelectorAll('.blob-pager').length, 0);
eq('没有 onPage 时仍然只画一页', noCb.querySelectorAll('.blob-tile').length, 8);

const pickerFirst = paintPage(manyBlobs(5), 1, 4);
eq('选择图片每页只画 4 张', pickerFirst.tiles, 4);
ok('选择图片 5 张时仍有分页条', !!pickerFirst.pager);
ok('选择图片第一页范围是 01–04', /本页 01–04/.test(pickerFirst.pager.textContent),
  '实际：' + pickerFirst.pager.textContent);
const pickerSecond = paintPage(manyBlobs(5), 2, 4);
eq('选择图片第二页画剩下 1 张', pickerSecond.tiles, 1);
ok('选择图片第二页范围是 05–05', /本页 05–05/.test(pickerSecond.pager.textContent),
  '实际：' + pickerSecond.pager.textContent);

group('组 6：manage 模式的删除与复制');

r = paintManage([blobOf(KEY_B)], 'all', {});
const onlyDel = r.host.querySelector('.blob-actions').children[1];
const onlyCopy = r.host.querySelector('.blob-actions').children[0];

calls.deleted.length = 0;
calls.repainted = 0;
confirmAnswer = false;
onlyDel.click();
eq('确认框点取消不删除', calls.deleted, []);
eq('取消后按钮仍可用', onlyDel.disabled, false);

confirmAnswer = true;
onlyDel.click();
// 处理器是 async 的，等一轮微任务
Promise.resolve().then(() => {}).then(() => {
  eq('确认后按键名删除', calls.deleted, [KEY_B]);
  ok('删除后重画面板', calls.repainted >= 1, 'repainted=' + calls.repainted);

  calls.copied.length = 0;
  onlyCopy.click();
  Promise.resolve().then(() => {
    eq('复制链接写入剪贴板的是 /img 地址', calls.copied, ['/img?key=' + encodeURIComponent(KEY_B)]);
    runPickGroups();
  });
});

/* pick 模式与之后的组要等上面的微任务，串起来跑 */
function runPickGroups() {
  group('组 7：paintBlobGrid（pick 模式，选择弹窗）');

  S.setData({ hero: KEY_A });
  calls.picked.length = 0;
  const host = new El('div');
  const shown = S.paintBlobGrid(host, {
    blobs: [blobOf(KEY_A), blobOf(KEY_B)],
    filter: 'all',
    mode: 'pick',
    currentKey: KEY_B,
    onPick: (b) => calls.picked.push(b.key),
  });

  eq('两张都画出来', shown, 2);
  const tiles = host.querySelectorAll('.blob-tile');
  eq('pick 模式格子是 BUTTON', tiles[0].tagName, 'BUTTON');
  eq('按钮显式声明 type=button', tiles[0].type, 'button');
  // 这条是结构底线：整格可点时格子里不能再有按钮，button 套 button 非法
  eq('pick 模式不带操作区（避免按钮套按钮）', host.querySelectorAll('.blob-actions').length, 0);
  eq('pick 模式一个 <button> 里没有嵌套 button',
    tiles[0]._all().filter((n) => n.tagName === 'BUTTON').length, 0);

  ok('非当前项的 aria-label 报使用状态',
    tiles[0].getAttribute('aria-label') === '选择 ' + KEY_A + '（使用中）',
    '实际 ' + tiles[0].getAttribute('aria-label'));
  eq('当前项标 data-current', tiles[1].dataset.current, 'true');
  eq('当前项 aria-label 改成当前已选', tiles[1].getAttribute('aria-label'), '当前已选：' + KEY_B);
  ok('当前项加「当前」角标', !!tiles[1].querySelector('.blob-current'));
  ok('非当前项没有角标', !tiles[0].querySelector('.blob-current'));
  eq('未指定 currentKey 时不误标', (function () {
    const h2 = new El('div');
    S.paintBlobGrid(h2, { blobs: [blobOf(KEY_A)], filter: 'all', mode: 'pick', currentKey: '', onPick() {} });
    return h2.querySelector('.blob-tile').dataset.current;
  })(), undefined);

  tiles[0].click();
  eq('点格子回调带上那张图', calls.picked, [KEY_A]);

  // 未知筛选名回退到 all，而不是画出空网格
  const h3 = new El('div');
  const n3 = S.paintBlobGrid(h3, { blobs: [blobOf(KEY_A)], filter: 'nonsense', mode: 'pick', onPick() {} });
  eq('未知筛选名回退成全部', n3, 1);

  group('组 8：applyPickedValue —— 写回字段');

  function targetField(value) {
    const wrap = new El('div');
    const input = new El('input');
    input.value = value;
    const row = new El('div');
    row.className = 'image-control';
    const valueEl = new El('span');
    valueEl.className = 'image-value';
    row.appendChild(valueEl);
    wrap.append(input, row);
    const events = [];
    input.addEventListener('input', (ev) => events.push(ev));
    return { input, valueEl, events };
  }

  let t = targetField('');
  S.setPickerTarget({ target: t.input });
  calls.status.length = 0;
  calls.closed = 0;
  S.applyPickedValue(KEY_A);
  eq('值写进隐藏输入框', t.input.value, KEY_A);
  eq('派发了一次 input 事件', t.events.length, 1);
  eq('input 事件必须冒泡（bindFields 的绑定在祖先上）', t.events[0].bubbles, true);
  eq('顺手同步当前值显示', t.valueEl.textContent, 'Blob · a1b2c3d4….png');
  eq('选完关闭弹窗', calls.closed, 1);
  eq('给出成功提示', calls.status, ['已选择图片']);

  t = targetField(KEY_A);
  S.setPickerTarget({ target: t.input });
  calls.status.length = 0;
  S.applyPickedValue('');
  eq('清空时写空串', t.input.value, '');
  eq('清空也派发 input 事件', t.events.length, 1);
  eq('清空的提示文案不同', calls.status, ['已清空该字段']);
  eq('清空后当前值回到未选择', t.valueEl.textContent, '未选择图片');

  // 回归：弹窗开着时字段可能被重渲染掉，往脱离文档的 input 写值会静默丢失
  t = targetField('old');
  t.input.isConnected = false;
  S.setPickerTarget({ target: t.input });
  calls.status.length = 0;
  calls.closed = 0;
  S.applyPickedValue(KEY_B);
  eq('字段已脱离文档时不写值', t.input.value, 'old');
  eq('脱离文档时不派发事件', t.events.length, 0);
  eq('脱离文档时提示重新选择', calls.status, ['该字段已刷新，请重新打开选择']);
  eq('脱离文档时也要关掉弹窗', calls.closed, 1);

  S.setPickerTarget({ target: null });
  calls.status.length = 0;
  threw = false;
  try { S.applyPickedValue(KEY_A); } catch (e) { threw = true; }
  ok('没有目标字段时不抛', !threw);
  eq('没有目标字段时走同一条提示', calls.status, ['该字段已刷新，请重新打开选择']);

  runApiGroup();
}

/* ══════════════════════════════════════════════════════════════════════ */

function runApiGroup() {
  group('组 9：/api/blobs GET —— 列表、过滤与截断计数');

  // 切 GET 分支。终点用它自己的 catch 收尾（6 空格缩进），
  // 文件末尾 onRequest 的 catch 是 4 空格，不会撞。
  const getBlock = slice(
    blobsSrc, "blobs.js GET",
    "if (method === 'GET') {",
    '      return blobError(e);\n    }\n  }\n'
  );
  ok('GET 切片含 store.list', /store\.list\(/.test(getBlock));
  ok('GET 切片没切到 DELETE 分支', !/method === 'DELETE'/.test(getBlock));

  const runGet = new Function(
    'store', 'json', 'blobError', 'KEY_PREFIX', 'KEY_RE', 'LIST_LIMIT',
    'return async function (method) {\n' + getBlock + '\n  return null;\n};'
  );

  const KEY_RE = /^img\/[0-9a-f]{32}\.(png|jpg|webp|gif)$/;
  const jsonStub = (body) => ({ body });
  const errStub = (e) => ({ error: String(e && e.message) });

  function keyN(i, ext) {
    const hex = String(i).padStart(2, '0').repeat(16).slice(0, 32);
    return 'img/' + hex + '.' + (ext || 'png');
  }

  let seen = null;
  function storeWith(blobs) {
    return {
      list: (opts) => { seen = opts; return Promise.resolve({ blobs }); },
    };
  }

  const three = [keyN(1), keyN(2), keyN(3)].map((k) => ({ key: k, etag: 'e' + k }));

  runGet(storeWith(three), jsonStub, errStub, 'img/', KEY_RE, 3)('GET').then((res) => {
    const b = res.body;

    // 官方文档里 list() 的可选项只有 prefix/directories/paginate/cursor/consistency，
    // 没有 limit。传 limit 会被忽略，留着会让人以为服务端截过了。
    eq('list 只传 prefix', seen, { prefix: 'img/' });
    ok('list 参数里没有 limit', !('limit' in seen), '实际 ' + JSON.stringify(seen));

    eq('三张图都返回', b.count, 3);
    eq('total 是过滤后的真实总数', b.total, 3);
    // 回归：原来写的是 length >= LIMIT，桶里刚好 3 个也会被报成「可能还有」
    eq('数量正好等于上限时不算截断', b.truncated, false);
    eq('回显上限', b.limit, 3);
    eq('没有非法键名时 skipped 为 0', b.skipped, 0);
    eq('每条只有 key/etag/url 三个字段', Object.keys(b.blobs[0]).sort(), ['etag', 'key', 'url']);
    eq('url 指向 /img 并且编码过键名', b.blobs[0].url, '/img?key=' + encodeURIComponent(keyN(1)));
    eq('etag 原样带出', b.blobs[0].etag, 'e' + keyN(1));

    const four = three.concat([{ key: keyN(4), etag: 'e4' }]);
    return runGet(storeWith(four), jsonStub, errStub, 'img/', KEY_RE, 3)('GET');
  }).then((res) => {
    const b = res.body;
    eq('超过上限时按上限截断', b.count, 3);
    eq('截断时 total 仍报真实总数', b.total, 4);
    eq('超过上限才算截断', b.truncated, true);

    // 桶可以被别的途径写入；不认识的键名不该露到前端（前端会拿它去拼 /img）
    const mixed = [
      { key: keyN(1), etag: 'a' },
      { key: 'img/notahash.png', etag: 'b' },
      { key: 'other/thing.txt', etag: 'c' },
      { key: 'img/' + 'A'.repeat(32) + '.png', etag: 'd' },
      { key: keyN(2, 'webp'), etag: 'e' },
    ];
    return runGet(storeWith(mixed), jsonStub, errStub, 'img/', KEY_RE, 500)('GET');
  }).then((res) => {
    const b = res.body;
    eq('只留下合法键名', b.blobs.map((x) => x.key), [keyN(1), keyN(2, 'webp')]);
    eq('非法键名计入 skipped', b.skipped, 3);
    eq('total 不含被过滤掉的', b.total, 2);
    eq('过滤后不足上限则不算截断', b.truncated, false);

    return runGet({ list: () => Promise.resolve(null) }, jsonStub, errStub, 'img/', KEY_RE, 500)('GET');
  }).then((res) => {
    eq('list 返回 null 时当空列表处理', res.body.count, 0);
    eq('null 列表的 skipped 不是 NaN', res.body.skipped, 0);

    const boom = { list: () => Promise.reject(new Error('桶不存在')) };
    return runGet(boom, jsonStub, errStub, 'img/', KEY_RE, 500)('GET');
  }).then((res) => {
    eq('list 抛错走 blobError', res, { error: '桶不存在' });

    runSourceGroup();
  }).catch((e) => {
    failed++;
    console.log('  ✗ 组 9 执行中抛错：' + e.stack);
    runSourceGroup();
  });
}

/* ══════════════════════════════════════════════════════════════════════ */

function runSourceGroup() {
  group('组 10：源码层面的约束（执行测不到的那些）');

  ok('admin.js 已改名为 attachImageControls', /function attachImageControls\(/.test(adminSrc));
  ok('admin.js 不再残留 attachUploaders', !/attachUploaders/.test(adminSrc));
  ok('bindFields 调的是新名字', /attachImageControls\(scope\)/.test(adminSrc));
  ok('图片输入框加上退居幕后的类', /classList\.add\('is-behind-picker'\)/.test(adminSrc));
  ok('CSS 用 display:none 隐藏（一并移出 Tab 序列与无障碍树）',
    /\.is-behind-picker\s*{\s*display:\s*none;?\s*}/.test(cssSrc));
  ok('写回字段走派发 input 事件而不是自己调 updateValue',
    /input\.dispatchEvent\(new Event\('input', { bubbles: true }\)\)/.test(applyBlock)
    && !/updateValue\(/.test(applyBlock));
  ok('hydrateForm 回填后补一次 syncImageControl',
    /updatePreview\(input\);[\s\S]{0,400}?syncImageControl\(input\);/.test(adminSrc));
  ok('上传成功后让清单缓存作废', /invalidateBlobCache\(\)/.test(adminSrc));
  ok('切到「数据」页时才拉清单', /if \(target === 'data'\) renderBlobPanel\(\)/.test(adminSrc));

  ok('blobs.js 的 store.list 不传 limit',
    !/store\.list\(\{[^}]*limit/.test(blobsSrc),
    'list() 没有 limit 选项，传了只会误导读代码的人');
  ok('blobs.js 头注释不再说「没有对应界面」', !/还没有对应界面/.test(blobsSrc));

  ok('admin.html 有清单容器 #blob-gallery', /id="blob-gallery"/.test(htmlSrc));
  ok('admin.html 有计数区 #blob-count', /id="blob-count"/.test(htmlSrc));
  ok('计数区是 live region（刷新结果要念出来）',
    /id="blob-count"[^>]*aria-live="polite"/.test(htmlSrc));
  ok('三个筛选按钮都在', ['all', 'used', 'free']
    .every((k) => htmlSrc.indexOf('data-blob-filter="' + k + '"') >= 0));

  // 用户要求「展示在管理页数据条目的最下面」
  const lastCard = htmlSrc.lastIndexOf('class="data-card');
  const blobCard = htmlSrc.indexOf('class="data-card blob-card"');
  ok('Blob 面板是「数据」页最后一张卡片', blobCard >= 0 && blobCard === lastCard,
    'blob-card 在 ' + blobCard + '，最后一张卡在 ' + lastCard);

  // 弹窗必须留手填外链的口子：站点默认图全是外部直链（README §3）
  ok('弹窗保留外部链接输入', /data-picker-url/.test(adminSrc) && /或填外部链接|外部链接/.test(adminSrc));
  ok('上传按钮保留', /上传图片/.test(adminSrc));
  // 属性是 setAttribute 上去的，不是写在 innerHTML 里，两种写法都认
  ok('弹窗是对话框角色', /setAttribute\('role', 'dialog'\)|role="dialog"/.test(adminSrc));
  ok('弹窗声明 aria-modal',
    /setAttribute\('aria-modal', 'true'\)|aria-modal="true"/.test(adminSrc));
  ok('弹窗标题与容器用 aria-labelledby 关联',
    /aria-labelledby', 'picker-title'/.test(adminSrc) && /id="picker-title"/.test(adminSrc));
  ok('自己实现了 Tab 焦点圈（aria-modal 不管这事）',
    /Tab/.test(adminSrc) && /onPickerKeydown/.test(adminSrc));

  // 缩略图排布：4 列 × 2 行 = 一页 8 张，比例照展厅卡片的原图
  ok('缩略图网格固定 4 列（不再由可用宽度自己决定列数）',
    /\.blob-grid\s*{[^}]*grid-template-columns:\s*repeat\(4,/.test(cssSrc));
  ok('管理面板的四列均分可用宽度，不在右侧留下空白列',
    /\.blob-grid\s*{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/.test(cssSrc));
  ok('缩略图按展厅原图比例 1242×1863 开框',
    /\.blob-thumb\s*{[^}]*aspect-ratio:\s*1242\s*\/\s*1863/.test(cssSrc),
    '素材原图是 1242×1863（正好 2:3），写 1/1 会把竖图上下各切掉四分之一');
  ok('一页 8 张，正好和 4 列凑成两行', /const BLOBS_PER_PAGE = 8;/.test(adminSrc));
  ok('选择图片弹窗单独限制为每页 4 张',
    /const PICKER_BLOBS_PER_PAGE = 4;/.test(adminSrc)
    && /pageSize: PICKER_BLOBS_PER_PAGE/.test(adminSrc),
    '弹窗与管理面板使用不同页大小');
  ok('数据页 Blob 面板提供独立上传入口',
    /id="blob-upload-file"/.test(htmlSrc)
    && /id="blob-upload"/.test(htmlSrc)
    && /blobUploadPicker\.addEventListener\('change'/.test(adminSrc));
  ok('数据页上传复用既有上传通道并在成功后刷新清单',
    /openCropper\(file/.test(adminSrc)
    && /await uploadFile\(croppedFile\)/.test(adminSrc)
    && /invalidateBlobCache\(\);[\s\S]{0,400}renderBlobPanel\(true\);/.test(adminSrc));
  ok('数据页上传总会回到全部筛选，避免新上传的未使用图片被藏住',
    /blobPanelState\.filter = 'all';/.test(adminSrc)
    && /btn\.dataset\.blobFilter === 'all'/.test(adminSrc));
  ok('分页条横跨整行，不会被当成第 5 个格子',
    /\.blob-pager\s*{[^}]*grid-column:\s*1 \/ -1/.test(cssSrc));
  ok('面板和弹窗两个调用点都接了分页',
    (adminSrc.match(/onPage: \(p\) =>/g) || []).length === 2,
    '实际匹配 ' + (adminSrc.match(/onPage: \(p\) =>/g) || []).length + ' 处');
  ok('页码按钮挂 data-blob-page，不与条目列表的委托监听撞车',
    /dataset\.blobPage = String\(value\)/.test(adminSrc));
  ok('切筛选与重开弹窗都回到第一页',
    /blobPanelState\.page = 1;/.test(adminSrc) && /pickerState\.page = 1;/.test(adminSrc));

  report();
}

function report() {
  console.log('\n' + '─'.repeat(52));
  if (failed) {
    console.log(passed + ' passed, ' + failed + ' failed');
    process.exit(1);
  }
  console.log('全部通过：' + passed + ' passed, 0 failed');
}
