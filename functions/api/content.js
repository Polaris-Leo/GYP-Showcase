/**
 * /api/content — 站点内容读写接口（EdgeOne Pages Function）
 *
 * GET  /api/content   → 返回内容 JSON（KV 为空时返回 {}，展示页会退回 HTML 内置默认值）
 * POST /api/content   → 写入内容 JSON，需要请求头 X-Admin-Token 与环境变量 ADMIN_TOKEN 匹配
 *
 * 需要在 Pages 项目里配置：
 *   1) KV 绑定，变量名 GYP_CONTENT（与下面的 KV_BINDING 一致）
 *   2) 环境变量 ADMIN_TOKEN = 管理口令。**未设置时一律拒绝写入**，避免后台裸奔。
 *
 * POST 成功后还会顺手回收 Blob 里不再被引用的图片，见下方「图片垃圾回收」。
 */

import { getStore } from '@edgeone/pages-blob';

const KV_BINDING = 'GYP_CONTENT';
const CONTENT_KEY = 'site-content';
const MAX_BYTES = 512 * 1024; // 内容体上限，防止误传大文件塞满 KV

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  // 内容随时可改，必须禁用缓存，否则后台存了访客还看旧的
  'Cache-Control': 'no-store, max-age=0',
};

const json = (body, status = 200, extra) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

/* ── 会话校验 ──────────────────────────────────────────────────────────
 * ⚠️ 下面这几个函数是 functions/api/auth.js 的副本，**改一处必须改两处**。
 * 之所以不抽成共享模块：EdgeOne 的函数目录是按文件路由的，放进 functions/ 的
 * 非路由文件会不会被当成路由、以及跨目录 import 能否被正确打包，都没有官方示例
 * 可以印证。宁可复制这 30 行，也不赌一个未经验证的模块解析行为。
 * 令牌形状与签名口径见 auth.js 顶部注释。
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

/**
 * 取 KV 句柄。
 *
 * EdgeOne 的 KV 绑定是一个**裸全局变量**，变量名就是控制台里填的绑定名——
 * 官方示例写 `my_kv.get(...)`，而不是 `env.my_kv.get(...)`。所以第一顺位必须是
 * 直接引用标识符 GYP_CONTENT：如果运行时是用模块作用域注入的，`globalThis[...]`
 * 取不到它。用 typeof 兜住未绑定时的 ReferenceError（对未声明标识符做 typeof 是安全的）。
 *
 * 后面几个 env 分支是保险，留给本地调试工具或将来 EdgeOne 改成 env 注入的情况。
 */
function resolveKV(env) {
  const candidates = [
    typeof GYP_CONTENT !== 'undefined' ? GYP_CONTENT : undefined,
    env && env[KV_BINDING],
    typeof globalThis !== 'undefined' ? globalThis[KV_BINDING] : undefined,
    env && env[KV_BINDING.toLowerCase()],
  ];
  for (const kv of candidates) {
    if (kv && typeof kv.get === 'function' && typeof kv.put === 'function') return kv;
  }
  return null;
}

/** 只接受 { home: {...}, archive: {...} } 形状，避免把任意结构写进 KV */
function validate(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return '内容必须是 JSON 对象';
  }
  for (const key of Object.keys(payload)) {
    if (key !== 'home' && key !== 'archive') return '出现未知的顶层字段：' + key;
    const section = payload[key];
    if (section === null || typeof section !== 'object' || Array.isArray(section)) {
      return key + ' 必须是对象';
    }
  }
  return null;
}

