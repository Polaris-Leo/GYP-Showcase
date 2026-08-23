/**
 * /api/upload — 图片上传（EdgeOne Pages Function + Pages Blob）
 *
 * POST /api/upload            → 代理上传：请求体就是文件原始字节，函数校验后写入 Blob
 * POST /api/upload?direct=1   → 直传：返回一个预签名 PUT 地址，让浏览器把字节直接发给 Blob
 * OPTIONS                     → 探测支持的方法
 *
 * 两条路都要求已登录（会话 Cookie 或 X-Admin-Token），凭据口径与 /api/content 一致。
 * 成功后返回 { key, url }，url 形如 /img?key=img/<hash>.png，直接填进后台的「图片链接」即可。
 *
 * ── 为什么默认走代理上传，而不是文档推荐的直传 ──────────────────────────
 * 直传的好处是字节不经过函数，没有函数体积限制；代价是浏览器要往另一个域名发
 * 跨域 PUT，会先触发 CORS 预检。Blob 的签名地址是否返回可用的 CORS 响应头，
 * 文档没写，本地也没法验证——万一不返回，上传在浏览器里必然失败，而且是我这边
 * 改不了的。代理上传是同源请求，不存在这个变量，还顺带换来两件事：
 *   1) 服务端能真正**限制大小**（预签名地址签不进体积约束，服务端管不了）；
 *   2) 服务端能校验文件头，确认它真的是图片，而不是改了后缀的别的东西。
 * 所以代理是主路径，直传作为超过体积上限时的逃生口保留，并在 README 里注明未经验证。
 */

import { getStore } from '@edgeone/pages-blob';

const STORE_NAME = 'gyp-assets';
const KEY_PREFIX = 'img/';

/**
 * 代理上传的体积上限。
 * ⚠️ 4 MB 是保守估计，不是查到的官方数字：EdgeOne 没有公布函数请求体的硬上限。
 * 真实上限若更低，超过时会在到达这段代码之前就被平台拒掉（表现为网关错误而非
 * 这里的 413）。调大之前先用一个接近上限的文件实测。
 */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * 允许的图片类型 → 扩展名 + 文件头特征。
 *
 * **故意不收 SVG**：SVG 里可以写 <script>，而它会从本站同源加载，
 * 等于给自己开一个存储型 XSS 的入口。想要矢量图就先转成 PNG。
 */
const TYPES = {
  'image/png': { ext: 'png', sniff: (b) => match(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  'image/jpeg': { ext: 'jpg', sniff: (b) => match(b, [0xff, 0xd8, 0xff]) },
  'image/webp': { ext: 'webp', sniff: (b) => match(b, [0x52, 0x49, 0x46, 0x46]) && match(b, [0x57, 0x45, 0x42, 0x50], 8) },
  'image/gif': { ext: 'gif', sniff: (b) => match(b, [0x47, 0x49, 0x46, 0x38]) },
};

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
};

const json = (body, status = 200, extra) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

/* ── 会话校验 ──────────────────────────────────────────────────────────
 * ⚠️ 下面这几个函数是 functions/api/auth.js 的副本，**改一处必须改三处**
 * （auth.js / content.js / 这里）。不抽成共享模块的理由见 content.js 顶部：
 * EdgeOne 的函数目录按文件路由，非路由文件与跨目录 import 的行为没有官方示例
 * 可以印证，宁可复制也不赌。令牌形状与签名口径见 auth.js 顶部注释。
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

/* ── 工具 ────────────────────────────────────────────────────────────── */

/** 逐字节比对文件头 */
function match(bytes, sig, offset = 0) {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[offset + i] !== sig[i]) return false;
  return true;
}

const hex = (buf) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * 用内容哈希做键名，而不是原始文件名。三个好处：
 *   1) 键名只由内容决定 → 同一张图重复上传不会产生第二份，也不会互相覆盖出错；
 *   2) 内容变了键名必然变 → /img 那边可以放心宣布 immutable、缓存一年；
 *   3) 原始文件名里的中文、空格、路径分隔符全都不会进到键里，省掉一类转义问题。
 * 取前 32 位十六进制（128 bit），碰撞概率可以忽略，键名也短。
 */
async function contentKey(buf, ext) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return KEY_PREFIX + hex(digest).slice(0, 32) + '.' + ext;
}

/** 把 SDK 的错误翻译成有指向性的响应，尤其是「构建没装依赖」这一类 */
function blobError(e) {
  const code = (e && (e.code || e.name)) || '';
  const msg = (e && e.message) || String(e);
  if (/MissingProjectId|PAGES_PROJECT_ID/i.test(code + msg)) {
    return json({
      error: 'Blob 凭据未注入：项目 ID 为空。通常是构建阶段没有执行 npm install，' +
             '请在 Pages 控制台把「安装命令」设为 npm install 后重新部署。',
    }, 503);
  }
  if (/Quota/i.test(code)) return json({ error: 'Blob 容量已用满，请先删掉一些旧文件。' }, 507);
  if (/RateLimited/i.test(code)) return json({ error: '请求过于频繁，稍后再试。' }, 429);
  if (/InvalidStoreName/i.test(code)) return json({ error: 'Blob 存储桶名不合法：' + STORE_NAME }, 500);
  return json({ error: '写入 Blob 失败：' + msg }, 502);
}

