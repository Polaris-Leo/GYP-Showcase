/* 前后端两份 collectBlobKeys 的等价性核验。
 *
 * admin.js 的弹窗要说出「会删掉几张图」，就得在客户端算一遍差集；真正执行删除的是
 * functions/api/content.js。两份实现一跑偏，弹窗上的数字就是假的。
 *
 * 所以这里把**两个真实文件**里的实现都切出来，喂同一批输入，逐个断言结果一致。
 * 不重写任何一方——重写就等于把要防的那个 bug 也复制一遍。
 */

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');

/* ── 服务端实现 ─────────────────────────────────────────────────────── */
const serverSrc = fs.readFileSync(path.join(SITE, 'functions', 'api', 'content.js'), 'utf8');
const serverBody = serverSrc
  .replace(/^import\s+\{[^}]*\}\s+from\s+'@edgeone\/pages-blob';\s*$/m, '')
  .replace(/^export\s+(async\s+function|function|const)/gm, '$1');
if (!/function collectBlobKeys/.test(serverBody)) {
  console.error('content.js 里找不到 collectBlobKeys'); process.exit(1);
}
const serverCollect = new Function(
  'getStore', serverBody + '\n;return collectBlobKeys;'
)(() => { throw new Error('不该用到 Blob'); });

/* ── 客户端实现 ─────────────────────────────────────────────────────── */
const adminSrc = fs.readFileSync(path.join(SITE, 'assets', 'admin.js'), 'utf8');
const start = adminSrc.indexOf('const BLOB_KEY_RE');
// 终点用 collectBlobKeys 自己的收尾 `\n}\n`，而不是它后面某段代码的注释头 ——
// 那个块被移到文件靠前处（选择弹窗和清单面板都要用它，而最早的调用发生在
// 启动时的 bindFields），后面跟着的东西随时会变。
const endMark = '\n  walk(root, 0);\n  return keys;\n}\n';
const endAt = adminSrc.indexOf(endMark, start);
const end = endAt < 0 ? -1 : endAt + endMark.length;
if (start < 0 || end < 0) {
  console.error('admin.js 切片失败：结构变了，测试需要更新'); process.exit(1);
}
const clientBody = adminSrc.slice(start, end);
if (!/function collectBlobKeys/.test(clientBody)) {
  console.error('admin.js 切片里没有 collectBlobKeys'); process.exit(1);
}
// 切片必须只含这两样东西：正则 + 收集器。多切进来别的代码（fetch、document…）
// 会在 new Function 里炸，或者更糟 —— 悄悄改变被测行为。
if (/fetch\(|document\.|addEventListener/.test(clientBody)) {
  console.error('admin.js 切片范围过大，含无关代码：\n' + clientBody.slice(0, 400)); process.exit(1);
}
const clientCollect = new Function(clientBody + '\n;return collectBlobKeys;')();

/* ── 正则字面量必须逐字符相同 ───────────────────────────────────────── */
const reOf = (src) => {
  const m = src.match(/const BLOB_KEY_RE = (.+);/);
  return m ? m[1] : null;
};

let pass = 0, fail = 0;
const ok = (cond, label, got) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (got !== undefined ? ' → ' + JSON.stringify(got) : '')); }
};

console.log('\n【1】键名正则字面量一致');
{
  const a = reOf(serverSrc), b = reOf(adminSrc);
  ok(a !== null && b !== null, '两边都能取到 BLOB_KEY_RE 字面量', { a, b });
  ok(a === b, 'BLOB_KEY_RE 逐字符相同', { server: a, admin: b });
}

/* ── 输入语料 ───────────────────────────────────────────────────────── */
const H = (c) => 'img/' + c.repeat(32) + '.png';
const K1 = H('a'), K2 = 'img/' + 'b'.repeat(32) + '.jpg', K3 = 'img/' + 'c'.repeat(32) + '.webp';
const K4 = 'img/' + 'd'.repeat(32) + '.gif';
const HDSLB = 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png';
const ref = (k) => '/img?key=' + k;

const corpus = [
  ['空对象', {}],
  ['null', null],
  ['纯字符串根', ref(K1)],
  ['相对地址', { home: { a: ref(K1) } }],
  ['绝对地址', { home: { a: 'https://gyp.example.com/img?key=' + K1 } }],
  ['编码过的键', { home: { a: '/img?key=img%2F' + 'a'.repeat(32) + '.png' } }],
  ['裸键名', { home: { a: K1 } }],
  ['四种扩展名', { home: { a: ref(K1), b: ref(K2), c: ref(K3), d: ref(K4) } }],
  ['外链不算', { home: { a: HDSLB } }],
  ['哈希不合法', { home: { a: '/img?key=img/xyz.png' } }],
  ['大写十六进制不认', { home: { a: '/img?key=img/' + 'A'.repeat(32) + '.png' } }],
  ['svg 不在白名单', { home: { a: '/img?key=img/' + 'a'.repeat(32) + '.svg' } }],
  ['31 位哈希', { home: { a: '/img?key=img/' + 'a'.repeat(31) + '.png' } }],
  ['33 位哈希', { home: { a: '/img?key=img/' + 'a'.repeat(33) + '.png' } }],
  ['数组里', { home: { order: ['x', ref(K1), 'y'] } }],
  ['嵌套数组', { home: { order: [['x', ref(K2)], [ref(K3)]] } }],
  ['跨 home/archive', { home: { a: ref(K1) }, archive: { b: ref(K2) } }],
  ['同键重复出现', { home: { a: ref(K1), b: ref(K1), c: K1 } }],
  ['一串里两个键', { home: { a: ref(K1) + ' ' + ref(K2) } }],
  ['数字/布尔/null 混杂', { home: { a: 1, b: true, c: null, d: ref(K1) } }],
  ['半截百分号', { home: { a: '/img?key=%E4%B8' } }],
  ['半截百分号 + 有效键', { home: { a: '%E4%B8 ' + ref(K1) } }],
  ['深度 7', { a: { b: { c: { d: { e: { f: { g: ref(K1) } } } } } } }],
  ['深度 10（都该截断）', { a: { b: { c: { d: { e: { f: { g: { h: { i: { j: ref(K1) } } } } } } } } } }],
  ['查询串还有别的参数', { home: { a: '/img?key=' + K1 + '&v=2' } }],
  ['空字符串', { home: { a: '' } }],
];

