/* 后台列表分页测试。
 *
 * 和这个仓库里其他几个测试同一套路：**不重写逻辑**，而是把 site/assets/admin.js
 * 里真正发货的那几段源码切出来用 new Function 跑。重写一份等于测了个副本，
 * 源码改了测试照样绿。
 *
 * 切出来的段落：pad2、分页整段（ITEMS_PER_PAGE → renderItemList）、
 * syncBlockTitle、addItem、moveItem、removeItem。
 * buildItemBlock 依赖太重（下拉、图片选择器、resolveKey…），这里用替身，
 * 但替身遵守同一份契约：把 index 写进 dataset.itemIndex。契约本身由第 6 组
 * 的源码断言把住。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'assets', 'admin.js');
const src = fs.readFileSync(SRC, 'utf8');

let passed = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { passed++; } else { failures.push(label); console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; } else { failures.push(label); console.log('  ✗ ' + label + '\n      期望 ' + e + '\n      实际 ' + a); }
}

/* ── 切源码 ─────────────────────────────────────────────────────────── */

function slice(startNeedle, endNeedle, label) {
  const a = src.indexOf(startNeedle);
  if (a < 0) throw new Error('切片失败，找不到起点：' + label + ' → ' + startNeedle);
  const b = src.indexOf(endNeedle, a + startNeedle.length);
  if (b < 0) throw new Error('切片失败，找不到终点：' + label + ' → ' + endNeedle);
  return src.slice(a, b);
}

const pagerSrc = slice('const ITEMS_PER_PAGE', '\nfunction renderAllItemLists', '分页整段');
const syncSrc = slice('function syncBlockTitle', '\nfunction makeItemId', 'syncBlockTitle');
const addSrc = slice('function addItem(name)', '\nfunction removeItem', 'addItem');
const removeSrc = slice('function removeItem(name', '\nfunction moveItem', 'removeItem');
const moveSrc = slice('function moveItem(name', '\ndocument.querySelectorAll(', 'moveItem');
const pad2Src = slice('const pad2 =', '\n', 'pad2');

// 确认切到的是真东西，而不是空串或者注释
ok(/const ITEMS_PER_PAGE = 4;/.test(pagerSrc), '切片包含 ITEMS_PER_PAGE = 4');
ok(/function buildListPager/.test(pagerSrc), '切片包含 buildListPager');
ok(/function renderItemList/.test(pagerSrc), '切片包含 renderItemList');
ok(/revealId/.test(addSrc), 'addItem 切片包含 revealId');
ok(/revealId/.test(moveSrc), 'moveItem 切片包含 revealId');