async function handle(request, env) {
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
  }
  if (method !== 'POST') {
    return json({ error: '不支持的方法：' + method }, 405, { Allow: 'POST, OPTIONS' });
  }

  // 上传必须鉴权。这不是洁癖：签发地址或写入都不校验身份的话，
  // 任何人都能往这个桶里灌数据，把 1 GB 配额占满。
  const expected = env && env.ADMIN_TOKEN;
  if (!expected) {
    return json({ error: '服务端未设置 ADMIN_TOKEN，已拒绝上传。' }, 503);
  }
  const authed =
    (await verifySession(expected, readCookie(request, COOKIE_NAME))) ||
    safeEqual(request.headers.get('X-Admin-Token') || '', expected);
  if (!authed) {
    return json({ error: '未登录或会话已失效' }, 401);
  }

  const store = getStore(STORE_NAME);
  const direct = new URL(request.url).searchParams.get('direct') === '1';

  /* ── 直传：签发预签名 PUT 地址 ─────────────────────────────────────── */
  if (direct) {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: '请求格式有误，需要 JSON { contentType, sha256 }' }, 400);
    }
    const contentType = body && typeof body.contentType === 'string' ? body.contentType : '';
    const sha256 = body && typeof body.sha256 === 'string' ? body.sha256.toLowerCase() : '';
    const spec = TYPES[contentType];
    if (!spec) {
      return json({ error: '不支持的图片类型：' + (contentType || '（空）') + '。只接受 ' + Object.keys(TYPES).join(' / ') }, 415);
    }
    // 直传时字节不经过函数，服务端拿不到内容，只能让客户端把哈希算好带上来。
    // 这里只验形状——哈希对不对无从核实，所以键名的「内容即键名」保证在这条路上
    // 是**信任客户端**的。反正上传要登录，能走到这一步的都是管理员。
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      return json({ error: 'sha256 必须是 64 位十六进制' }, 400);
    }
    const key = KEY_PREFIX + sha256.slice(0, 32) + '.' + spec.ext;
    try {
      const signed = await store.createUploadUrl(key, { expireSeconds: 600, contentType });
      return json({
        ok: true,
        mode: 'direct',
        key,
        uploadUrl: signed.url,
        expiresAt: signed.expiresAt,
        // 签名把方法、键名、有效期、Content-Type 都绑住了，PUT 时四者必须完全一致，
        // 否则会被拒。所以把该带的头一起回给前端，别让它自己猜。
        putHeaders: { 'Content-Type': contentType },
        url: '/img?key=' + encodeURIComponent(key),
      });
    } catch (e) {
      return blobError(e);
    }
  }

  /* ── 代理上传：函数收下字节再写入 ─────────────────────────────────── */
  const contentType = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const spec = TYPES[contentType];
  if (!spec) {
    return json({ error: '不支持的图片类型：' + (contentType || '（空）') + '。只接受 ' + Object.keys(TYPES).join(' / ') }, 415);
  }

  // 先看声明长度，能在读取整个请求体之前就挡掉明显超标的
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return json({ error: '文件过大（超过 ' + Math.round(MAX_BYTES / 1024 / 1024) + ' MB）', maxBytes: MAX_BYTES }, 413);
  }

  let buf;
  try {
    buf = await request.arrayBuffer();
  } catch (e) {
    return json({ error: '请求体读取失败' }, 400);
  }
  // 声明长度可以撒谎，实际长度才是准的，两道都要查
  if (buf.byteLength === 0) return json({ error: '空文件' }, 400);
  if (buf.byteLength > MAX_BYTES) {
    return json({ error: '文件过大（超过 ' + Math.round(MAX_BYTES / 1024 / 1024) + ' MB）', maxBytes: MAX_BYTES }, 413);
  }

  // 只信文件头，不信 Content-Type：声明是 image/png 的可以是任何东西。
  // /img 会按扩展名回 Content-Type，所以这里放进去的必须真的是那个格式。
  const head = new Uint8Array(buf.slice(0, 16));
  if (!spec.sniff(head)) {
    return json({ error: '文件内容不是 ' + contentType + '（文件头对不上），可能是改了后缀' }, 415);
  }

  const key = await contentKey(buf, spec.ext);
  try {
    // 不用 onlyIfNew：键名由内容决定，重复上传写的是同样的字节，
    // 覆盖是幂等的，比多一次「已存在」的分支省事也少一个出错点。
    await store.set(key, buf, {
      // 一年 + immutable，配合内容哈希键名。SDK 默认是 max-age=0，
      // 对不可变对象来说太浪费，必须显式覆盖。
      cacheControl: 'public, max-age=31536000, immutable',
    });
  } catch (e) {
    return blobError(e);
  }

  return json({
    ok: true,
    mode: 'proxy',
    key,
    bytes: buf.byteLength,
    url: '/img?key=' + encodeURIComponent(key),
  });
}

// EdgeOne Pages Functions 约定：具名导出 onRequest，不要加 default 导出。
export async function onRequest(context) {
  return handle(context.request, context.env || {});
}
