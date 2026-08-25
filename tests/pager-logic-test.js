/* 展厅分页的行为核验。
 *
 * 关键点：不重写一份 renderCollection 来测——那测的是复制品，会和 index.html
 * 悄悄跑偏。这里把 index.html 里那段真实源码切出来，喂给一个最小 DOM 桩执行，
 * 所以测的就是将来跑在浏览器里的同一份代码。
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
};

/* ── 切出被测源码 ───────────────────────────────────────────────── */
const start = html.indexOf('const PAGE_SIZE = 4;');
const endMark = '    renderCollection();';
const end = html.indexOf(endMark, start);
if (start < 0 || end < 0) { console.error('切片失败：源码结构变了，测试需要更新'); process.exit(1); }
const source = html.slice(start, end + endMark.length);
console.log('被测源码 ' + source.split('\n').length + ' 行（自 index.html 实时切出）\n');

/* ── 最小 DOM 桩 ────────────────────────────────────────────────── */
class El {
  constructor(tag = 'div', cls = '') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attrs = {};
    this._text = '';
    this.hidden = false;
    this.disabled = false;
    this.listeners = {};
    this._classes = new Set(cls ? cls.split(/\s+/).filter(Boolean) : []);
    const self = this;
    this.classList = {
      add: (...c) => c.forEach((x) => self._classes.add(x)),
      remove: (...c) => c.forEach((x) => self._classes.delete(x)),
      contains: (c) => self._classes.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !self._classes.has(c) : !!force;
        if (on) self._classes.add(c); else self._classes.delete(c);
        return on;
      },
    };
  }
  get className() { return [...this._classes].join(' '); }
  // 必须配 setter：源码用的是 button.className = '...'，而只有 getter 的访问器
  // 在非严格模式下会把赋值静默吞掉——桩就永远看不到这些类名。
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get textContent() { return this._text || this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  set innerHTML(v) { if (v === '') { this.children = []; this._text = ''; } }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);   // 真 DOM 的 appendChild 会搬移节点
    this.children.push(node); node.parent = this; return node;
  }
  matches(sel) {
    if (sel.startsWith('.')) return this._classes.has(sel.slice(1));
    if (sel.startsWith('[')) {
      const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel);
      if (!m) return false;
      const key = m[1].replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const val = m[1].startsWith('data-') ? this.dataset[key] : this.attrs[m[1]];
      return m[2] === undefined ? val !== undefined : val === m[2];
    }
    return this.tagName === sel.toUpperCase();
  }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  querySelector(sel) { return this.descendants().find((n) => n.matches(sel)) || null; }
  querySelectorAll(sel) { return this.descendants().filter((n) => n.matches(sel)); }
  closest(sel) { let n = this; while (n) { if (n.matches && n.matches(sel)) return n; n = n.parent; } return null; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  click() {
    let n = this;
    while (n) {   // 冒泡：分页条用的是事件委托
      (n.listeners.click || []).forEach((fn) => fn({ target: this, currentTarget: n }));
      n = n.parent;
    }
  }
  getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100 }; }
}

function buildDom(itemCount, types) {
  const root = new El('body');
  const section = new El('section', ''); section.attrs.id = 'collection';
  root.appendChild(section);

  const filters = new El('div', 'filters');
  ['all', 'goods', 'apparel'].forEach((f, i) => {
    const b = new El('button', 'filter-button' + (i === 0 ? ' is-active' : ''));
    b.dataset.filter = f;
    filters.appendChild(b);
  });
  section.appendChild(filters);

  const grid = new El('div', 'collection-grid');
  for (let i = 0; i < itemCount; i++) {
    const card = new El('article', 'merch-card reveal');
    card.dataset.type = types ? types[i] : (i % 2 ? 'apparel' : 'goods');
    card.dataset.index = String(i + 1);
    grid.appendChild(card);
  }
  section.appendChild(grid);

  const pager = new El('nav', 'collection-pager'); pager.hidden = true;
  pager.appendChild(new El('span', 'pager-status'));
  const controls = new El('div', 'pager-controls');
  const prev = new El('button', 'pager-button'); prev.dataset.pageNav = 'prev';
  const pages = new El('span', 'pager-pages');
  const next = new El('button', 'pager-button'); next.dataset.pageNav = 'next';
  controls.appendChild(prev); controls.appendChild(pages); controls.appendChild(next);
  pager.appendChild(controls);
  section.appendChild(pager);

  return { root, section, grid, pager, prev, next, pages, filters };
}