/* ── 图片垃圾回收 ──────────────────────────────────────────────────────
 * 内容哈希键名意味着换一张图不会顶掉旧的那张，旧对象会永远留在桶里。
 * 这里在每次保存成功后，把「上一版引用过、这一版不再引用」的图删掉。
 *
 * 三条不能动的规矩：
 *
 * 1) **先写 KV，再删 Blob。** 反过来的话，一旦 KV 写失败，图已经没了而线上内容
 *    还在引用它 —— 那是不可恢复的（字节没了）。现在这个顺序最坏也只是留下一个
 *    孤儿对象，能通过 /api/blobs 手动清掉。
 *
 * 2) **按整份内容做集合差，不按字段逐个比。** 内容哈希键名让同一张图在多处引用时
 *    共用一个键：首页和历史页可以指向同一个 img/abc.png。只从某一处移除它，
 *    对象仍然在用。所以必须是「旧全集 − 新全集」，逐字段 diff 会删掉还在用的图。
 *
 * 3) **只删曾经被引用过的键，绝不按「桶里有但内容里没有」来扫。** 管理员上传完
 *    图片、还没点保存时，对象已经在桶里但不在 KV 里；按未引用扫桶会把它当垃圾
 *    删掉，用户会看到刚上传的图突然失效。上传却没用上的对象留作孤儿，交给
 *    /api/blobs 手动处理 —— 少清一个是浪费，多删一个是事故。
 */

const BLOB_STORE = 'gyp-assets';

// 与 upload.js 的 contentKey()、img.js 的 KEY_RE 同一口径。
// 不匹配 /img?key= 前缀而是直接找键名本身：值可能是相对地址、绝对地址，
// 也可能被 encodeURIComponent 编码过（img%2Fabc.png）。宽松匹配的方向是安全的——
// 多认出一个键只会让它留在「仍被引用」集合里，不会导致误删。
const BLOB_KEY_RE = /img\/[0-9a-f]{32}\.(?:png|jpg|webp|gif)/g;

// 单次保存最多删这么多。正常改动只会产生 0～2 个，设上限是防止「清空全部内容」
// 这类操作把一次保存拖成几十个串行 Blob 请求，最后超时。
const MAX_DELETES = 50;

// 递归深度上限。validate() 只校验了顶两层，再往下的形状是不受控的。
const MAX_DEPTH = 8;

/**
 * 把一份内容里出现的所有 Blob 键名收集成集合。
 * truncated 表示碰到了深度上限、这次扫描不完整。
 */
function collectBlobKeys(root) {
  const keys = new Set();
  let truncated = false;

  const scan = (text) => {
    const found = text.match(BLOB_KEY_RE);
    if (found) for (const k of found) keys.add(k);
  };

  const walk = (node, depth) => {
    if (depth > MAX_DEPTH) { truncated = true; return; }
    if (typeof node === 'string') {
      scan(node);
      // 编码过的值（img%2Fabc.png）要解码后再扫一遍
      try {
        const decoded = decodeURIComponent(node);
        if (decoded !== node) scan(decoded);
      } catch (_) { /* 半截百分号会抛，原串已经扫过了，忽略 */ }
      return;
    }
    if (Array.isArray(node)) {
      for (const v of node) walk(v, depth + 1);
      return;
    }
    if (node && typeof node === 'object') {
      for (const v of Object.values(node)) walk(v, depth + 1);
    }
  };

  walk(root, 0);
  return { keys, truncated };
}

/**
 * 删掉 previous 里引用过、next 里不再引用的图片。
 *
 * 调用时机只有一个：KV 写入**已经成功**之后。所以这里的任何失败都不许冒泡成
 * 保存失败 —— 内容已经存进去了，让用户以为没存反而会诱发重复操作。
 * 返回一个小结对象供响应体带回，null 表示无事可做。
 */
async function sweepUnreferenced(previous, next) {
  // 拿不到可信的旧快照就什么都不删。宁可留孤儿，不猜。
  if (previous === null || typeof previous !== 'object') return null;

  const before = collectBlobKeys(previous);
  const after = collectBlobKeys(next);

  // 新内容没扫全 → 可能有引用没被发现 → 一个都不能删
  if (after.truncated) return { skipped: '新内容嵌套过深，本次跳过回收' };

  const stale = [...before.keys].filter((k) => !after.keys.has(k));
  if (stale.length === 0) return null;

  let store;
  try {
    store = getStore(BLOB_STORE);
  } catch (e) {
    // Blob 没配好（比如构建阶段没跑 npm install）。保存本身不受影响。
    return { pending: stale.length, error: 'Blob 不可用：' + (e && e.message ? e.message : String(e)) };
  }

  const batch = stale.slice(0, MAX_DELETES);
  const deleted = [];
  const failed = [];
  // 串行删。批量并发在这里没有收益（正常就一两个），却可能撞上 Blob 的限频。
  for (const key of batch) {
    try {
      // 键不存在时 store.delete 不报错，所以不用先查存在性
      await store.delete(key);
      deleted.push(key);
    } catch (e) {
      failed.push(key);
    }
  }

  const summary = { deleted };
  if (failed.length) summary.failed = failed;
  // 超出上限的部分明确报出来，不做静默截断
  if (stale.length > batch.length) summary.pending = stale.length - batch.length;
  // 删掉的对象在 /img 上还有 CDN 缓存（键名声明了 immutable），
  // 不会张冠李戴（内容哈希键名不复用），但「已删除」不会立刻在公开路径生效。
  return summary;
}

