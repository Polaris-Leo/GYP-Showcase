/**
 * blob-upload-test.js —— 校验上传/读取路径里那些「能在本地验」的部分
 *
 * Blob 本身验不了：凭据是构建阶段注入的，本地拿不到。但上传接口里真正容易出错的
 * 两块逻辑跟 Blob 无关，可以离线验，而且**必须**验：
 *
 *   1) 文件头识别（TYPES + match）——它是 /img 敢按扩展名回 Content-Type 的全部依据。
 *      判错一个格式，就会有一张图带着错误的 Content-Type 被公开提供。
 *   2) 键名正则（KEY_RE）——它是 /img 的访问控制，不是清洗。放宽一点，整个桶就变成
 *      公开只读接口。所以要专门喂各种越权形状进去，确认全部被挡。
 *
 * 两段代码都**从源码里切出来求值**，不在这里抄一份：抄了就会有一天两边不一致，
 * 而不一致的那天测试还是全绿。切法与 choice-add-test.js 一致。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const UPLOAD_SRC = fs.readFileSync(path.join(ROOT, 'functions/api/upload.js'), 'utf8');
const IMG_SRC = fs.readFileSync(path.join(ROOT, 'functions/img.js'), 'utf8');

/** 从 src 里切出 [startMarker, endMarker) 之间的片段，切不到就直接报错退出 */
function slice(src, label, startMarker, endMarker) {
  const from = src.indexOf(startMarker);
  if (from < 0) throw new Error(`切不到 ${label} 的起点：${startMarker}`);
  const to = src.indexOf(endMarker, from + startMarker.length);
  if (to < 0) throw new Error(`切不到 ${label} 的终点：${endMarker}`);
  return src.slice(from, to + endMarker.length);
}

// match() 在源码里定义在 TYPES 之后，但 TYPES 的箭头函数直到调用时才用到它，
// 所以拼接顺序无关；用函数声明的提升也能兜住。
const matchSrc = slice(UPLOAD_SRC, 'match()', 'function match(bytes, sig, offset = 0) {', '\n}');
const typesSrc = slice(UPLOAD_SRC, 'TYPES', 'const TYPES = {', '\n};');
const keyReSrc = slice(IMG_SRC, 'KEY_RE', 'const KEY_RE = /', '/;');

const { TYPES, KEY_RE, match } = new Function(
  `${matchSrc}\n${typesSrc}\n${keyReSrc}\nreturn { TYPES, KEY_RE, match };`
)();

let passed = 0;
let failed = 0;
const results = [];

function group(name) {
  results.push({ group: name });
}
function ok(name, cond) {
  if (cond) {
    passed++;
    results.push({ name, pass: true });
  } else {
    failed++;
    results.push({ name, pass: false });
  }
}

/* ── 真实文件头样本 ───────────────────────────────────────────────────
 * PNG 用仓库里现成的真图（读前 16 字节），其余三种按规范手写最小头部。
 * 手写的不是"我猜的"：
 *   JPEG  FF D8 FF        —— SOI 后紧跟一个 marker 的第一字节
 *   GIF   47 49 46 38     —— "GIF8"，同时覆盖 87a 与 89a
 *   WebP  52 49 46 46 <4 字节长度> 57 45 42 50 —— RIFF 容器，长度字段任意
 */
/* 优先拿一个真实 PNG 的头 16 字节：手写的文件头如果本身就写错了，用它测等于自欺，
 * 真实文件是一份独立印证。但**本仓库刻意不存放任何图片文件**（见 .gitignore 与 §3），
 * 所以干净克隆里必然找不到——那就退回按规范拼一个：8 字节签名 + IHDR 块头，
 * 这正是任何合法 PNG 的前 16 字节。退回时会在报告里注明，避免「以为验过真实文件」。 */
