/* 图片自动回收的行为核验（/api/content POST → 删除不再被引用的 Blob 对象）。
 *
 * 和分页那次一样：不重写一份 sweepUnreferenced 来测——那测的是复制品，会和
 * content.js 悄悄跑偏。这里把 content.js 的真实源码读进来，只去掉 import/export
 * 两个模块语法，注入一个 getStore 桩，然后**真的调用 handle()**。
 * 所以测到的不只是集合差算法，还包括「先写 KV 再删 Blob」这个顺序本身。
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'functions', 'api', 'content.js');
const raw = fs.readFileSync(SRC, 'utf8');

// 只做模块语法的最小改写，逻辑一个字不动
const stripped = raw
  .replace(/^import\s+\{[^}]*\}\s+from\s+'@edgeone\/pages-blob';\s*$/m, '')
  .replace(/^export\s+(async\s+function|function|const)/gm, '$1');
if (/^\s*(import|export)\s/m.test(stripped)) {
  console.error('还残留模块语法，切片规则需要更新'); process.exit(1);
}
if (!/function sweepUnreferenced/.test(stripped) || !/function collectBlobKeys/.test(stripped)) {
  console.error('没找到回收函数，源码结构变了'); process.exit(1);
}

/** 用注入的 getStore 桩实例化真实源码 */
function load(getStore) {
  const factory = new Function(
    'getStore',
    stripped + '\n;return { handle, collectBlobKeys, sweepUnreferenced };'
  );
  return factory(getStore);
}

const TOKEN = 'test-admin-token';

/** 假 KV：记录调用顺序，可以按需让 put 失败 */
function fakeKV(initial, opts = {}) {
  const calls = [];
  return {
    calls,
    store: initial,
    async get() { calls.push('kv.get'); if (opts.getThrows) throw new Error('KV 读失败'); return this.store; },
    async put(k, v) {
      calls.push('kv.put');
      if (opts.putThrows) throw new Error('KV 写失败');
      this.store = v;
    },
  };
}

/** 假 Blob store：记录每次 delete，可以按需抛错 */
function fakeStore(calls, opts = {}) {
  return {
    async delete(key) {
      calls.push('blob.delete:' + key);
      if (opts.deleteThrows) throw new Error('Blob 删除失败');
    },
    // GC 绝不该扫桶（会误删「上传了还没保存」的图），出现即失败
    async list() { calls.push('blob.list'); return { blobs: [] }; },
    async set() { calls.push('blob.set'); },
  };
}

/** 走完整 handle()：POST 一份新内容，返回响应体 + 调用时序 */
async function save(prevContent, nextContent, opts = {}) {
  const calls = [];
  const kv = fakeKV(prevContent === undefined ? null : prevContent, opts);
  // 让 kv 的调用也进同一条时序，才能验证顺序
  const kvTraced = {
    get: async (...a) => { calls.push('kv.get'); if (opts.getThrows) throw new Error('KV 读失败'); return kv.store; },
    put: async (k, v) => {
      calls.push('kv.put');
      if (opts.putThrows) throw new Error('KV 写失败');
      kv.store = v;
    },
  };
  const getStore = () => {
    if (opts.getStoreThrows) throw new Error('MissingProjectId');
    return fakeStore(calls, opts);
  };
  const { handle } = load(getStore);
  const request = new Request('https://example.com/api/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': TOKEN },
    body: JSON.stringify(nextContent),
  });
  const res = await handle(request, { ADMIN_TOKEN: TOKEN, GYP_CONTENT: kvTraced });
  let body = null;
  try { body = await res.json(); } catch (_) {}
  return { status: res.status, body, calls, stored: kv.store };
}

const deletions = (calls) =>
  calls.filter((c) => c.startsWith('blob.delete:')).map((c) => c.slice('blob.delete:'.length));

let pass = 0, fail = 0;
function ok(cond, label, got) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (got !== undefined ? ' → ' + JSON.stringify(got) : '')); }
}

const K1 = 'img/' + 'a'.repeat(32) + '.png';
const K2 = 'img/' + 'b'.repeat(32) + '.jpg';
const K3 = 'img/' + 'c'.repeat(32) + '.webp';
const HDSLB = 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png';
const ref = (k) => '/img?key=' + k;
const home = (obj) => JSON.stringify({ home: obj });

