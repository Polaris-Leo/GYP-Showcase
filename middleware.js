/**
 * 边缘中间件：未登录访问后台页时跳到登录页。
 *
 * ⚠️ 这里**不是安全边界**，只负责体验。理由有两条：
 *
 * 1. 中间件的 context 只有 request / next / redirect / rewrite / geo / clientIp，
 *    **拿不到 env**，所以这里根本没有 ADMIN_TOKEN，无法校验签名，
 *    只能判断 Cookie 是否存在——而「存在」是可以随手伪造的。
 * 2. 官方文档没有明确中间件是否拦截静态文件请求（admin.html 就是静态文件）。
 *    把安全性押在一个没写清的行为上是错的。
 *
 * 真正的边界在 functions/api/content.js：POST 会校验 HMAC 签名会话，
 * 伪造 Cookie 骗过这里最多只能看到后台空界面，**存不进任何东西**。
 * 后台页加载后还会再问一次 /api/auth，会话无效就自己跳回登录页。
 *
 * 只做「无 Cookie → 去登录页」这一个方向的跳转。反方向（有 Cookie → 去后台）
 * 故意不做：那样一个过期 Cookie 会让用户在两个页面之间无限弹跳。
 */

const COOKIE_NAME = 'gyp_admin';

export function middleware(context) {
  const url = new URL(context.request.url);
  const cookies = context.request.headers.get('Cookie') || '';
  const hasCookie = cookies.split(';').some((c) => c.trim().startsWith(COOKIE_NAME + '='));

  if (!hasCookie) {
    return context.redirect(new URL('/login.html', url.origin).toString(), 302);
  }

  return context.next();
}

export const config = {
  matcher: ['/admin.html', '/admin'],
};