let pngSampleSource = '规范拼装';
const realPng = (() => {
  const candidates = ['RECON/shot-boost.png', 'image-7.png', 'RECON/dd-open.png'];
  for (const rel of candidates) {
    const p = path.join(ROOT, rel);
    if (fs.existsSync(p)) {
      pngSampleSource = rel;
      return new Uint8Array(fs.readFileSync(p).subarray(0, 16));
    }
  }
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG 签名
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // 长度 13 + "IHDR"
  ]);
})();

const bytes = (...b) => new Uint8Array(b);
const pad = (arr, n = 16) => {
  const out = new Uint8Array(n);
  out.set(arr.subarray ? arr.subarray(0, n) : arr.slice(0, n));
  return out;
};

const jpeg = pad(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46));
const gif87 = pad(bytes(0x47, 0x49, 0x46, 0x38, 0x37, 0x61));
const gif89 = pad(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61));
const webp = pad(bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20));

const sniff = (mime, b) => TYPES[mime].sniff(b);

/* ── 1. 允许的类型集合 ─────────────────────────────────────────────── */
group('允许的类型集合');
ok('恰好四种类型', Object.keys(TYPES).length === 4);
ok('收 png/jpeg/webp/gif',
  ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].every((t) => TYPES[t]));
// 这条是安全断言，不是风格断言：SVG 能内嵌 <script>，同源提供等于存储型 XSS
ok('不收 image/svg+xml', TYPES['image/svg+xml'] === undefined);
ok('不收 image/bmp（/img 没有对应 MIME 映射）', TYPES['image/bmp'] === undefined);
ok('扩展名都是小写且无点', Object.values(TYPES).every((v) => /^[a-z0-9]+$/.test(v.ext)));
// jpeg 的扩展名必须是 jpg：img.js 的 MIME 表用 jpg 作键，写成 jpeg 会读不出 Content-Type
ok('image/jpeg 的扩展名是 jpg', TYPES['image/jpeg'].ext === 'jpg');

/* ── 2. 正样本：真头部必须被认出来 ─────────────────────────────────── */
group('正样本');
ok('真 PNG 被认出', sniff('image/png', realPng));
ok('JPEG/JFIF 被认出', sniff('image/jpeg', jpeg));
ok('GIF87a 被认出', sniff('image/gif', gif87));
ok('GIF89a 被认出', sniff('image/gif', gif89));
ok('WebP 被认出', sniff('image/webp', webp));

/* ── 3. 负样本：交叉与伪造必须被挡 ─────────────────────────────────── */
group('交叉误判');
// 这一组是核心：声明成 A 却拿 B 的字节，必须一个都不通过。
// 通过了就意味着一张 GIF 能以 image/png 存进去，然后被 /img 当 PNG 提供。
const samples = { 'image/png': realPng, 'image/jpeg': jpeg, 'image/webp': webp, 'image/gif': gif89 };
for (const declared of Object.keys(TYPES)) {
  for (const actual of Object.keys(samples)) {
    if (declared === actual) continue;
    ok(`声明 ${declared} 实为 ${actual} → 拒`, !sniff(declared, samples[actual]));
  }
}

group('伪造与畸形');
// 只对了 RIFF、后面不是 WEBP —— 这是 WAV/AVI 的头，最容易漏的一个
ok('RIFF 但不是 WEBP（如 WAV）→ 拒',
  !sniff('image/webp', pad(bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))));
ok('PNG 签名少最后一字节 → 拒',
  !sniff('image/png', pad(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x00))));
ok('JPEG 只有 FF D8 → 拒', !sniff('image/jpeg', pad(bytes(0xff, 0xd8))));
ok('GIF7（不存在的版本号仍以 GIF8 判定）→ 拒',
  !sniff('image/gif', pad(bytes(0x47, 0x49, 0x46, 0x37, 0x39, 0x61))));
ok('SVG 文本冒充 PNG → 拒',
  !sniff('image/png', pad(new Uint8Array(Buffer.from('<svg xmlns="http:')))));
ok('HTML 文本冒充 GIF → 拒',
  !sniff('image/gif', pad(new Uint8Array(Buffer.from('<!DOCTYPE html>')))));
