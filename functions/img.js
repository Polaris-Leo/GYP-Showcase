/**
 * /img — 从 Pages Blob 读图并对外提供（EdgeOne Pages Function）
 *
 * GET|HEAD /img?key=img/<32位哈希>.<png|jpg|webp|gif>
 *
 * ── 为什么必须有这么一个函数 ──────────────────────────────────────────
 * Pages Blob 不给对象公开直链，取内容只能走 SDK，也就是只能走函数。所以每一次
 * 图片请求都要过一次函数——官方文档也正因此**不建议**把 Blob 当公开图床。
 * 这里用两件事把代价压到接近于零：
 *   1) 键名是内容哈希，对象天然不可变 → 可以宣布 max-age=31536000, immutable；
 *   2) 路由**故意不放在 /api/ 下面**——edgeone.json 给 /api/* 设了 cacheTtl: 0，
 *      放进去等于每次都回源，正好把上一条的收益全部抵消掉。
 * 于是稳定状态下 CDN 直接命中，函数只在首次和缓存过期时被调用。
 *
 * 这个路由是公开的，不鉴权：它服务的就是展示页上的图。正因为公开，键名校验必须严
 * ——见下面 KEY_RE 的说明。
 */

import { getStore } from '@edgeone/pages-blob';

const STORE_NAME = 'gyp-assets';

/**
 * 只放行 /api/upload 自己生成的那种键名。
 *
 * ⚠️ 这条正则是访问控制，不是输入清洗，别放宽。它把 /img 限制成「只能读 img/ 前缀下
 * 的内容哈希对象」，所以即便以后往同一个桶里放了别的东西（草稿、备份、任何私有数据），
 * 也不会因为存在这个公开路由而被人凭键名读出去。放宽成 `img/*` 或允许任意键，
 * 就等于把整个桶变成公开只读接口。
 */
const KEY_RE = /^img\/[0-9a-f]{32}\.(png|jpg|webp|gif)$/;

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

// 图本身不可变，但「这个键不存在」这个结论可能只是刚上传还没同步，
// 所以 404 只缓存很短一会儿，不要让一次未命中黏住。
const MISS_CACHE = 'public, max-age=30';
const HIT_CACHE = 'public, max-age=31536000, immutable';

const fail = (status, text) =>
  new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': MISS_CACHE },
  });

async function handle(request) {
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'GET, HEAD, OPTIONS' } });
  }
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('不支持的方法：' + method, {
      status: 405,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD, OPTIONS' },
    });
  }

  const key = new URL(request.url).searchParams.get('key') || '';
  const m = KEY_RE.exec(key);
  if (!m) return fail(400, '键名不合法');

  const contentType = MIME[m[1]];
  // 键名前半段就是内容的 SHA-256 前缀，它本身即是最强的 ETag——
  // 内容变了键名必然变，不需要再去 getMetadata 多问一次。
  const etag = '"' + key.slice(4, 36) + '"';

  const inm = request.headers.get('If-None-Match');
  if (inm && inm.includes(etag.slice(1, -1))) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': HIT_CACHE } });
  }

  const store = getStore(STORE_NAME);

  let body;
  try {
    body = await store.get(key, { type: 'stream' });
    // 默认读的是带 CDN 缓存的域名（eventual）。刚上传的对象可能还没同步过去，
    // 于是第一次会读到 null。只在这种情况下再用强一致域名补一次——
    // 不能一开始就用 strong，那会让每次命中都绕开 Blob 自己的缓存。
    if (body == null) {
      body = await store.get(key, { type: 'stream', consistency: 'strong' });
    }
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (/MissingProjectId|PAGES_PROJECT_ID/i.test((e && (e.code || e.name)) + msg)) {
      return fail(503, 'Blob 凭据未注入，请确认构建阶段执行了 npm install');
    }
    return fail(502, '读取失败：' + msg);
  }

  if (body == null) return fail(404, '图片不存在');

  const headers = {
    'Content-Type': contentType,
    'Cache-Control': HIT_CACHE,
    ETag: etag,
    // 这里回的是图片字节，任何情况下都不该被当成 HTML/脚本解析
    'X-Content-Type-Options': 'nosniff',
  };

  if (method === 'HEAD') {
    // HEAD 不能带体。流已经开了，取消它，别把连接吊着。
    if (body && typeof body.cancel === 'function') {
      try { await body.cancel(); } catch (_) { /* 取消失败无所谓，响应照发 */ }
    }
    return new Response(null, { status: 200, headers });
  }

  // 兜一手：SDK 的 type:'stream' 万一没给回真正的 ReadableStream，
  // 直接塞进 Response 会得到一个面目不清的 500。宁可退化成一次性读完。
  if (body && typeof body.getReader !== 'function' && typeof body !== 'string') {
    try {
      const buf = await store.get(key, { type: 'arrayBuffer', consistency: 'strong' });
      if (buf == null) return fail(404, '图片不存在');
      return new Response(buf, { status: 200, headers });
    } catch (e) {
      return fail(502, '读取失败：' + ((e && e.message) || String(e)));
    }
  }

  return new Response(body, { status: 200, headers });
}

// EdgeOne Pages Functions 约定：具名导出 onRequest，不要加 default 导出。
export async function onRequest(context) {
  return handle(context.request);
}