console.log('\n【2】两份实现在 ' + corpus.length + ' 组输入上结果一致');
for (const [label, input] of corpus) {
  const s = [...serverCollect(input).keys].sort();
  const c = [...clientCollect(input)].sort();
  ok(s.join('|') === c.join('|'), label, { server: s, client: c });
}

console.log('\n【3】随机语料对撞');
{
  // 用固定序列拼装，不引入随机源，保证失败可复现
  const pieces = [ref(K1), ref(K2), K3, HDSLB, '', 'img/zz.png', '/img?key=img%2F' + 'b'.repeat(32) + '.jpg',
                  '/img?key=' + K4 + '&x=1', 'A'.repeat(32), '%%%'];
  let mismatch = 0;
  for (let i = 0; i < 400; i++) {
    // 按 i 决定形状，覆盖对象/数组/深浅各种组合
    const p = (n) => pieces[(i * 7 + n * 13) % pieces.length];
    const input = {
      home: { a: p(0), b: [p(1), { c: p(2) }], d: { e: { f: p(3) } } },
      archive: { g: p(4), order: [p(5), p(6), [p(7), p(8)]] },
    };
    const s = [...serverCollect(input).keys].sort().join('|');
    const c = [...clientCollect(input)].sort().join('|');
    if (s !== c) { mismatch++; if (mismatch === 1) console.log('    首个不一致 i=' + i, { s, c }); }
  }
  ok(mismatch === 0, '400 组拼装输入全部一致', mismatch);
}

console.log('\n【4】弹窗数量 = 服务端真实删除量');
{
  // 模拟一次导入：当前内容 → 合并后的新内容
  const cases = [
    ['备份少了一张图', { home: { a: ref(K1), b: ref(K2) } }, { home: { a: ref(K1) } }, [K2]],
    ['备份换成外链', { home: { a: ref(K1) } }, { home: { a: HDSLB } }, [K1]],
    ['同图两处，只去一处', { home: { a: ref(K1), b: ref(K1) } }, { home: { a: ref(K1) } }, []],
    ['跨页共用，只去首页', { home: { a: ref(K1) }, archive: { z: ref(K1) } }, { home: {}, archive: { z: ref(K1) } }, []],
    ['两处都去', { home: { a: ref(K1) }, archive: { z: ref(K1) } }, { home: {}, archive: {} }, [K1]],
    ['备份多了一张', { home: { a: ref(K1) } }, { home: { a: ref(K1), b: ref(K2) } }, []],
    ['全部清空', { home: { a: ref(K1), b: ref(K2), c: ref(K3) } }, { home: {} }, [K1, K2, K3]],
  ];
  for (const [label, cur, next, expect] of cases) {
    // 弹窗算法（admin.js 里的差集）
    const cBefore = clientCollect(cur), cAfter = clientCollect(next);
    const shown = [...cBefore].filter((k) => !cAfter.has(k)).sort();
    // 服务端算法
    const sBefore = serverCollect(cur).keys, sAfter = serverCollect(next).keys;
    const deleted = [...sBefore].filter((k) => !sAfter.has(k)).sort();
    ok(shown.join('|') === expect.sort().join('|') && deleted.join('|') === shown.join('|'),
       label + '：弹窗报 ' + shown.length + ' 张 = 服务端删 ' + deleted.length + ' 张',
       { shown, deleted, expect });
  }
}

console.log('\n【5】/g 正则没有状态残留');
{
  // BLOB_KEY_RE 是模块级 const 且带 /g。String.match 不使用 lastIndex，所以是安全的，
  // 但这是个经典陷阱：一旦有人改成 exec/test 循环就会开始漏匹配。
  // 【2】【3】只做两边对撞，两边同样有状态时会一起通过——所以这条必须单独验。
  const input = { home: { x: ref(K1), y: ref(K2) }, archive: { z: ref(K3) } };
  const sRuns = new Set(), cRuns = new Set();
  for (let i = 0; i < 5; i++) {
    sRuns.add([...serverCollect(input).keys].sort().join('|'));
    cRuns.add([...clientCollect(input)].sort().join('|'));
  }
  ok(sRuns.size === 1 && [...sRuns][0].split('|').length === 3,
     'content.js 连续调用结果稳定', [...sRuns]);
  ok(cRuns.size === 1 && [...cRuns][0].split('|').length === 3,
     'admin.js 连续调用结果稳定', [...cRuns]);
}

console.log('\n' + (fail === 0 ? '全部通过：' : '有失败：') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
