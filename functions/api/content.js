/**
 * /api/content — 站点内容读写接口（EdgeOne Pages Function）
 *
 * GET  /api/content   → 返回内容 JSON（KV 为空时返回 {}，展示页会退回 HTML 内置默认值）
 * POST /api/content   → 写入内容 JSON，需要请求头 X-Admin-Token 与环境变量 ADMIN_TOKEN 匹配
 *
 * 需要在 Pages 项目里配置：
 *   1) KV 绑定，变量名 GYP_CONTENT（与下面的 KV_BINDING 一致）
 *   2) 环境变量 ADMIN_TOKEN = 管理口令。**未设置时一律拒绝写入**，避免后台裸奔。
 */

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

/**
 * 取 KV 句柄。不同运行时把绑定挂在不同位置（context.env / 全局变量），
 * 这里按优先级依次尝试，全部落空才报错，并在错误信息里说明原因。
 */
function resolveKV(env) {
  const candidates = [
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
    const supplied = request.headers.get('X-Admin-Token') || '';
    if (supplied !== expected) {
      return json({ error: '口令不正确或已失效' }, 401);
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

    try {
      await kv.put(CONTENT_KEY, JSON.stringify(payload));
      return json({ ok: true });
    } catch (e) {
      return json({ error: '写入失败：' + (e && e.message ? e.message : String(e)) }, 502);
    }
  }

  return json({ error: '不支持的方法：' + method }, 405, { Allow: 'GET, POST, OPTIONS' });
}

// Pages Functions 约定：导出 onRequest，参数为 context
export function onRequest(context) {
  return handle(context.request, context.env || {});
}

// Workers 风格入口，便于在兼容该形态的运行时/本地调试工具中复用同一份逻辑
export default {
  fetch: (request, env) => handle(request, env || {}),
};