/* ── DOM 替身 ───────────────────────────────────────────────────────── */

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attrs = {};
    this._class = '';
    this._text = '';
    this.disabled = false;
    this.parentElement = null;
  }
  // 注意：new Function 的函数体是 sloppy mode，只有 getter 没有 setter 时
  // 赋值会被静默吞掉（本仓库以前就被这个坑过一次）。get/set 必须成对。
  get className() { return this._class; }
  set className(v) { this._class = String(v); }
  get classList() {
    const self = this;
    return {
      contains: (c) => self._class.split(/\s+/).includes(c),
      add: (c) => { if (!self._class.split(/\s+/).includes(c)) self._class = (self._class + ' ' + c).trim(); },
    };
  }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join('');
    return this._text;
  }
  set textContent(v) { this._text = String(v); this.children.forEach((c) => { c.parentElement = null; }); this.children = []; }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  append(...kids) { kids.forEach((k) => this.appendChild(k)); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  get lastElementChild() { return this.children.length ? this.children[this.children.length - 1] : null; }
  scrollIntoView() { this._scrolled = true; }
  focus() { this._focused = true; }
  // 只支持测试里真正用到的选择器形式
  querySelector(sel) {
    const m = /^\[([-a-z]+)(?:="([^"]*)")?\]$/.exec(sel);
    const walk = (node) => {
      for (const c of node.children) {
        if (m) {
          const key = m[1].replace(/^data-/, '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
          const has = Object.prototype.hasOwnProperty.call(c.dataset, key);
          if (has && (m[2] === undefined || c.dataset[key] === m[2])) return c;
        }
        const deep = walk(c);
        if (deep) return deep;
      }
      return null;
    };
    return walk(this);
  }
  querySelectorAll() { return []; }
  closest(sel) {
    let node = this;
    const m = /^\[([-a-z]+)(?:="([^"]*)")?\]$/.exec(sel);
    while (node) {
      if (m) {
        const key = m[1].replace(/^data-/, '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        if (Object.prototype.hasOwnProperty.call(node.dataset, key)) return node;
      }
      node = node.parentElement;
    }
    return null;
  }
}

/* ── 装配 ───────────────────────────────────────────────────────────── */

function makeHarness(initialOrder) {
  const hosts = { merch: new El('div'), archive: new El('div') };
  hosts.merch.dataset.itemList = 'merch';
  hosts.archive.dataset.itemList = 'archive';
  const counters = { merch: new El('span'), archive: new El('span') };

  const state = {
    order: { merch: initialOrder.slice(), archive: [] },
    saves: 0,
    status: [],
    built: [],            // buildItemBlock 每次收到的 (id, index, total)
    hosts,
    counters,
  };

  const doc = {
    createElement: (tag) => new El(tag),
    querySelector: (sel) => {
      let m = /^\[data-item-list="([^"]+)"\]$/.exec(sel);
      if (m) return hosts[m[1]] || null;
      m = /^\[data-item-count="([^"]+)"\]$/.exec(sel);
      if (m) return counters[m[1]] || null;
      // addItem 找刚建好的块：[data-item-block="x"][data-item-id="y"]
      m = /^\[data-item-block="([^"]+)"\]\[data-item-id="([^"]+)"\]$/.exec(sel);
      if (m) {
        const host = hosts[m[1]];
        if (!host) return null;
        return host.children.find((c) => c.dataset.itemId === m[2]) || null;
      }
      return null;
    },
  };

  const collections = {
    merch: { section: 'home', emptyText: '还没有周边物品', confirmWord: '周边物品', blank: (n) => ({ title: '新物品 ' + n }) },
    archive: { section: 'archive', emptyText: '还没有展厅物品', confirmWord: '展厅物品', blank: (n) => ({ title: '新展品 ' + n }) },
  };

  const scope = {
    document: doc,
    collections,
    getOrder: (name) => state.order[name],
    bindFields: () => {},
    hydrateForm: () => {},
    saveData: () => { state.saves++; },
    showSaveStatus: (msg) => { state.status.push(msg); },
    makeItemId: (() => { let n = 100; return () => 'item' + (++n); })(),
    resolveKey: () => '',
    confirm: () => true,
    data: { home: {}, archive: {} },
    // buildItemBlock 替身：契约是「把全局 index 写进 dataset.itemIndex」，
    // 并按全局 index/total 决定首尾禁用。真实实现的这三点由第 6 组源码断言把住。
    buildItemBlock: (name, id, index, total) => {
      state.built.push({ id, index, total });
      const block = new El('div');
      block.className = 'item-block';
      block.dataset.itemBlock = name;
      block.dataset.itemId = id;
      block.dataset.itemIndex = String(index);
      const title = new El('span');
      title.dataset.itemTitle = '';
      title.textContent = 'x';
      block.appendChild(title);
      block.upDisabled = index === 0;
      block.downDisabled = index === total - 1;
      return block;
    },
  };

  const names = Object.keys(scope);
  const body = [
    pad2Src, ';',
    pagerSrc,
    syncSrc,
    addSrc,
    removeSrc,
    moveSrc,
    '\nreturn { renderItemList, buildListPager, listPageCount, listPageOf, listPage, ITEMS_PER_PAGE, syncBlockTitle, addItem, removeItem, moveItem };',
  ].join('\n');

  const api = new Function(...names, body)(...names.map((n) => scope[n]));
  return { api, state, scope };
}

