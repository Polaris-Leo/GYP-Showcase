/**
 * /api/blobs — 已上传图片的清单与删除（EdgeOne Pages Function + Pages Blob）
 *
 * GET    /api/blobs            → { blobs: [{ key, etag, url }], count, total, truncated }
 * DELETE /api/blobs?key=…      → { ok: true }
 *
 * 两个方法都要求已登录。列表虽然只暴露键名（键名本来就能通过 /img 公开读到），
 * 但**枚举**是另一回事：不鉴权就等于把「这个站存了哪些东西」整份交出去。
 *
 * 存在的理由是配额：Blob 有容量上限，而内容哈希键名意味着换一张图不会顶掉旧的那张，
 * 旧对象会一直留着。没有一个地方能看见和清掉它们，桶迟早会满。
 *
 * 后台界面：「数据」页最下方的「Blob 图片」面板（列表 + 删除），
 * 以及图片字段的「选择图片」弹窗（只读取列表）。
 */

import { getStore } from '@edgeone/pages-blob';

const STORE_NAME = 'gyp-assets';
const KEY_PREFIX = 'img/';

// 与 functions/img.js 里的 KEY_RE 保持一致：只认 /api/upload 生成的那种键名。
// 删除也照这条限制，免得这个接口变成能抹掉桶里任意对象的工具。
const KEY_RE = /^img\/[0-9a-f]{32}\.(png|jpg|webp|gif)$/;

// 一次最多返回这么多。**注意 store.list() 没有 limit 选项**（官方文档里可用的只有
// prefix / directories / paginate / cursor / consistency），默认行为是把所有分页
// 聚合成一个数组。所以上限只能在这里自己截，截之前先记下真实总数 —— 不然
// truncated 就是猜的。
const LIST_LIMIT = 500;

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
};

const json = (body, status = 200, extra) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

/* ── 会话校验 ──────────────────────────────────────────────────────────
 * ⚠️ 同样是 functions/api/auth.js 的副本，**改一处要改四处**
 * （auth.js / content.js / upload.js / 这里）。不抽共享模块的理由见 content.js 顶部。
 */
const COOKIE_NAME = 'gyp_admin';
const enc = new TextEncoder();

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySession(secret, token) {
  if (!secret || !token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp)) return false;
  if (!safeEqual(sig, await hmac(secret, exp))) return false;
  return Number(exp) > Date.now();
}

function readCookie(request, name) {
  const raw = request.headers.get('Cookie');
  if (!raw) return '';
  for (const part of raw.split(';')) {
    const s = part.trim();
    if (s.startsWith(name + '=')) return s.slice(name.length + 1);
  }
  return '';
}

function blobError(e) {
  const code = (e && (e.code || e.name)) || '';
  const msg = (e && e.message) || String(e);
  if (/MissingProjectId|PAGES_PROJECT_ID/i.test(code + msg)) {
    return json({
      error: 'Blob 凭据未注入：项目 ID 为空。通常是构建阶段没有执行 npm install，' +
             '请在 Pages 控制台把「安装命令」设为 npm install 后重新部署。',
    }, 503);
  }
  if (/RateLimited/i.test(code)) return json({ error: '请求过于频繁，稍后再试。' }, 429);
  return json({ error: '操作失败：' + msg }, 502);
}

async function handle(request, env) {
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'GET, DELETE, OPTIONS' } });
  }
  if (method !== 'GET' && method !== 'DELETE') {
    return json({ error: '不支持的方法：' + method }, 405, { Allow: 'GET, DELETE, OPTIONS' });
  }

  const expected = env && env.ADMIN_TOKEN;
  if (!expected) {
    return json({ error: '服务端未设置 ADMIN_TOKEN，已拒绝访问。' }, 503);
  }
  const authed =
    (await verifySession(expected, readCookie(request, COOKIE_NAME))) ||
    safeEqual(request.headers.get('X-Admin-Token') || '', expected);
  if (!authed) {
    return json({ error: '未登录或会话已失效' }, 401);
  }

  const store = getStore(STORE_NAME);

  if (method === 'GET') {
    try {
      // 只传 prefix：limit 不是合法选项，传了会被忽略，留着会让人误以为服务端截过了。
      const res = await store.list({ prefix: KEY_PREFIX });
      const all = res && res.blobs ? res.blobs : [];
      // 键名固定 36 字符，理论上不会有杂项；但桶是可以被别的途径写入的，
      // 列表里混进不认识的键名时不要展示 —— 前端会拿它去拼 /img，那条路也认同一条正则。
      const clean = all.filter((b) => b && KEY_RE.test(b.key));
      const page = clean.slice(0, LIST_LIMIT);
      return json({
        blobs: page.map((b) => ({
          key: b.key,
          // etag 是 list 唯一多给的字段：没有 size，也没有上传时间。
          // 所以前端排不出「最新上传」，只能按键名排（见 admin.js 的说明）。
          etag: b.etag,
          url: '/img?key=' + encodeURIComponent(b.key),
        })),
        count: page.length,
        total: clean.length,
        // 真实总数超了才叫截断；原来写的是 length >= LIMIT，桶里刚好 500 个
        // 完整列表也会被报成「可能还有」。
        truncated: clean.length > LIST_LIMIT,
        limit: LIST_LIMIT,
        // 被过滤掉的非法键名数量，方便发现桶里有别的东西
        skipped: all.length - clean.length,
      });
    } catch (e) {
      return blobError(e);
    }
  }

  // DELETE
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!KEY_RE.test(key)) {
    return json({ error: '键名不合法，只能删除 ' + KEY_PREFIX + ' 下由上传接口生成的对象' }, 400);
  }
  try {
    await store.delete(key);
  } catch (e) {
    return blobError(e);
  }
  // 删掉的对象在 /img 上还会被 CDN 缓存一年（键名声明了 immutable）。
  // 这不是 bug：内容哈希键名不会被复用，所以缓存里那份不会张冠李戴，
  // 只是「已删除」不会立刻在公开路径上生效。真要立刻消失得去控制台刷缓存。
  return json({ ok: true, key, note: '对象已删除；CDN 上可能仍有缓存副本' });
}

// EdgeOne Pages Functions 约定：具名导出 onRequest，不要加 default 导出。
export async function onRequest(context) {
  return handle(context.request, context.env || {});
}
