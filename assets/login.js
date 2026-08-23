/* 登录页逻辑。口令只在提交的那一刻存在于内存里，
   **不写 localStorage / sessionStorage**——会话由服务端下发的 HttpOnly Cookie 承载，
   JS 读不到也不需要读，这样 XSS 也偷不走它。 */
(function () {
  'use strict';

  var AUTH_API = '/api/auth';
  var form = document.getElementById('login-form');
  var input = document.getElementById('password');
  var button = document.getElementById('submit');
  var msg = document.getElementById('msg');

  function show(text, kind) {
    msg.textContent = text;
    msg.className = 'login-msg' + (kind ? ' is-' + kind : '');
  }

  // 从后台被踢回来时给个说法，否则用户不知道自己为什么退出了
  if (/[?&]expired=1/.test(location.search)) {
    show('会话已过期，请重新登录。', 'info');
  }

  // 本地 file:// 打开时接口根本不存在，先说清楚，别让用户以为是口令错
  if (location.protocol === 'file:') {
    show('当前是本地文件预览，没有后端接口，无法登录。', 'info');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var password = input.value;
    if (!password) { show('请输入管理口令。', 'error'); input.focus(); return; }

    button.disabled = true;
    show('验证中…', 'info');

    fetch(AUTH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // same-origin：确保浏览器接收并保存 Set-Cookie
      credentials: 'same-origin',
      body: JSON.stringify({ password: password })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { status: res.status, ok: res.ok, body: body };
        });
      })
      .then(function (r) {
        if (r.ok) {
          show('登录成功，正在进入后台…', 'info');
          // replace 而不是 href：不要在历史记录里留下登录页，
          // 否则用户按「后退」会回到这里，看起来像是退出了
          location.replace('admin.html');
          return;
        }

        button.disabled = false;
        input.select();

        if (r.status === 401) {
          show(r.body.error || '口令不正确。', 'error');
        } else if (r.status === 503) {
          show('服务端还没有配置管理口令（环境变量 ADMIN_TOKEN），无法登录。', 'error');
        } else {
          show(r.body.error || ('登录失败：HTTP ' + r.status), 'error');
        }
      })
      .catch(function (err) {
        button.disabled = false;
        show('无法连接登录接口，请确认站点已正确部署。', 'error');
        console.warn('登录接口不可用：', err);
      });
  });
})();
