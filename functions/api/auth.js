/**
 * /api/auth — 后台身份验证（EdgeOne Pages Function）
 *
 * GET    /api/auth  → 查询当前会话状态 { authenticated: boolean }
 * POST   /api/auth  → 登录，body { password }，成功则下发 HttpOnly 会话 Cookie
 * DELETE /api/auth  → 登出，清除 Cookie
 *
 * 需要环境变量 ADMIN_TOKEN（管理口令）。**未设置时一律拒绝登录**，不是放行。
 *
 * ── 会话为什么要签名 ────────────────────────────────────────────────
 * 参考项目的做法是「Cookie 里含有某个键名就算已登录」，值本身既不签名也不校验，
 * 于是随手伪造一个同名 Cookie 就能进后台。这里不能照抄。
 *
 * 本实现的会话令牌形状：  <过期时间戳>.<HMAC-SHA256(过期时间戳)>
 * 签名密钥就是 ADMIN_TOKEN。于是：
 *   - 不知道 ADMIN_TOKEN 就造不出有效签名 → 无法伪造会话；
 *   - 过期时间被签进令牌里，**由服务端校验**，不像 Max-Age 那样只是客户端的提示；
 *   - 改了 ADMIN_TOKEN，所有旧会话立即全部失效（密钥变了，签名验不过）。
 */

const COOKIE_NAME = 'gyp_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 小时

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
};

const json = (body, status = 200, extra) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

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

/** 定长比较，避免按字符提前返回而泄露信息 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function issueSession(secret) {
  const exp = String(Date.now() + SESSION_TTL_MS);
  return exp + '.' + (await hmac(secret, exp));
}

/** 校验会话令牌：签名对得上且未过期才算有效 */
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

// Secure：站点是 HTTPS，Cookie 不允许走明文链路
// HttpOnly：JS 读不到会话值，降低 XSS 拿走会话的风险
// SameSite=Strict：跨站请求不带上它，顺带挡掉 CSRF
const cookie = (value, maxAge) =>
  `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

async function handle(request, env) {
  const method = request.method.toUpperCase();
  const secret = env.ADMIN_TOKEN;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'GET, POST, DELETE, OPTIONS' } });
  }

  if (method === 'GET') {
    const ok = await verifySession(secret, readCookie(request, COOKIE_NAME));
    // configured 让后台能区分「口令没配」和「口令不对」，否则只能看到登录失败
    return json({ authenticated: ok, configured: Boolean(secret) });
  }

  if (method === 'DELETE') {
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }

  if (method === 'POST') {
    // 没配 ADMIN_TOKEN 时必须拒登，否则空口令就能进后台
    if (!secret) {
      return json({ error: '服务端未配置 ADMIN_TOKEN，无法登录' }, 503);
    }

    let password = '';
    try {
      const body = await request.json();
      password = body && typeof body.password === 'string' ? body.password : '';
    } catch (e) {
      return json({ error: '请求格式有误' }, 400);
    }

    if (!safeEqual(password, secret)) {
      // 统一话术，不透露是「口令错」还是「没这个用户」
      return json({ error: '口令不正确' }, 401);
    }

    const token = await issueSession(secret);
    return json({ ok: true }, 200, {
      'Set-Cookie': cookie(token, Math.floor(SESSION_TTL_MS / 1000)),
    });
  }

  return json({ error: '不支持的方法：' + method }, 405, { Allow: 'GET, POST, DELETE, OPTIONS' });
}

export async function onRequest(context) {
  return handle(context.request, context.env || {});
}