const ids = (n) => Array.from({ length: n }, (_, i) => 'id' + (i + 1));

/* ── 1. 页数与页码换算 ──────────────────────────────────────────────── */
console.log('\n[1] 页数 / 页码换算');
{
  const { api } = makeHarness([]);
  eq(api.ITEMS_PER_PAGE, 4, '每页 4 项');
  eq(api.listPageCount(0), 1, '0 项算 1 页（不出现 0 页）');
  eq(api.listPageCount(1), 1, '1 项 → 1 页');
  eq(api.listPageCount(4), 1, '4 项 → 1 页');
  eq(api.listPageCount(5), 2, '5 项 → 2 页');
  eq(api.listPageCount(8), 2, '8 项 → 2 页');
  eq(api.listPageCount(9), 3, '9 项 → 3 页');
  eq(api.listPageOf(0), 1, '第 0 项在第 1 页');
  eq(api.listPageOf(3), 1, '第 3 项在第 1 页');
  eq(api.listPageOf(4), 2, '第 4 项在第 2 页');
  eq(api.listPageOf(7), 2, '第 7 项在第 2 页');
  eq(api.listPageOf(8), 3, '第 8 项在第 3 页');
}

/* ── 2. 4 项及以内不出现分页条 ─────────────────────────────────────── */
console.log('\n[2] 分页条的出现时机');
{
  for (const n of [1, 2, 3, 4]) {
    const { api, state } = makeHarness(ids(n));
    api.renderItemList('merch');
    const pagers = state.hosts.merch.children.filter((c) => c.className === 'list-pager');
    eq(pagers.length, 0, n + ' 项时没有分页条');
    eq(state.built.length, n, n + ' 项全部渲染出来');
  }
  const { api, state } = makeHarness(ids(5));
  api.renderItemList('merch');
  const pagers = state.hosts.merch.children.filter((c) => c.className === 'list-pager');
  eq(pagers.length, 1, '5 项时出现分页条');
  eq(state.built.length, 4, '5 项时本页只渲染 4 个块');

  const { api: emptyApi, state: emptyState } = makeHarness([]);
  emptyApi.renderItemList('merch');
  eq(emptyState.hosts.merch.children.length, 1, '空列表只有一个节点');
  eq(emptyState.hosts.merch.children[0].className, 'item-empty', '空列表显示占位文案，不显示分页条');
  eq(emptyState.hosts.merch.children[0].textContent, '还没有周边物品', '占位文案取自 collections 配置');
}

/* ── 3. 编号和禁用状态按全局算，不按页内算 ─────────────────────────── */
console.log('\n[3] 全局编号 / 首尾禁用');
{
  const { api, state } = makeHarness(ids(9));
  api.listPage.merch = 2;
  api.renderItemList('merch');
  eq(state.built.map((b) => b.index), [4, 5, 6, 7], '第 2 页拿到的是全局序号 4~7（不是 0~3）');
  eq(state.built.map((b) => b.total), [9, 9, 9, 9], '第 2 页拿到的 total 是 9（不是 4）');
  eq(state.built.map((b) => b.id), ['id5', 'id6', 'id7', 'id8'], '第 2 页取的是第 5~8 项');

  const blocks = state.hosts.merch.children.filter((c) => c.dataset.itemBlock);
  eq(blocks.map((b) => b.upDisabled), [false, false, false, false], '第 2 页首项的「上移」不该禁用');
  eq(blocks.map((b) => b.downDisabled), [false, false, false, false], '第 2 页末项的「下移」不该禁用');
  eq(blocks.map((b) => b.dataset.itemIndex), ['4', '5', '6', '7'], '块上记录的是全局序号');

  state.built.length = 0;
  api.listPage.merch = 1;
  api.renderItemList('merch');
  const first = state.hosts.merch.children.filter((c) => c.dataset.itemBlock);
  eq(first[0].upDisabled, true, '整个列表的第一项禁用「上移」');
  eq(first[3].downDisabled, false, '第 1 页最后一项不禁用「下移」（后面还有）');

  state.built.length = 0;
  api.listPage.merch = 3;
  api.renderItemList('merch');
  eq(state.built.map((b) => b.index), [8], '最后一页只有 1 项时序号仍是全局的 8');
  const last = state.hosts.merch.children.filter((c) => c.dataset.itemBlock);
  eq(last[0].downDisabled, true, '整个列表最后一项禁用「下移」');
  eq(last[0].upDisabled, false, '它的「上移」不禁用');
}