ok('全零 → 全部拒', Object.keys(TYPES).every((t) => !sniff(t, new Uint8Array(16))));

group('长度边界');
// 服务端只截前 16 字节喂进来，短文件不能让 match 抛错或越界读成 true
ok('空数组不崩且拒', Object.keys(TYPES).every((t) => !sniff(t, new Uint8Array(0))));
ok('1 字节不崩且拒', Object.keys(TYPES).every((t) => !sniff(t, bytes(0x89))));
// WebP 的第二段特征在 offset 8，长度不足时必须靠长度检查挡住而不是读到 undefined
ok('WebP 只有 8 字节（够 RIFF 不够 WEBP）→ 拒',
  !sniff('image/webp', bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0)));
ok('match 的 offset 越界返回 false', match(bytes(1, 2, 3), [1], 5) === false);
ok('match 正常匹配', match(bytes(1, 2, 3), [2, 3], 1) === true);

/* ── 4. 键名正则：这是访问控制 ─────────────────────────────────────── */
group('键名正则 · 放行');
const h32 = 'a'.repeat(32);
for (const ext of ['png', 'jpg', 'webp', 'gif']) {
  ok(`放行 img/<hash>.${ext}`, KEY_RE.test(`img/${h32}.${ext}`));
}
ok('放行混合十六进制', KEY_RE.test('img/0123456789abcdef0123456789abcdef.png'));

group('键名正则 · 拦截');
// 每一条都对应一种「把 /img 变成任意读」的走法
ok('拦截无前缀', !KEY_RE.test(`${h32}.png`));
ok('拦截别的前缀', !KEY_RE.test(`draft/${h32}.png`));
ok('拦截目录穿越', !KEY_RE.test(`img/../secret/${h32}.png`));
ok('拦截嵌套路径', !KEY_RE.test(`img/sub/${h32}.png`));
ok('拦截通配', !KEY_RE.test('img/*'));
ok('拦截空键', !KEY_RE.test(''));
ok('拦截仅前缀', !KEY_RE.test('img/'));
ok('拦截哈希偏短', !KEY_RE.test(`img/${'a'.repeat(31)}.png`));
ok('拦截哈希偏长', !KEY_RE.test(`img/${'a'.repeat(33)}.png`));
ok('拦截大写十六进制', !KEY_RE.test(`img/${'A'.repeat(32)}.png`));
ok('拦截非十六进制字符', !KEY_RE.test(`img/${'g'.repeat(32)}.png`));
ok('拦截无扩展名', !KEY_RE.test(`img/${h32}`));
ok('拦截未收录的扩展名 .svg', !KEY_RE.test(`img/${h32}.svg`));
ok('拦截未收录的扩展名 .jpeg', !KEY_RE.test(`img/${h32}.jpeg`));
ok('拦截双扩展名', !KEY_RE.test(`img/${h32}.png.svg`));
ok('拦截尾随查询串', !KEY_RE.test(`img/${h32}.png?x=1`));
// 正则必须两端锚定，否则「含有合法片段」的键就能过
ok('拦截前置垃圾（正则须以 ^ 锚定）', !KEY_RE.test(`x/img/${h32}.png`));
ok('拦截后置换行（正则须以 $ 锚定且不靠 . 通配）', !KEY_RE.test(`img/${h32}.png\n`));

/* ── 5. 两个文件的扩展名集合必须一致 ─────────────────────────────── */
group('跨文件一致性');
// upload.js 生成的扩展名若不在 img.js 的正则里，图片存进去却读不出来；
// 反过来 img.js 多认一个扩展名，则是放行了上传接口永远不会产生的键名。
const uploadExts = Object.values(TYPES).map((v) => v.ext).sort();
const imgExts = keyReSrc.match(/\(([a-z|]+)\)/)[1].split('|').sort();
ok('upload.js 的扩展名集合 == img.js 正则里的集合 (' + uploadExts.join(',') + ')',
  JSON.stringify(uploadExts) === JSON.stringify(imgExts));