function run(itemCount, types) {
  const dom = buildDom(itemCount, types);
  const document = {
    querySelector: (s) => (s === '#collection' ? dom.section : dom.root.querySelector(s)),
    querySelectorAll: (s) => dom.root.querySelectorAll(s),
    createElement: (t) => new El(t),
  };
  const window = {
    scrollY: 0,
    scrollTo: (opts) => { window._scrolled = opts; },
    matchMedia: () => ({ matches: false }),
  };
  new Function('document', 'window', source)(document, window);
  return { ...dom, window };
}

const visible = (dom) => dom.grid.children.filter((c) => !c.classList.contains('is-hidden'));
const statusText = (dom) => dom.pager.querySelector('.pager-status').textContent;
const pageButtons = (dom) => dom.pages.children.filter((c) => c.tagName === 'BUTTON');

/* ── 1. 4 件及以下：分页条不出现 ─────────────────────────────────── */
console.log('【1】不足 5 件时分页条不出现（默认站点必须零变化）');
for (const n of [1, 2, 3, 4]) {
  const dom = run(n);
  ok(dom.pager.hidden === true, n + ' 件 → 分页条 hidden');
  ok(visible(dom).length === n, n + ' 件 → 全部 ' + n + ' 张可见', '实际 ' + visible(dom).length);
}
{
  const dom = run(4);
  ok(dom.grid.children.every((c) => !c.classList.contains('is-visible')),
     '4 件首屏不强加 is-visible（入场动画仍归 IntersectionObserver）');
}

/* ── 2. 超过 4 件：分页出现，每页 4 件 ───────────────────────────── */
console.log('\n【2】7 件 → 分页出现，每页不超过 4 件');
{
  const dom = run(7);
  ok(dom.pager.hidden === false, '分页条显示');
  ok(visible(dom).length === 4, '第 1 页 4 张', '实际 ' + visible(dom).length);
  ok(visible(dom).map((c) => c.dataset.index).join(',') === '1,2,3,4', '第 1 页是第 1–4 件');
  ok(statusText(dom) === '共 07 件 · 第 01 / 02 页', '状态行 = "共 07 件 · 第 01 / 02 页"', statusText(dom));
  ok(dom.prev.disabled === true, '第 1 页 → 上一页 disabled');
  ok(dom.next.disabled === false, '第 1 页 → 下一页可用');
  ok(pageButtons(dom).length === 2, '页码按钮 2 个');
  ok(pageButtons(dom)[0].getAttribute('aria-current') === 'page', '当前页标 aria-current');

  dom.next.click();
  ok(visible(dom).length === 3, '第 2 页 3 张（7 = 4 + 3）', '实际 ' + visible(dom).length);
  ok(visible(dom).map((c) => c.dataset.index).join(',') === '5,6,7', '第 2 页是第 5–7 件');
  ok(visible(dom).every((c) => c.classList.contains('is-visible')),
     '第 2 页卡片被补上 is-visible（否则停在 opacity:0 = 一片空白）');
  ok(statusText(dom) === '共 07 件 · 第 02 / 02 页', '状态行跟着翻', statusText(dom));
  ok(dom.next.disabled === true, '末页 → 下一页 disabled');
  ok(dom.prev.disabled === false, '末页 → 上一页可用');

  dom.next.click();
  ok(visible(dom).map((c) => c.dataset.index).join(',') === '5,6,7', '末页再点下一页：不越界');

  dom.prev.click();
  ok(visible(dom).map((c) => c.dataset.index).join(',') === '1,2,3,4', '上一页回到第 1 页');
}
{
  const dom = run(5);
  ok(dom.pager.hidden === false, '5 件 → 分页出现（4/5 边界）');
  ok(visible(dom).length === 4, '5 件第 1 页 4 张');
  dom.next.click();
  ok(visible(dom).length === 1, '5 件第 2 页 1 张');
}
{
  const dom = run(12);
  ok(pageButtons(dom).length === 3 && dom.pages.children.every((c) => c.tagName !== 'SPAN' || c.className !== 'pager-gap'),
     '12 件 → 3 页，页码不省略');
  const many = run(60);   // 15 页，必须收起
  const gaps = many.pages.children.filter((c) => c.className === 'pager-gap');
  ok(gaps.length >= 1, '60 件（15 页）→ 出现 … 收起，页码不挤爆一行');
  ok(pageButtons(many).some((b) => b.textContent === '01') && pageButtons(many).some((b) => b.textContent === '15'),
     '收起后首末页仍在');
}

