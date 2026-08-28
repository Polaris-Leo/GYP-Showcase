// 回归：固定选项的自绘下拉在 hydrateForm 回填时必须同步按钮标签。
// 真实故障：select 已变成 sale，展开列表也正确高亮「收藏企划」，
// 但未派发 input 事件使 .dd-value 停留在初始默认项「舰长礼物」。
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, '..', 'assets', 'admin.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function between(start, end) {
  const a = source.indexOf(start);
  if (a < 0) throw new Error('无法从 admin.js 提取测试目标，未找到起点：' + start);
  const b = source.indexOf(end, a + start.length);
  if (b < 0) throw new Error('无法从 admin.js 提取测试目标，未找到终点：' + end);
  return source.slice(a, b);
}

const hydrateSource = between('function hydrateForm(scope) {', '\nfunction resolveKey(key) {');
const resolveSource = between('function resolveKey(key) {', '\nfunction updateValue(key, value) {');
const syncSource = between('function syncDropdown(sel) {', '\n// 「改过」的标记');

const classes = new Set();
const label = { textContent: '舰长礼物', classList: { toggle() {} } };
const wrap = {
  classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
  querySelector(selector) {
    if (selector === '[data-dd-value]') return label;
    throw new Error('未预期的下拉查询：' + selector);
  }
};

const options = [
  { value: 'gift', textContent: '舰长礼物' },
  { value: 'sale', textContent: '收藏企划' }
];
let selectedIndex = 0;
const select = {
  tagName: 'SELECT',
  dataset: { field: 'home.merch-sky.type', type: 'text' },
  classList: { contains(name) { return classes.has(name); } },
  options,
  closest(selector) { return selector === '.dropdown' ? wrap : null; },
  get selectedIndex() { return selectedIndex; },
  get value() { return options[selectedIndex] ? options[selectedIndex].value : ''; },
  set value(value) { selectedIndex = options.findIndex((option) => option.value === value); }
};

const document = { querySelectorAll(selector) {
  if (selector === '[data-field]') return [select];
  throw new Error('未预期的表单查询：' + selector);
} };
const data = { home: { 'merch-sky': { type: 'sale' } } };
const sandbox = {
  document,
  data,
  metaParts: () => [],
  setChoiceSelect() {},
  setYmSelect() {},
  updatePreview() {},
  syncImageControl() {}
};

const run = new Function('sandbox', 'with (sandbox) {' +
  resolveSource + '\n' + syncSource + '\n' + hydrateSource + '\nreturn hydrateForm;\n}');
const hydrateForm = run(sandbox);
hydrateForm(document);

if (select.value !== 'sale') {
  throw new Error('回填后的原生 select 应为 sale，实际为 ' + JSON.stringify(select.value));
}
if (label.textContent !== '收藏企划') {
  throw new Error('回填后的自绘下拉应显示「收藏企划」，实际为「' + label.textContent + '」');
}

console.log('PASS fixed select hydration mirrors the selected option label');