async function handle(request, env) {
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'GET, POST, OPTIONS' } });
  }

  const kv = resolveKV(env);
  if (!kv) {
    return json({
      error: 'KV 未绑定：请在 Pages 项目中创建 KV 命名空间并绑定为 ' + KV_BINDING,
    }, 503);
  }

  if (method === 'GET') {
    try {
      const raw = await kv.get(CONTENT_KEY);
      if (!raw) return json({});
      // KV 里存的是字符串；坏数据不应让整站读取失败，直接退回空对象
      try {
        return json(JSON.parse(raw));
      } catch (_) {
        return json({});
      }
    } catch (e) {
      return json({ error: '读取失败：' + (e && e.message ? e.message : String(e)) }, 502);
    }
  }

  if (method === 'POST') {
    const expected = env && env.ADMIN_TOKEN;
    if (!expected) {
      return json({ error: '服务端未设置 ADMIN_TOKEN，已拒绝写入。请在 Pages 环境变量中配置。' }, 503);
    }
    // 两条凭据都要求知道 ADMIN_TOKEN，任一成立即可：
    //   1) 会话 Cookie —— 后台页面登录后走这条；
    //   2) X-Admin-Token 头 —— 留给 curl / 脚本，不必先走登录流程。
    const authed =
      (await verifySession(expected, readCookie(request, COOKIE_NAME))) ||
      safeEqual(request.headers.get('X-Admin-Token') || '', expected);
    if (!authed) {
      return json({ error: '未登录或会话已失效' }, 401);
    }

    let text;
    try {
      text = await request.text();
    } catch (e) {
      return json({ error: '请求体读取失败' }, 400);
    }
    if (text.length > MAX_BYTES) {
      return json({ error: '内容过大（超过 ' + Math.round(MAX_BYTES / 1024) + ' KB）' }, 413);
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      return json({ error: 'JSON 格式有误' }, 400);
    }
    const invalid = validate(payload);
    if (invalid) return json({ error: invalid }, 400);

    // 必须在写入**之前**读旧内容：写完就再也无从知道哪些图刚刚被移除。
    // 读失败或旧数据是坏 JSON 时保持 null，本次不回收（见 sweepUnreferenced）。
    let previous = null;
    try {
      const rawPrev = await kv.get(CONTENT_KEY);
      if (rawPrev) previous = JSON.parse(rawPrev);
    } catch (_) {
      previous = null;
    }

    try {
      await kv.put(CONTENT_KEY, JSON.stringify(payload));
    } catch (e) {
      return json({ error: '写入失败：' + (e && e.message ? e.message : String(e)) }, 502);
    }

    // ↓ 内容已经落盘。从这里往下无论出什么错，这次保存都是成功的。
    let gc = null;
    try {
      gc = await sweepUnreferenced(previous, payload);
    } catch (e) {
      gc = { error: '回收异常：' + (e && e.message ? e.message : String(e)) };
    }
    return json(gc ? { ok: true, gc } : { ok: true });
  }

  return json({ error: '不支持的方法：' + method }, 405, { Allow: 'GET, POST, OPTIONS' });
}

// EdgeOne Pages Functions 约定：具名导出 onRequest，参数为 context。
// 官方示例与线上项目一律用具名导出，没有一个用 export default——
// 这里也不要加 default 导出，避免打包时被当成另一种入口形态。
export async function onRequest(context) {
  return handle(context.request, context.env || {});
}