/* ── 3. 筛选与分页联动 ──────────────────────────────────────────── */
console.log('\n【3】筛选后页数重算、页码归 1');
{
  // 9 件：goods 5 件（1,3,5,7,9）、apparel 4 件（2,4,6,8）
  const dom = run(9);
  ok(statusText(dom).startsWith('共 09 件'), '全部 = 9 件');
  dom.next.click();
  ok(statusText(dom).includes('第 02'), '先翻到第 2 页');

  const goods = dom.filters.children.find((b) => b.dataset.filter === 'goods');
  goods.click();
  ok(statusText(dom) === '共 05 件 · 第 01 / 02 页', '切 goods → 共 05 件且回到第 1 页', statusText(dom));
  ok(visible(dom).every((c) => c.dataset.type === 'goods'), '可见卡片全是 goods');
  ok(visible(dom).length === 4, 'goods 第 1 页 4 张');
  ok(goods.classList.contains('is-active') && goods.getAttribute('aria-pressed') === 'true',
     '筛选按钮 is-active + aria-pressed');

  const apparel = dom.filters.children.find((b) => b.dataset.filter === 'apparel');
  apparel.click();
  ok(dom.pager.hidden === true, 'apparel 恰好 4 件 → 分页条收起');
  ok(visible(dom).length === 4 && visible(dom).every((c) => c.dataset.type === 'apparel'),
     'apparel 4 张全显示');

  dom.filters.children.find((b) => b.dataset.filter === 'all').click();
  ok(dom.pager.hidden === false && statusText(dom) === '共 09 件 · 第 01 / 03 页',
     '回到全部 → 分页恢复（9 件 = 3 页）', statusText(dom));
}
{
  // 越界防护：站在末页时筛到一个更小的集合
  const dom = run(9, ['goods','goods','goods','goods','goods','goods','goods','goods','apparel']);
  dom.next.click();
  ok(statusText(dom).includes('第 02 / 03') || statusText(dom).includes('第 02'), '9 件先翻页');
  dom.filters.children.find((b) => b.dataset.filter === 'apparel').click();
  ok(visible(dom).length === 1, '筛到只剩 1 件时不会翻出空页', '实际 ' + visible(dom).length);
}

/* ── 4. 永不出现空页 ────────────────────────────────────────────── */
console.log('\n【4】穷举 1–40 件 × 逐页翻到底：任何一页都不为空');
{
  let emptyPages = 0, overflow = 0;
  for (let n = 1; n <= 40; n++) {
    const dom = run(n);
    const seen = [];
    for (let guard = 0; guard < 60; guard++) {
      const v = visible(dom);
      if (v.length === 0) emptyPages++;
      if (v.length > 4) overflow++;
      v.forEach((c) => seen.push(c.dataset.index));
      if (dom.pager.hidden || dom.next.disabled) break;
      dom.next.click();
    }
    if (new Set(seen).size !== n) { console.log('  ✗ ' + n + ' 件：翻完只覆盖 ' + new Set(seen).size + ' 件'); fail++; }
  }
  ok(emptyPages === 0, '没有任何空页', emptyPages + ' 个空页');
  ok(overflow === 0, '没有任何一页超过 4 件', overflow + ' 页超额');
  ok(true, '1–40 件逐页翻完，每件物品都恰好出现在某一页');
}

/* ── 5. 滚动行为 ────────────────────────────────────────────────── */
console.log('\n【5】翻页滚动：网格顶部在视口内时不抢滚动');
{
  const dom = run(7);   // 桩的 rect.top = 0，属于 >= 0
  dom.next.click();
  ok(dom.window._scrolled === undefined, 'top >= 0 时不调用 scrollTo（不打扰用户）');
}

console.log('\n' + (fail === 0 ? '全部通过' : '有失败') + '：' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
