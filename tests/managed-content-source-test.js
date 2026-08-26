/* 公开页面物品只能从管理端配置加载：不允许 HTML / 内联脚本保留可回退的默认条目。 */
'use strict';

const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..');
const indexSrc = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const archiveSrc = fs.readFileSync(path.join(SITE, 'history-archive.html'), 'utf8');
function sliceBeforeScript(src, file) {
  const marker = src.search(/<script\b/i);
  if (marker < 0) throw new Error(file + ' 缺少 <script> 标记，无法提取静态 HTML 区域');
  return src.slice(0, marker);
}
const indexMarkup = sliceBeforeScript(indexSrc, 'index.html');
const archiveMarkup = sliceBeforeScript(archiveSrc, 'history-archive.html');

const failures = [];
let passed = 0;
function ok(condition, label) {
  if (condition) { passed++; console.log('  ✓ ' + label); }
  else { failures.push(label); console.log('  ✗ ' + label); }
}

console.log('公开物品内容只由管理端配置');
ok(!/<article class="merch-card\b/.test(indexMarkup), '首页 HTML 不内置周边卡片');
ok(/const merchandise = \{\};/.test(indexSrc), '首页弹窗详情不内置默认物品');
ok(/if \(!Array\.isArray\(order\)\) order = \[\];/.test(indexSrc), '首页缺少后台顺序时不回退固定物品');
ok(!/<article class="archive-item\b/.test(archiveMarkup), '历史展厅 HTML 不内置列表条目');
ok(!/<article class="archive-grid-card\b/.test(archiveMarkup), '历史展厅 HTML 不内置表格条目');
ok(/const archiveDetails = \{\};/.test(archiveSrc), '历史展厅弹窗详情不内置默认物品');
ok(/if \(!Array\.isArray\(order\)\) \{\s*order = \[\];\s*\}/.test(archiveSrc), '历史展厅缺少后台顺序时不回退固定物品');
ok(/<div class="pagination"[^>]*hidden/.test(archiveMarkup), '历史展厅初始不显示固定页数');
ok(/pagination\.hidden = listItems\.length <= getActivePageSize\(\);/.test(archiveSrc), '历史展厅页码只按后台生成的条目数显示');
ok(/archiveSummaryCount\.textContent = pad2\(order\.length\);/.test(archiveSrc), '历史展厅摘要数量只由后台顺序数组更新');

console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) process.exitCode = 1;