/* ── 4. 页码越界要收回来 ───────────────────────────────────────────── */
console.log('\n[4] 页码越界收敛');
{
  const { api, state } = makeHarness(ids(9));
  api.listPage.merch = 3;
  api.renderItemList('merch');
  eq(api.listPage.merch, 3, '9 项时第 3 页有效');

  // 删到 5 项（第 3 页不存在了）
  state.order.merch = ids(5);
  api.renderItemList('merch');
  eq(api.listPage.merch, 2, '缩到 5 项后第 3 页收敛为第 2 页');
  eq(state.built.slice(-1)[0].index, 4, '收敛后渲染的是第 5 项');

  state.order.merch = ids(2);
  api.renderItemList('merch');
  eq(api.listPage.merch, 1, '缩到 2 项后收敛为第 1 页');

  state.order.merch = [];
  api.renderItemList('merch');
  eq(api.listPage.merch, 1, '清空后页码是 1，不是 0');

  const { api: a2 } = makeHarness(ids(9));
  a2.listPage.merch = 99;
  a2.renderItemList('merch');
  eq(a2.listPage.merch, 3, '页码大于总页数时夹到最后一页');
  a2.listPage.merch = 0;
  a2.renderItemList('merch');
  eq(a2.listPage.merch, 1, '页码为 0 时夹到第 1 页');
}

/* ── 5. 新增 / 移动要跟着条目走 ────────────────────────────────────── */
console.log('\n[5] 新增与移动跨页');
{
  // 新增：停在第 1 页时点添加，必须跳到最后一页，且新块能被找到并聚焦
  const { api, state } = makeHarness(ids(8));
  api.listPage.merch = 1;
  api.renderItemList('merch');
  state.built.length = 0;
  api.addItem('merch');
  eq(state.order.merch.length, 9, '新增后 9 项');
  eq(api.listPage.merch, 3, '新增后跳到新条目所在的第 3 页');
  const newId = state.order.merch[8];
  const newBlock = state.hosts.merch.children.find((c) => c.dataset.itemId === newId);
  ok(!!newBlock, '新块在 DOM 里（否则 scrollIntoView / focus 会静默失效）');
  ok(newBlock && newBlock._scrolled === true, '新块被滚动到视野内');
  eq(state.status.slice(-1), ['已添加，刷新展示页查看'], '新增给出提示');

  // 上移跨页边界：第 5 项（index 4，第 2 页）上移成 index 3（第 1 页）
  const { api: a2, state: s2 } = makeHarness(ids(9));
  a2.listPage.merch = 2;
  a2.renderItemList('merch');
  a2.moveItem('merch', 'id5', -1);
  eq(s2.order.merch.slice(0, 5), ['id1', 'id2', 'id3', 'id5', 'id4'], '上移交换了两项');
  eq(a2.listPage.merch, 1, '上移跨页后跟到第 1 页');
  ok(!!s2.hosts.merch.children.find((c) => c.dataset.itemId === 'id5'), '被移动的条目在当前页可见');

  // 下移跨页边界：第 4 项（index 3，第 1 页）下移成 index 4（第 2 页）
  const { api: a3, state: s3 } = makeHarness(ids(9));
  a3.listPage.merch = 1;
  a3.renderItemList('merch');
  a3.moveItem('merch', 'id4', 1);
  eq(a3.listPage.merch, 2, '下移跨页后跟到第 2 页');
  ok(!!s3.hosts.merch.children.find((c) => c.dataset.itemId === 'id4'), '被移动的条目在新页可见');

  // 页内移动不该乱跳页
  const { api: a4 } = makeHarness(ids(9));
  a4.listPage.merch = 2;
  a4.renderItemList('merch');
  a4.moveItem('merch', 'id7', -1);
  eq(a4.listPage.merch, 2, '页内移动不改变当前页');

  // 越界移动被拒（第一项上移）
  const { api: a5, state: s5 } = makeHarness(ids(9));
  a5.renderItemList('merch');
  const before = s5.order.merch.slice();
  const savesBefore = s5.saves;
  a5.moveItem('merch', 'id1', -1);
  eq(s5.order.merch, before, '第一项上移无效果');
  eq(s5.saves, savesBefore, '无效移动不触发保存');

  // 删掉最后一页的唯一一项 → 页码收敛
  const { api: a6, state: s6 } = makeHarness(ids(9));
  a6.listPage.merch = 3;
  a6.renderItemList('merch');
  a6.removeItem('merch', 'id9');
  eq(s6.order.merch.length, 8, '删除后剩 8 项');
  eq(a6.listPage.merch, 2, '删掉最后一页唯一一项后落到第 2 页（不是停在空的第 3 页）');
  ok(s6.hosts.merch.children.filter((c) => c.dataset.itemBlock).length === 4, '第 2 页有 4 个块');
}