(async () => {

console.log('\n【1】键名提取');
{
  const { collectBlobKeys } = load(() => fakeStore([]));
  const g = (o) => [...collectBlobKeys(o).keys].sort();

  ok(g({ a: ref(K1) })[0] === K1, '相对地址 /img?key=…');
  ok(g({ a: 'https://gyp.example.com/img?key=' + K1 })[0] === K1, '绝对地址');
  ok(g({ a: '/img?key=img%2F' + 'a'.repeat(32) + '.png' })[0] === K1, 'encodeURIComponent 编码过的值');
  ok(g({ a: K1 })[0] === K1, '裸键名');
  ok(g({ a: HDSLB }).length === 0, '外链 hdslb 不被当成 Blob 键');
  ok(g({ a: '/img?key=img/xyz.png' }).length === 0, '哈希不合法的键名不认');
  ok(g({ a: '/img?key=img/' + 'a'.repeat(32) + '.svg' }).length === 0, '扩展名不在白名单的不认');
  ok(g({ home: { x: ref(K1) }, archive: { order: ['q', ref(K2)] } }).join() === [K1, K2].sort().join(),
     '跨 home/archive、穿透数组');
  ok(collectBlobKeys({ a: { b: { c: { d: { e: { f: { g: { h: { i: { j: ref(K1) } } } } } } } } } }).truncated === true,
     '超过深度上限会报 truncated');
}

console.log('\n【2】集合差：只有彻底不再被引用才删');
{
  const r = await save(home({ p: ref(K1), q: ref(K2) }), { home: { p: ref(K1) } });
  ok(r.status === 200 && r.body.ok === true, '保存成功');
  ok(deletions(r.calls).join() === K2, '移除的那张被删，仍在用的不动', deletions(r.calls));
  ok(r.body.gc && r.body.gc.deleted.join() === K2, '响应体带回回收结果', r.body.gc);
}
{
  // 同一张图被两处引用（内容哈希键名的必然结果），只删掉一处引用
  const r = await save(home({ p: ref(K1), q: ref(K1) }), { home: { p: ref(K1) } });
  ok(deletions(r.calls).length === 0, '同图两处引用，删掉一处 → 不删对象', deletions(r.calls));
  ok(r.body.gc === undefined, '无事可做时不带 gc 字段');
}
{
  // 跨页面共用：首页移除，历史页还在用
  const prev = JSON.stringify({ home: { p: ref(K1) }, archive: { z: ref(K1) } });
  const r = await save(prev, { home: {}, archive: { z: ref(K1) } });
  ok(deletions(r.calls).length === 0, '首页移除但历史页仍引用 → 不删', deletions(r.calls));
}
{
  const prev = JSON.stringify({ home: { p: ref(K1) }, archive: { z: ref(K1) } });
  const r = await save(prev, { home: {}, archive: {} });
  ok(deletions(r.calls).join() === K1, '两处都移除 → 删', deletions(r.calls));
}
{
  // 换图：新旧键名不同，旧的该走
  const r = await save(home({ p: ref(K1) }), { home: { p: ref(K3) } });
  ok(deletions(r.calls).join() === K1, '换成另一张图 → 旧图被删', deletions(r.calls));
}
{
  const r = await save(home({ p: ref(K1) }), { home: { p: HDSLB } });
  ok(deletions(r.calls).join() === K1, '换成外链 → 旧 Blob 被删', deletions(r.calls));
}
{
  const r = await save(home({ p: HDSLB }), { home: { p: ref(K1) } });
  ok(deletions(r.calls).length === 0, '外链换成 Blob → 不删任何东西', deletions(r.calls));
}

console.log('\n【3】顺序与失败隔离');
{
  const r = await save(home({ p: ref(K1) }), { home: {} });
  const iPut = r.calls.indexOf('kv.put');
  const iDel = r.calls.findIndex((c) => c.startsWith('blob.delete:'));
  ok(r.calls.indexOf('kv.get') < iPut, '先读旧快照，再写（写完就无从知道删了哪些图）');
  ok(iPut >= 0 && iDel > iPut, '先写 KV，再删 Blob', r.calls);
}
{
  // KV 写失败：一个字节都不许删
  const r = await save(home({ p: ref(K1) }), { home: {} }, { putThrows: true });
  ok(r.status === 502, 'KV 写失败仍返回 502');
  ok(deletions(r.calls).length === 0, 'KV 写失败 → 绝不删图（否则图没了而线上还在引用）', r.calls);
}
{
  // 旧内容读不出来：不猜，什么都不删
  const r = await save(home({ p: ref(K1) }), { home: {} }, { getThrows: true });
  ok(r.status === 200 && r.body.ok === true, '读旧内容失败不影响保存');
  ok(deletions(r.calls).length === 0, '拿不到可信旧快照 → 不回收', r.calls);
}
{
  // 首次保存，KV 里本来是空的
  const r = await save(null, { home: { p: ref(K1) } });
  ok(r.status === 200 && deletions(r.calls).length === 0, '首次保存无旧快照 → 不回收');
}
{
  // 旧数据是坏 JSON
  const r = await save('{不是 JSON', { home: {} });
  ok(r.status === 200 && r.body.ok === true && deletions(r.calls).length === 0,
     '旧数据是坏 JSON → 保存照常、不回收');
}
{
  // Blob 不可用（构建没跑 npm install 那一类）
  const r = await save(home({ p: ref(K1) }), { home: {} }, { getStoreThrows: true });
  ok(r.status === 200 && r.body.ok === true, 'Blob 不可用时保存仍然成功');
  ok(r.body.gc && r.body.gc.pending === 1 && /Blob 不可用/.test(r.body.gc.error),
     '如实报出「没删掉、原因是 Blob 不可用」', r.body.gc);
}
{
  // 删除本身失败
  const r = await save(home({ p: ref(K1), q: ref(K2) }), { home: {} }, { deleteThrows: true });
  ok(r.status === 200 && r.body.ok === true, '删除失败不把保存拖成失败');
  ok(r.body.gc.failed.length === 2 && r.body.gc.deleted.length === 0, '失败的键如实列出', r.body.gc);
}
{
  const r = await save(home({ p: ref(K1) }), { home: {} });
  ok(JSON.parse(r.stored).home.p === undefined, '新内容确实写进了 KV');
}

console.log('\n【4】绝不扫桶 / 上限');
{
  const r = await save(home({ p: ref(K1) }), { home: {} });
  ok(!r.calls.includes('blob.list'),
     '从不调用 store.list —— 否则会把「上传了还没保存」的图当垃圾删掉', r.calls);
}
{
  // 60 张图全部移除：删 50，剩下的明确报出来，不静默截断
  const many = {};
  for (let i = 0; i < 60; i++) many['f' + i] = ref('img/' + String(i).padStart(32, '0') + '.png');
  const r = await save(home(many), { home: {} });
  ok(deletions(r.calls).length === 50, '单次最多删 50 个', deletions(r.calls).length);
  ok(r.body.gc.pending === 10, '超出上限的部分报 pending=10，不静默丢弃', r.body.gc.pending);
}

console.log('\n【5】非 POST 路径不受影响');
{
  const { handle } = load(() => fakeStore([]));
  const kv = { get: async () => home({ p: ref(K1) }), put: async () => {} };
  const res = await handle(new Request('https://e.com/api/content'), { ADMIN_TOKEN: TOKEN, GYP_CONTENT: kv });
  const body = await res.json();
  ok(res.status === 200 && body.home.p === ref(K1), 'GET 照常返回内容');
}
{
  const { handle } = load(() => fakeStore([]));
  const kv = { get: async () => null, put: async () => {} };
  const res = await handle(
    new Request('https://e.com/api/content', {
      method: 'POST', headers: { 'X-Admin-Token': 'wrong' }, body: '{}',
    }),
    { ADMIN_TOKEN: TOKEN, GYP_CONTENT: kv }
  );
  ok(res.status === 401, '未授权的 POST 仍然 401（回收不在鉴权之前发生）');
}

console.log('\n' + (fail === 0 ? '全部通过：' : '有失败：') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);

})();