// MIME 映射也要覆盖到每一个扩展名，否则 /img 会回 Content-Type: undefined
const mimeSrc = slice(IMG_SRC, 'MIME', 'const MIME = {', '\n};');
const MIME = new Function(`${mimeSrc}\nreturn MIME;`)();
ok('img.js 的 MIME 表覆盖全部扩展名', uploadExts.every((e) => typeof MIME[e] === 'string'));
ok('MIME 表没有多余项', Object.keys(MIME).sort().join(',') === uploadExts.join(','));
// 反向对照：upload.js 里 image/png → png，img.js 里 png → image/png，必须是双射
ok('MIME 表与 TYPES 互为反函数',
  Object.entries(TYPES).every(([mime, v]) => MIME[v.ext] === mime));

/* ── 6. 键名生成 ↔ 键名校验 ↔ ETag 推导 必须首尾相接 ───────────────
 * 这三者之间是两个手写的偏移量在支撑：contentKey 取哈希前 32 位，
 * img.js 用 key.slice(4, 36) 把哈希从键名里抠回来当 ETag。'img/' 是 4 个字符，
 * 数错一位不会报错，只会让 ETag 变成一段错位的字符串——304 从此永不命中，
 * 或者更糟：不同的图算出同一个 ETag。所以必须真跑一遍闭环。
 */
group('键名生成 ↔ 校验 ↔ ETag 闭环');
const hexSrc = slice(UPLOAD_SRC, 'hex', 'const hex = (buf) =>', ".join('');");
const contentKeySrc = slice(UPLOAD_SRC, 'contentKey()', 'async function contentKey(buf, ext) {', '\n}');
const prefixSrc = slice(UPLOAD_SRC, 'KEY_PREFIX', "const KEY_PREFIX = '", "';");
const contentKey = new Function(
  `${prefixSrc}\n${hexSrc}\n${contentKeySrc}\nreturn contentKey;`
)();
// img.js 里那行 ETag 推导，同样从源码切出来，不在这里重写偏移量
const etagSrc = slice(IMG_SRC, 'ETag 推导', "const etag = '\"' + key.slice(", ";");
const etagOf = new Function('key', `${etagSrc}\nreturn etag;`);

(async () => {
  const payloads = [realPng, jpeg, webp, gif89, new Uint8Array([1, 2, 3])];
  const keys = [];
  for (let i = 0; i < payloads.length; i++) {
    const ext = ['png', 'jpg', 'webp', 'gif', 'png'][i];
    keys.push(await contentKey(payloads[i].buffer.slice(payloads[i].byteOffset, payloads[i].byteOffset + payloads[i].byteLength), ext));
  }

  ok('生成的键名全部能通过 KEY_RE', keys.every((k) => KEY_RE.test(k)));
  ok('不同内容生成不同键名', new Set(keys).size === keys.length);

  const again = await contentKey(new Uint8Array([1, 2, 3]).buffer, 'png');
  ok('相同内容生成相同键名（幂等，可去重）', again === keys[4]);

  // ETag 必须恰好等于键名里的哈希段——偏移错一位这里就红
  for (const k of keys) {
    const hash = k.slice(k.indexOf('/') + 1, k.lastIndexOf('.'));
    ok(`ETag == 键名哈希段 (${k.slice(4, 12)}…)`, etagOf(k) === '"' + hash + '"');
  }
  ok('ETag 是 32 位十六进制加引号', keys.every((k) => /^"[0-9a-f]{32}"$/.test(etagOf(k))));
  ok('不同键名的 ETag 互不相同', new Set(keys.map(etagOf)).size === keys.length);

  report();
})();

/* ── 输出 ─────────────────────────────────────────────────────────── */
function report() {
  let n = 0;
  for (const r of results) {
    if (r.group) {
      n++;
      console.log(`\n[${n}] ${r.group}`);
    } else {
      console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`);
    }
  }
  console.log(`\nPNG 样本来源：${pngSampleSource}`);
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