/* ── 6. 标题同步用 dataset 序号，而不是 DOM 位置 ────────────────────── */
console.log('\n[6] syncBlockTitle 的序号来源');
{
  const { api } = makeHarness(ids(9));
  const mkBlock = (globalIndex) => {
    const block = new El('div');
    block.dataset.itemBlock = 'merch';
    block.dataset.itemIndex = String(globalIndex);
    const title = new El('span');
    title.dataset.itemTitle = '';
    block.appendChild(title);
    const input = new El('input');
    input.dataset.field = 'home.id5.title';
    input.value = '  周边 A  ';
    block.appendChild(input);
    return { block, input, title };
  };

  const b1 = mkBlock(4);          // 第 2 页的第一项
  api.syncBlockTitle(b1.input);
  eq(b1.title.textContent, '05 · 周边 A', '第 2 页首项显示全局编号 05（不是 01）');

  const b2 = mkBlock(0);
  b2.input.value = '';
  api.syncBlockTitle(b2.input);
  eq(b2.title.textContent, '01 · 未命名', '空标题回落为「未命名」');

  const b3 = mkBlock(8);
  b3.input.value = '第九件';
  api.syncBlockTitle(b3.input);
  eq(b3.title.textContent, '09 · 第九件', '第 3 页的项显示 09');

  const b4 = mkBlock(4);
  b4.input.dataset.field = 'home.id5.image';   // 不是 .title
  api.syncBlockTitle(b4.input);
  eq(b4.title.textContent, '', '非标题字段不触发同步');

  // 源码层面的耦合断言：替身 buildItemBlock 遵守了契约，真实实现也必须遵守
  ok(/block\.dataset\.itemIndex = String\(index\);/.test(src), '真实 buildItemBlock 把全局 index 写进 dataset.itemIndex');
  ok(!/indexOf\.call\(block\.parentElement\.children/.test(src), 'syncBlockTitle 不再用 DOM 位置反推序号');
}

/* ── 7. 分页条本身 ─────────────────────────────────────────────────── */
console.log('\n[7] 分页条结构与文案');
{
  const { api } = makeHarness(ids(9));
  const bar = api.buildListPager('merch', 2, 3, 9);
  eq(bar.dataset.listPager, 'merch', '分页条记录了它属于哪个列表');
  const status = bar.children[0];
  eq(status.textContent, '共 09 项 · 第 02 / 03 页', '状态文案');
  eq(status.getAttribute('aria-live'), 'polite', '状态区是 aria-live');

  const controls = bar.children[1];
  const labels = controls.children.map((c) => c.textContent);
  eq(labels, ['← 上一页', '01', '02', '03', '下一页 →'], '3 页时页码全列');
  const cur = controls.children.filter((c) => c.getAttribute('aria-current') === 'page');
  eq(cur.length, 1, '只有一个当前页');
  eq(cur[0].textContent, '02', '当前页标记在 02 上');
  // 第 2 页：上一页→1、页码 1/2/3、下一页→3
  eq(controls.children.map((c) => c.dataset.listPage), ['1', '1', '2', '3', '3'], '每个按钮带目标页码');
  ok(controls.children.every((c) => c.tagName === 'BUTTON'), '页码都是真的 button（键盘可达）');
  ok(controls.children.every((c) => c.attrs.type === undefined || c.type === 'button'), 'button 都是 type=button（不会误提交表单）');
  ok(controls.children.every((c) => c.className === 'btn btn-sm'), '复用既有 .btn .btn-sm，没另造一套样式');

  const firstPage = api.buildListPager('merch', 1, 3, 9);
  eq(firstPage.children[1].children[0].disabled, true, '第 1 页禁用「上一页」');
  eq(firstPage.children[1].lastElementChild.disabled, false, '第 1 页不禁用「下一页」');
  const lastPage = api.buildListPager('merch', 3, 3, 9);
  eq(lastPage.children[1].children[0].disabled, false, '最后一页不禁用「上一页」');
  eq(lastPage.children[1].lastElementChild.disabled, true, '最后一页禁用「下一页」');

  eq(api.buildListPager('merch', 4, 7, 28).children[1].children.map((c) => c.textContent),
    ['← 上一页', '01', '02', '03', '04', '05', '06', '07', '下一页 →'], '7 页整列不省略');
  eq(api.buildListPager('merch', 1, 12, 48).children[1].children.map((c) => c.textContent),
    ['← 上一页', '01', '02', '…', '12', '下一页 →'], '12 页在第 1 页时收成省略号');
  eq(api.buildListPager('merch', 6, 12, 48).children[1].children.map((c) => c.textContent),
    ['← 上一页', '01', '…', '05', '06', '07', '…', '12', '下一页 →'], '12 页在中间时两侧都省略');
  eq(api.buildListPager('merch', 12, 12, 48).children[1].children.map((c) => c.textContent),
    ['← 上一页', '01', '…', '11', '12', '下一页 →'], '12 页在最后一页时收成省略号');
  const gaps = api.buildListPager('merch', 6, 12, 48).children[1].children.filter((c) => c.className === 'list-pager-gap');
  ok(gaps.every((g) => g.getAttribute('aria-hidden') === 'true'), '省略号对读屏隐藏');
  ok(gaps.length === 2, '连续省略只出一个「…」，不会连着堆好几个');
}

/* ── 8. 两个列表互不干扰 ───────────────────────────────────────────── */
console.log('\n[8] merch / archive 各自记页码');
{
  const { api, state } = makeHarness(ids(9));
  state.order.archive = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  api.listPage.merch = 3;
  api.listPage.archive = 2;
  api.renderItemList('merch');
  api.renderItemList('archive');
  eq(api.listPage.merch, 3, 'merch 停在第 3 页');
  eq(api.listPage.archive, 2, 'archive 停在第 2 页');
  const merchIds = state.hosts.merch.children.filter((c) => c.dataset.itemBlock).map((c) => c.dataset.itemId);
  const archiveIds = state.hosts.archive.children.filter((c) => c.dataset.itemBlock).map((c) => c.dataset.itemId);
  eq(merchIds, ['id9'], 'merch 第 3 页内容正确');
  eq(archiveIds, ['a5', 'a6'], 'archive 第 2 页内容正确');
  api.addItem('archive');
  eq(api.listPage.merch, 3, '给 archive 添加条目不影响 merch 的页码');
}

/* ── 结果 ───────────────────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(52));
console.log(passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('\n失败项：');
  failures.forEach((f) => console.log('  · ' + f));
  process.exitCode = 1;
}
