/* 鸽一品内容后台 · 逻辑。数据存 EdgeOne KV，经 /api/content 读写 */
// 内容接口：EdgeOne Pages Function，读写绑定的 KV
const CONTENT_API = '/api/content';
// 身份接口：登录 / 登出 / 查询会话
const AUTH_API = '/api/auth';
// 会话由服务端下发的 HttpOnly Cookie 承载，**前端不保存任何口令**：
// 既不进 sessionStorage 也不进 localStorage，JS 连会话值都读不到（HttpOnly）。
// 因此这里没有 token 变量——凭据全靠浏览器自动带上的 Cookie。
let authState = { authenticated: false, configured: false };

// 本地 file:// 打开时没有任何接口，此时不许跳转登录页，否则本地预览直接废掉
const hasBackend = location.protocol === 'http:' || location.protocol === 'https:';

function goLogin(expired) {
  if (!hasBackend) return;
  location.replace('login.html' + (expired ? '?expired=1' : ''));
}

// 默认值模板（用于初次填充和重置）
const defaults = {
  home: {
    'brand-home': '鸽一品\nGEYIPIN',
    'nav-collection': '收藏',
    'nav-history': '历史展厅',
    'nav-captain': '舰长礼物',
    'hero-heading': '把一片天空\n带回家。',
    'hero-intro': '这里收录与鸽一品角色故事有关的周边：可以收藏、可以相赠，也可以成为未来的发售企划。每一件都有它的画面、来处与说明。',
    'hero-primary-cta': '浏览本期展厅',
    'hero-artwork.src': 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png',
    'collection-heading': '周边清单\n× 04',
    // 标记首页物品 meta 的固定三段顺序，供后台迁移与展示页兼容旧数据。
    merchMetaOrder: 'kind-how-price',
    merchOrder: ['merch-sky', 'merch-plush', 'merch-birthday', 'merch-cafe'],
    'merch-sky.title': '云上通行证',
    'merch-sky.meta': '入会纪念票卡／限时寄送／无售价',
    'merch-sky.status': '企划中',
    'merch-sky.note': '把晴空、白鸽和长长的缎带压进一张可被收藏的通行证，留给一起飞过这段旅程的人。',
    'merch-sky.image': 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png',
    'merch-sky.type': 'gift',
    'merch-sky.spec': '以官方信息为准',
    'merch-plush.title': '云团抱枕',
    'merch-plush.meta': '异形抱枕／季度礼物／无售价',
    'merch-plush.status': '企划中',
    'merch-plush.note': '用画面中被拥抱的小鸟做成软软的轮廓，作为桌面和沙发上的陪伴物。',
    'merch-plush.image': 'https://i0.hdslb.com/bfs/garb/open/171b8d6f02d93b4ee97fa230eff3ecad5e63e9fd.png',
    'merch-plush.type': 'gift',
    'merch-plush.spec': '以官方信息为准',
    'merch-birthday.title': '生日小夜灯',
    'merch-birthday.meta': '亚克力夜灯／生日限定／以官方信息为准',
    'merch-birthday.status': '企划中',
    'merch-birthday.note': '生日画面的糖果色被裁成一盏小灯；点亮时，桌面像刚刚拆开一份礼物。',
    'merch-birthday.image': 'https://i0.hdslb.com/bfs/garb/open/436cd3b761aaa29766c7fad8e44b4672f7734eef.png',
    'merch-birthday.type': 'sale',
    'merch-birthday.spec': '以官方信息为准',
    'merch-cafe.title': '星屿立牌',
    'merch-cafe.meta': '双层亚克力／常规收藏／以官方信息为准',
    'merch-cafe.status': '企划中',
    'merch-cafe.note': '前景是认真端盘的鸽一品，背面藏着忙碌的小白鸽；从不同角度看，像一段有声音的餐桌故事。',
    'merch-cafe.image': 'https://i0.hdslb.com/bfs/garb/item/c6836114214dcba20fcc30167be8239863b9083e.png',
    'merch-cafe.type': 'sale',
    'merch-cafe.spec': '以官方信息为准',
    'captain-heading': '礼物不是门槛，\n是一起留下的记号。'
  },
  archive: {
    'archive-brand-home': '鸽一品\nGEYIPIN',
    'nav-current-collection': '当前展厅',
    'nav-archive-list': '历史展厅',
    'archive-title': '让每一件，\n都有来处。',
    'archive-intro': '这里收录曾经出现过的周边与纪念物，并持续整理名称、时间线、图片、规格与获得方式。',
    itemOrder: ['item-star', 'item-badge', 'item-card', 'item-keychain', 'item-color-paper', 'item-summer'],
    'item-star.title': '星羽立牌',
    'item-star.date': '2025\n10',
    'item-star.desc': '以飞鸟和缎带为轮廓的双层亚克力立牌，呈现轻盈而富有层次的天空主题。',
    'item-star.image': 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png',
    'item-star.category': '亚克力立牌',
    'item-star.state': '档案收录',
    'item-star.gain': '以官方信息为准',
    'item-badge.title': '云团徽章组',
    'item-badge.date': '2025\n11',
    'item-badge.desc': '以云朵、小鸟和表情切片组织的收藏徽章组，记录角色日常中的轻快片段。',
    'item-badge.image': 'https://i0.hdslb.com/bfs/garb/open/171b8d6f02d93b4ee97fa230eff3ecad5e63e9fd.png',
    'item-badge.category': '马口铁徽章',
    'item-badge.state': '档案收录',
    'item-badge.gain': '以官方信息为准',
    'item-card.title': '冬日天空透卡',
    'item-card.date': '2025\n12',
    'item-card.desc': '一组围绕节日问候设计的透明卡片，以轻盈的层叠画面收录冬日祝福。',
    'item-card.image': 'https://i0.hdslb.com/bfs/garb/open/436cd3b761aaa29766c7fad8e44b4672f7734eef.png',
    'item-card.category': '透卡套组',
    'item-card.state': '档案收录',
    'item-card.gain': '以官方信息为准',
    'item-keychain.title': '羽毛信笺挂件',
    'item-keychain.date': '2026\n02',
    'item-keychain.desc': '以角色来信为概念的金属或亚克力挂件，将轻巧的书信意象收进随身收藏。',
    'item-keychain.image': 'https://i0.hdslb.com/bfs/garb/item/c6836114214dcba20fcc30167be8239863b9083e.png',
    'item-keychain.category': '钥匙扣／挂件',
    'item-keychain.state': '档案收录',
    'item-keychain.gain': '以官方信息为准',
    'item-color-paper.title': '生日纪念色纸',
    'item-color-paper.date': '2026\n04',
    'item-color-paper.desc': '用于记录一年一次的祝福时刻，将明亮的生日主题留在可被珍藏的纸面上。',
    'item-color-paper.image': 'https://i0.hdslb.com/bfs/garb/open/436cd3b761aaa29766c7fad8e44b4672f7734eef.png',
    'item-color-paper.category': '纪念色纸',
    'item-color-paper.state': '档案收录',
    'item-color-paper.gain': '以官方信息为准',
    'item-summer.title': '夏日集会立牌',
    'item-summer.date': '2026\n06',
    'item-summer.desc': '以夏日主题收束这段时间线，作为历年物品与再售讯息的长期档案入口。',
    'item-summer.image': 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png',
    'item-summer.category': '亚克力立牌',
    'item-summer.state': '档案收录',
    'item-summer.gain': '以官方信息为准'
  }
};

// 将扁平 key（如 "merch-sky.title"）展开为嵌套对象
function expandFlat(flat) {
  const out = {};
  for (const key in flat) {
    const parts = key.split('.');
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = flat[key];
  }
  return out;
}

// 深度合并：用 patch 覆盖 base，返回新对象
function deepMerge(base, patch) {
  if (patch == null || typeof patch !== 'object') return base;
  const out = structuredClone(base);
  for (const key in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      if (patch[key] && typeof patch[key] === 'object' && !Array.isArray(patch[key]) &&
          out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
        out[key] = deepMerge(out[key], patch[key]);
      } else {
        out[key] = patch[key];
      }
    }
  }
  return out;
}

const nestedDefaults = {
  home: expandFlat(defaults.home),
  archive: expandFlat(defaults.archive)
};

// 先用默认值渲染，再异步拉取线上内容覆盖，避免首屏空白
let data = structuredClone(nestedDefaults);

// 连接状态：offline（接口不可用）/ locked（需要口令）/ ready（可读写）
let apiState = 'offline';

async function loadData() {
  try {
    const res = await fetch(CONTENT_API, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const parsed = await res.json();
    apiState = 'ready';
    return deepMerge(nestedDefaults, normalizeMerchMeta(parsed && typeof parsed === 'object' ? parsed : {}));
  } catch (e) {
    apiState = 'offline';
    throw e;
  }
}

async function pushData() {
  const res = await fetch(CONTENT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 让浏览器带上会话 Cookie；不再手工传口令
    credentials: 'same-origin',
    body: JSON.stringify(data)
  });
  if (res.status === 401) {
    // 会话过期或被伪造：回登录页重新验证，别让用户对着一个存不进去的界面反复点
    apiState = 'locked';
    authState.authenticated = false;
    goLogin(true);
    throw new Error('会话已失效，正在返回登录页');
  }
  if (!res.ok) {
    let detail = 'HTTP ' + res.status;
    try { const j = await res.json(); if (j && j.error) detail = j.error; } catch (_) {}
    throw new Error(detail);
  }
  // 保存成功时服务端可能顺手回收了失去引用的图（见 functions/api/content.js 的
  // sweepUnreferenced）。桶变了就让清单缓存作废，否则「数据」页和选择弹窗还会
  // 列出已经不存在的键名，点开是破图。
  try {
    const body = await res.json();
    if (body && body.gc) invalidateBlobCache();
  } catch (_) { /* 响应体不是 JSON 也不影响保存本身已经成功 */ }
  apiState = 'ready';
}

let savingPromise = null;
let pendingSave = false;

// 串行化保存：一次请求进行中时把后续改动合并到下一次，避免并发写入互相覆盖
function saveData() {
  if (savingPromise) { pendingSave = true; return savingPromise; }
  showSaveStatus('保存中…');
  savingPromise = pushData()
    .then(() => { showSaveStatus('已保存到线上'); setConnBadge(); })
    .catch((e) => { showSaveStatus('保存失败：' + e.message); setConnBadge(); })
    .finally(() => {
      savingPromise = null;
      if (pendingSave) { pendingSave = false; saveData(); }
    });
  return savingPromise;
}

let saveTimer;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveData, 400);
}

let statusTimer;
function showSaveStatus(text) {
  const el = document.getElementById('save-status');
  el.textContent = text;
  el.classList.add('is-visible');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.remove('is-visible'), 1200);
}

// 填充表单
function hydrateForm(scope) {
  (scope || document).querySelectorAll('[data-field]').forEach((input) => {
    const key = input.dataset.field;
    const value = resolveKey(key);
    if (input.dataset.choice) {
      // 分段字段（data-part）取整串里的对应一段，其余照原样回填
      setChoiceSelect(input, input.dataset.part == null ? value : metaParts(value)[Number(input.dataset.part)]);
      return;
    }
    if (input.dataset.ym) {
      setYmSelect(input, ymParts(value)[input.dataset.ym]);
      return;
    }
    input.value = value != null ? value : '';
    updatePreview(input);
    // 图片字段的输入框是隐藏的，当前值靠控制行里那枚 .image-value 显示。
    // 回填不走 input 事件，所以得在这里补一次同步，否则切页／导入后
    // 字段值已经变了，旁边显示的还是上一张图的键名。
    syncImageControl(input);
  });
}

function resolveKey(key) {
  const parts = key.split('.');
  let node = data;
  for (let i = 0; i < parts.length; i++) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[parts[i]];
  }
  return node;
}

function updateValue(key, value) {
  const parts = key.split('.');
  let node = data;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
  scheduleSave();
}

function updatePreview(input) {
  const key = input.dataset.field;
  const preview = document.querySelector(`[data-preview-for="${key}"]`);
  if (!preview) return;
  const val = input.value.trim();
  preview.textContent = '';
  if (!val) {
    const span = document.createElement('span');
    span.textContent = '预览';
    preview.appendChild(span);
    return;
  }
  // 用 DOM 构建而非拼接 innerHTML：既避免链接里的引号破坏标签，
  // 也让 onerror 能安全判断自己是否还挂在文档里（重渲染会把上一张仍在加载的图摘掉，
  // 图片被移除时浏览器会中止请求并触发 error，此时 parentElement 已是 null）
  const img = document.createElement('img');
  img.alt = '预览';
  img.addEventListener('error', () => {
    if (!img.isConnected || img.parentElement !== preview) return;
    preview.textContent = '';
    const span = document.createElement('span');
    span.textContent = '加载失败';
    preview.appendChild(span);
  });
  img.src = val;
  preview.appendChild(img);
}

// ───────── 图片上传（Pages Blob） ─────────
//
// 上传是**附加**功能，不替代原来的手填链接：字段的值仍然是一个普通字符串，
// 上传成功只是帮你把 /img?key=… 填进去。所以任意外部图片直链照样能用，
// 而且万一 Blob 那边出问题，手填这条路一点没受影响。

// ⚠️ 必须与 functions/api/upload.js 里的 MAX_BYTES 一致。
// 超过这个大小就改走直传（预签名 PUT），因为函数收不下这么大的请求体。
const UPLOAD_PROXY_MAX = 4 * 1024 * 1024;

// ⚠️ 必须与 functions/api/upload.js 里的 TYPES 一致。
// 故意不含 image/svg+xml：SVG 能内嵌脚本，同源加载等于存储型 XSS。
const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const fmtSize = (n) =>
  n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

async function sha256Hex(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 把响应里的错误话术取出来；不是 JSON 就退回状态码 */
async function errText(res) {
  try {
    const body = await res.json();
    if (body && body.error) return body.error;
  } catch (_) { /* 落到下面 */ }
  return 'HTTP ' + res.status;
}

async function uploadFile(file) {
  if (file.size <= UPLOAD_PROXY_MAX) {
    // 代理上传：同源 POST，请求体就是文件本身
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(await errText(res));
    return (await res.json()).url;
  }

  // 直传：先要一个预签名地址，再把字节直接 PUT 给 Blob。
  // 服务端拿不到内容，算不了内容哈希，所以哈希在这里算好带上去。
  const sha256 = await sha256Hex(file);
  const signRes = await fetch('/api/upload?direct=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, sha256 }),
    credentials: 'same-origin',
  });
  if (!signRes.ok) throw new Error(await errText(signRes));
  const signed = await signRes.json();

  // 签名把方法/键名/有效期/Content-Type 绑在一起，PUT 时必须原样照发，少一个都会 403。
  // 这一步是跨域请求，会先走 CORS 预检——预检过不去的话错误会含糊得多，所以单独提示。
  let putRes;
  try {
    putRes = await fetch(signed.uploadUrl, { method: 'PUT', headers: signed.putHeaders, body: file });
  } catch (e) {
    throw new Error('直传被浏览器拦下（可能是 Blob 未放行跨域）。可先把图压到 ' +
                    fmtSize(UPLOAD_PROXY_MAX) + ' 以内改走代理上传。');
  }
  if (!putRes.ok) throw new Error('直传失败：HTTP ' + putRes.status);
  return signed.url;
}

/* ── Blob 图片键名 ────────────────────────────────────────────────────
 * ⚠️ 下面的正则与 functions/api/content.js 的 BLOB_KEY_RE **必须保持一致**，
 * 改一处要改两处。两边的等价性由 RECON/blob-key-parity-test.js 把住。
 *
 * 位置在这里而不是跟着导入弹窗放在文件末尾：三处用到它 —— 导入弹窗、选择图片
 * 弹窗、数据页的清单面板 —— 而最早的调用发生在启动时的 bindFields(document)
 * （经 attachImageControls → syncImageControl）。const 有 TDZ，声明留在文件末尾
 * 会让首屏直接 ReferenceError。
 */
const BLOB_KEY_RE = /img\/[0-9a-f]{32}\.(?:png|jpg|webp|gif)/g;

function collectBlobKeys(root) {
  const keys = new Set();
  const scan = (text) => {
    const found = text.match(BLOB_KEY_RE);
    if (found) found.forEach((k) => keys.add(k));
  };
  const walk = (node, depth) => {
    if (depth > 8) return;
    if (typeof node === 'string') {
      scan(node);
      // 值可能是编码过的 /img?key=img%2F…
      try {
        const decoded = decodeURIComponent(node);
        if (decoded !== node) scan(decoded);
      } catch (_) { /* 半截百分号会抛，原串已扫过 */ }
      return;
    }
    if (Array.isArray(node)) { node.forEach((v) => walk(v, depth + 1)); return; }
    if (node && typeof node === 'object') { Object.values(node).forEach((v) => walk(v, depth + 1)); }
  };
  walk(root, 0);
  return keys;
}

/* ── Blob 图片清单（/api/blobs） ──────────────────────────────────────
 * 官方 store.list() 每个对象**只给 key 和 etag** —— 没有文件大小，也没有上传
 * 时间。所以这里排不出「最新上传在前」，只能按键名排；键名是内容哈希，等于随机
 * 顺序。UI 上不要暗示时间序，否则用户会按「最后一个是刚传的」去理解，然后删错。
 *
 * 列表带 30 秒缓存：选择弹窗可能被反复打开，每次都打一次网络请求没必要。
 * 上传成功、删除成功都会主动作废缓存，所以缓存不会让人看到过期的清单。
 */
const BLOB_LIST_TTL = 30000;
let blobCache = null;     // { at, blobs, total, truncated, skipped }
let blobPending = null;   // 进行中的请求，用来并发去重

async function fetchBlobList(force) {
  if (!force && blobCache && Date.now() - blobCache.at < BLOB_LIST_TTL) return blobCache;
  // 两处入口（数据面板、选择弹窗）可能几乎同时要列表，共用同一个 in-flight 请求
  if (blobPending) return blobPending;
  blobPending = (async () => {
    const res = await fetch('/api/blobs', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(await errText(res));
    const body = await res.json();
    const blobs = (body.blobs || []).slice().sort((a, b) => a.key.localeCompare(b.key));
    blobCache = {
      at: Date.now(),
      blobs,
      total: typeof body.total === 'number' ? body.total : blobs.length,
      truncated: !!body.truncated,
      skipped: body.skipped || 0,
    };
    return blobCache;
  })();
  try {
    return await blobPending;
  } finally {
    blobPending = null;
  }
}

function invalidateBlobCache() { blobCache = null; }

async function deleteBlob(key) {
  const res = await fetch('/api/blobs?key=' + encodeURIComponent(key), {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(await errText(res));
  // 本地即时摘掉，避免删完还要等一次完整刷新才消失
  if (blobCache) blobCache.blobs = blobCache.blobs.filter((b) => b.key !== key);
  return res.json();
}

/** 当前内容里正在引用的 Blob 键名。复用导入弹窗那套收集器，口径与服务端一致。 */
function usedBlobKeys() { return collectBlobKeys(data); }

/** 从字段值里认出 Blob 键名（值可能是 /img?key=img%2F… 这种编码形态） */
function blobKeyOf(value) {
  if (!value) return '';
  const found = collectBlobKeys(String(value));
  const first = found.values().next();
  return first.done ? '' : first.value;
}

// img/1a2b…9f0e.png → 1a2b…9f0e.png：键名前 8 位足够肉眼区分，全名放 title 里
function shortBlobKey(key) {
  const bare = key.replace(/^img\//, '');
  const dot = bare.lastIndexOf('.');
  const hash = dot < 0 ? bare : bare.slice(0, dot);
  const ext = dot < 0 ? '' : bare.slice(dot);
  return hash.length > 12 ? hash.slice(0, 8) + '…' + ext : bare;
}

function blobThumb(blob) {
  const thumb = document.createElement('div');
  thumb.className = 'blob-thumb';
  const img = document.createElement('img');
  // 装饰性：紧挨着的键名就是它的可读标识，再念一遍图片是噪音
  img.alt = '';
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    if (!img.isConnected) return;
    thumb.textContent = '';
    const span = document.createElement('span');
    span.textContent = '读取失败';
    thumb.appendChild(span);
  });
  img.src = blob.url;
  thumb.appendChild(img);
  return thumb;
}

function blobBadge(inUse) {
  const badge = document.createElement('span');
  badge.className = 'blob-badge';
  badge.dataset.use = inUse ? 'yes' : 'no';
  badge.textContent = inUse ? '● 使用中' : '○ 未使用';
  return badge;
}

const BLOB_FILTERS = {
  all: () => true,
  used: (inUse) => inUse,
  free: (inUse) => !inUse,
};

/* 一页 8 张 —— 对应 admin.css 里 .blob-grid 的 4 列，正好两行。
   面板用这套页大小；选择图片弹窗单独限制为 4 张，避免弹窗内容过长。
   （和条目列表的 ITEMS_PER_PAGE = 4、展示页的 PAGE_SIZE 都没有关系，别混。） */
const BLOBS_PER_PAGE = 8;
const PICKER_BLOBS_PER_PAGE = 4;
const blobPageCount = (total, pageSize) => Math.max(1, Math.ceil(total / (pageSize || BLOBS_PER_PAGE)));

/**
 * 图片网格的分页条。
 * 皮肤直接借条目列表那套 .list-pager（虚线框 + surface 底、当前页只加深边框），
 * 但页码按钮挂的是 data-blob-page 并各自绑回调：.admin-content 上那个委托监听
 * 只认 data-list-page，两套分页不会互相接错事件。
 * 补零就近写一个，不去用文件后面「条目集合」那节才声明的 pad2 —— Blob 这一节
 * 不该反过来依赖排在它后面的东西。
 */
function buildBlobPager(page, pages, total, onPage, pageSize) {
  const pad = (n) => String(n).padStart(2, '0');
  const size = pageSize || BLOBS_PER_PAGE;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);

  const bar = document.createElement('div');
  bar.className = 'list-pager blob-pager';

  const status = document.createElement('p');
  status.className = 'list-pager-status';
  status.setAttribute('aria-live', 'polite');
  // 说「本页第几到第几」而不是只说页码：上面工具条里那句「共 N 张」讲的是整桶，
  // 这里讲的是当前筛选下的这一页，两句话不能都写成「共 N 张」。
  status.textContent = '第 ' + pad(page) + ' / ' + pad(pages) + ' 页 · 本页 '
    + pad(from) + '–' + pad(to) + '（筛选后共 ' + pad(total) + ' 张）';

  const controls = document.createElement('div');
  controls.className = 'list-pager-controls';

  let gapped = false;
  const button = (label, value, opts) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm';
    b.dataset.blobPage = String(value);
    b.textContent = label;
    if (opts && opts.disabled) b.disabled = true;
    if (opts && opts.current) b.setAttribute('aria-current', 'page');
    if (opts && opts.aria) b.setAttribute('aria-label', opts.aria);
    b.addEventListener('click', () => { if (!b.disabled) onPage(value); });
    return b;
  };

  controls.appendChild(button('← 上一页', page - 1, { disabled: page === 1 }));
  // 页数多时收成 01 … 04 05 06 … 12，免得页码把整行挤到换行
  for (let p = 1; p <= pages; p++) {
    if (pages <= 7 || p === 1 || p === pages || Math.abs(p - page) <= 1) {
      controls.appendChild(button(pad(p), p, { current: p === page, aria: '第 ' + p + ' 页' }));
      gapped = false;
    } else if (!gapped) {
      const gap = document.createElement('span');
      gap.className = 'list-pager-gap';
      gap.setAttribute('aria-hidden', 'true');
      gap.textContent = '…';
      controls.appendChild(gap);
      gapped = true;
    }
  }
  controls.appendChild(button('下一页 →', page + 1, { disabled: page === pages }));

  bar.append(status, controls);
  return bar;
}

/**
 * 画一格图片网格。两个调用点共用：
 *   mode 'pick'   → 整格是一个按钮，点了就选中（弹窗里）
 *   mode 'manage' → 整格是 div，底部带「复制链接 / 删除」（数据面板里）
 * 不做成一个模式：pick 模式整格可点，manage 模式格子里有按钮，
 * 按钮套按钮是非法结构，读屏和键盘都会出问题。
 *
 * cfg.page / cfg.onPage 是分页：只画当前页的 pageSize 张（默认 BLOBS_PER_PAGE），多于一页时在
 * 网格末尾插一条分页条。不传 onPage 就不分页控件（也就画不动第二页）。
 * 返回值始终是**筛选后的总数**，不是这一页的张数 —— 工具条里那句「当前筛选
 * 显示 N」要的是前者，调用方也拿它来把自己存的页码收回合法范围。
 */
function paintBlobGrid(host, cfg) {
  const used = usedBlobKeys();
  const pass = BLOB_FILTERS[cfg.filter] || BLOB_FILTERS.all;
  const shown = cfg.blobs.filter((b) => pass(used.has(b.key)));

  host.textContent = '';
  if (!shown.length) {
    const empty = document.createElement('p');
    empty.className = 'blob-empty';
    empty.textContent = cfg.blobs.length
      ? '没有符合当前筛选的图片。'
      : '桶里还没有图片。用字段里的「上传图片」传一张试试。';
    host.appendChild(empty);
    return shown.length;
  }

  /* 页码就地夹回合法范围：删图、切筛选、导入一份更短的备份，都可能让存着的
     页码越界（和 renderItemList 同一个道理）。这里只用夹过的值，不回写调用方的
     state —— 那份收尾由调用方拿返回值自己做，免得画着画着又触发一次重画。 */
  const pageSize = cfg.pageSize || BLOBS_PER_PAGE;
  const pages = blobPageCount(shown.length, pageSize);
  const page = Math.min(Math.max(cfg.page || 1, 1), pages);
  const from = (page - 1) * pageSize;

  shown.slice(from, from + pageSize).forEach((blob) => {
    const inUse = used.has(blob.key);
    const tile = document.createElement(cfg.mode === 'pick' ? 'button' : 'div');
    tile.className = 'blob-tile';
    tile.dataset.blobKey = blob.key;

    const meta = document.createElement('div');
    meta.className = 'blob-meta';
    const keyEl = document.createElement('span');
    keyEl.className = 'blob-key';
    keyEl.textContent = shortBlobKey(blob.key);
    keyEl.title = blob.key;
    meta.append(keyEl, blobBadge(inUse));

    if (cfg.mode === 'pick') {
      tile.type = 'button';
      tile.setAttribute('aria-label', '选择 ' + blob.key + (inUse ? '（使用中）' : '（未使用）'));
      if (cfg.currentKey && cfg.currentKey === blob.key) {
        tile.dataset.current = 'true';
        // aria-label 已经念了键名，这里补一句「当前」
        tile.setAttribute('aria-label', '当前已选：' + blob.key);
        const now = document.createElement('span');
        now.className = 'blob-current';
        now.textContent = '当前';
        meta.appendChild(now);
      }
      tile.append(blobThumb(blob), meta);
      tile.addEventListener('click', () => cfg.onPick(blob));
    } else {
      const actions = document.createElement('div');
      actions.className = 'blob-actions';

      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn btn-sm';
      copy.textContent = '复制链接';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(blob.url);
          showSaveStatus('已复制 ' + blob.url);
        } catch (e) {
          showSaveStatus('复制失败');
        }
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-sm btn-danger';
      del.textContent = '删除';
      if (inUse) {
        // 使用中的图不给删。删了展示页就是一个破图，而且这里删不掉引用——
        // 正确路径是先在字段里换掉，保存时 /api/content 会自动回收它。
        del.disabled = true;
        del.title = '这张图还被内容引用着。请先在对应字段换掉它，保存后会自动回收。';
      } else {
        del.addEventListener('click', async () => {
          if (!confirm(
            '确定删除这张图吗？\n\n' + blob.key + '\n\n' +
            '它当前没有被任何内容引用。删除后需要重新上传原文件才能恢复，此操作不可撤销。'
          )) return;
          del.disabled = true;
          try {
            await deleteBlob(blob.key);
            showSaveStatus('已删除 ' + shortBlobKey(blob.key));
            renderBlobPanel();
          } catch (e) {
            del.disabled = false;
            showSaveStatus((e && e.message) || '删除失败');
          }
        });
      }

      actions.append(copy, del);
      tile.append(blobThumb(blob), meta, actions);
    }

    host.appendChild(tile);
  });

  // 只有一页就不插分页条：装得下的时候那一行纯属噪音
  if (pages > 1 && cfg.onPage) {
    host.appendChild(buildBlobPager(page, pages, shown.length, cfg.onPage, pageSize));
  }

  return shown.length;
}

/* ── 数据页的「Blob 图片」面板 ─────────────────────────────────────── */

const blobPanelState = { filter: 'all', page: 1 };

async function renderBlobPanel(force) {
  const host = document.getElementById('blob-gallery');
  const countEl = document.getElementById('blob-count');
  if (!host) return;

  if (!blobCache || force) {
    host.textContent = '';
    const loading = document.createElement('p');
    loading.className = 'blob-empty';
    loading.textContent = '正在读取清单…';
    host.appendChild(loading);
  }

  let list;
  try {
    list = await fetchBlobList(force);
  } catch (e) {
    host.textContent = '';
    const bad = document.createElement('p');
    bad.className = 'blob-empty';
    bad.dataset.kind = 'bad';
    bad.textContent = (e && e.message) || '读取失败';
    host.appendChild(bad);
    if (countEl) countEl.textContent = '读取失败';
    return;
  }

  const shownCount = paintBlobGrid(host, {
    mode: 'manage',
    blobs: list.blobs,
    filter: blobPanelState.filter,
    page: blobPanelState.page,
    onPage: (p) => { blobPanelState.page = p; renderBlobPanel(); },
  });
  // 网格刚可能把页码夹回来过（删掉最后一页那张、或切了筛选），把状态收到同一个值上
  blobPanelState.page = Math.min(blobPanelState.page, blobPageCount(shownCount));

  if (countEl) {
    const used = usedBlobKeys();
    const inUse = list.blobs.filter((b) => used.has(b.key)).length;
    const parts = [
      '共 ' + list.total + ' 张',
      '使用中 ' + inUse,
      '未使用 ' + (list.blobs.length - inUse),
    ];
    if (blobPanelState.filter !== 'all') parts.push('当前筛选显示 ' + shownCount);
    if (list.truncated) parts.push('⚠ 超过 ' + list.blobs.length + ' 张的部分未列出');
    if (list.skipped) parts.push('另有 ' + list.skipped + ' 个非上传接口生成的对象未显示');
    countEl.textContent = parts.join(' · ');
  }
}

const blobRefreshBtn = document.getElementById('blob-refresh');
if (blobRefreshBtn) {
  blobRefreshBtn.addEventListener('click', () => {
    invalidateBlobCache();
    renderBlobPanel(true);
  });
}

/* 数据页直接往桶里传图，不改任何内容字段；上传成功后它会是「未使用」，
   所以无论当前筛选在哪一组都切回「全部」并回到第一页，确保新图立刻可见。 */
const blobUploadPicker = document.getElementById('blob-upload-file');
const blobUploadBtn = document.getElementById('blob-upload');
const blobUploadStatus = document.getElementById('blob-upload-status');
const setBlobUploadStatus = (text, kind) => {
  if (!blobUploadStatus) return;
  blobUploadStatus.textContent = text;
  blobUploadStatus.dataset.kind = kind || '';
};
if (blobUploadPicker && blobUploadBtn) {
  blobUploadBtn.addEventListener('click', () => blobUploadPicker.click());
  blobUploadPicker.addEventListener('change', async () => {
    const file = blobUploadPicker.files && blobUploadPicker.files[0];
    // 重置 value，否则连续上传同一个文件时第二次不会触发 change。
    blobUploadPicker.value = '';
    if (!file) return;

    if (!UPLOAD_TYPES.includes(file.type)) {
      setBlobUploadStatus(
        file.type === 'image/svg+xml'
          ? '不收 SVG（可内嵌脚本），请先转成 PNG'
          : '不支持的格式：' + (file.type || '未知'),
        'bad'
      );
      return;
    }

    blobUploadBtn.disabled = true;
    setBlobUploadStatus('上传中…（' + fmtSize(file.size) + '）');
    try {
      await uploadFile(file);
      invalidateBlobCache();
      blobPanelState.filter = 'all';
      blobPanelState.page = 1;
      document.querySelectorAll('[data-blob-filter]').forEach((btn) => {
        btn.setAttribute('aria-pressed', String(btn.dataset.blobFilter === 'all'));
      });
      setBlobUploadStatus('已上传 · ' + fmtSize(file.size), 'ok');
      renderBlobPanel(true);
    } catch (e) {
      setBlobUploadStatus((e && e.message) || '上传失败', 'bad');
    } finally {
      blobUploadBtn.disabled = false;
    }
  });
}
document.querySelectorAll('[data-blob-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    blobPanelState.filter = btn.dataset.blobFilter;
    // 换了筛选就回第一页：留在第 3 页而新结果只有 5 张，看着就是「筛完啥都没了」
    blobPanelState.page = 1;
    document.querySelectorAll('[data-blob-filter]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b === btn));
    });
    renderBlobPanel();
  });
});

/* ── 选择图片弹窗 ─────────────────────────────────────────────────────
 * 一个单例，第一次打开时才建。字段那边不持有任何弹窗结构，所以动态生成的
 * 条目字段（周边／历史）和 admin.html 里的静态字段共用同一个弹窗。
 *
 * 弹窗里保留「外部链接」输入框，这不是可选的：站点的默认图全部是外部直链
 * （见 README §3），如果只能从 Blob 里选，默认图就再也填不回去了。
 */
let pickerEl = null;
let pickerState = { target: null, trigger: null, filter: 'all', page: 1 };

function buildPicker() {
  const back = document.createElement('div');
  back.className = 'picker-backdrop';
  back.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'picker';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'picker-title');

  panel.innerHTML =
    '<div class="picker-head">' +
      '<h3 id="picker-title">选择图片</h3>' +
      '<span class="picker-target" data-picker-target></span>' +
      '<button class="btn btn-icon picker-close" type="button" data-picker-close aria-label="关闭">×</button>' +
    '</div>' +
    '<div class="picker-toolbar">' +
      '<p class="blob-count" data-picker-count role="status" aria-live="polite"></p>' +
      '<div class="blob-filters" role="group" aria-label="按使用状态筛选">' +
        '<button class="btn btn-sm" type="button" data-picker-filter="all" aria-pressed="true">全部</button>' +
        '<button class="btn btn-sm" type="button" data-picker-filter="used" aria-pressed="false">使用中</button>' +
        '<button class="btn btn-sm" type="button" data-picker-filter="free" aria-pressed="false">未使用</button>' +
      '</div>' +
      '<button class="btn btn-sm" type="button" data-picker-refresh>刷新</button>' +
    '</div>' +
    '<div class="picker-body"><div class="blob-grid" data-picker-grid></div></div>' +
    '<div class="picker-foot">' +
      '<label class="picker-url-label" for="picker-url">或填外部链接</label>' +
      '<div class="picker-url-row">' +
        '<input type="text" id="picker-url" data-picker-url spellcheck="false" placeholder="https://example.com/image.png">' +
        '<button class="btn btn-primary btn-sm" type="button" data-picker-apply>使用这个链接</button>' +
        '<button class="btn btn-sm" type="button" data-picker-clear>清空该字段</button>' +
      '</div>' +
    '</div>';

  back.appendChild(panel);
  document.body.appendChild(back);

  // 点遮罩关闭；点面板内部不关（事件冒到遮罩上时 target 已经不是遮罩本身）
  back.addEventListener('click', (event) => { if (event.target === back) closePicker(); });
  panel.querySelector('[data-picker-close]').addEventListener('click', closePicker);
  panel.querySelector('[data-picker-refresh]').addEventListener('click', () => {
    invalidateBlobCache();
    renderPicker(true);
  });
  panel.querySelectorAll('[data-picker-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pickerState.filter = btn.dataset.pickerFilter;
      pickerState.page = 1;
      panel.querySelectorAll('[data-picker-filter]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      renderPicker();
    });
  });
  panel.querySelector('[data-picker-apply]').addEventListener('click', () => {
    const url = panel.querySelector('[data-picker-url]').value.trim();
    if (!url) { showSaveStatus('请先填链接'); return; }
    applyPickedValue(url);
  });
  panel.querySelector('[data-picker-clear]').addEventListener('click', () => applyPickedValue(''));
  panel.querySelector('[data-picker-url]').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      panel.querySelector('[data-picker-apply]').click();
    }
  });

  return back;
}

function pickerFocusables() {
  return Array.from(
    pickerEl.querySelectorAll('button:not([disabled]), input:not([disabled])')
  ).filter((el) => el.offsetParent !== null);
}

function onPickerKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); closePicker(); return; }
  if (event.key !== 'Tab') return;
  // 焦点圈在弹窗里：aria-modal 只告诉读屏软件「外面别念」，
  // 并不会阻止 Tab 走到背后的页面上去，那一步得自己做。
  const items = pickerFocusables();
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function renderPicker(force) {
  const grid = pickerEl.querySelector('[data-picker-grid]');
  const countEl = pickerEl.querySelector('[data-picker-count]');
  const currentKey = blobKeyOf(pickerState.target ? pickerState.target.value : '');

  if (!blobCache || force) {
    grid.textContent = '';
    const loading = document.createElement('p');
    loading.className = 'blob-empty';
    loading.textContent = '正在读取清单…';
    grid.appendChild(loading);
    countEl.textContent = '';
  }

  let list;
  try {
    list = await fetchBlobList(force);
  } catch (e) {
    grid.textContent = '';
    const bad = document.createElement('p');
    bad.className = 'blob-empty';
    bad.dataset.kind = 'bad';
    bad.textContent = (e && e.message) || '读取失败';
    grid.appendChild(bad);
    countEl.textContent = '读取失败';
    return;
  }
  // 读列表期间弹窗可能已经被关掉了，别再往里画
  if (pickerEl.hidden) return;

  const shownCount = paintBlobGrid(grid, {
    mode: 'pick',
    blobs: list.blobs,
    filter: pickerState.filter,
    currentKey,
    page: pickerState.page,
    pageSize: PICKER_BLOBS_PER_PAGE,
    onPage: (p) => { pickerState.page = p; renderPicker(); },
    onPick: (blob) => applyPickedValue(blob.url),
  });
  pickerState.page = Math.min(pickerState.page, blobPageCount(shownCount, PICKER_BLOBS_PER_PAGE));

  const parts = ['共 ' + list.total + ' 张'];
  if (pickerState.filter !== 'all') parts.push('显示 ' + shownCount);
  if (list.truncated) parts.push('⚠ 部分未列出');
  countEl.textContent = parts.join(' · ');
}

function openPicker(input, trigger) {
  if (!pickerEl) pickerEl = buildPicker();
  pickerState.target = input;
  pickerState.trigger = trigger;
  // 每次打开都从第一页起：上次翻到第 3 页跟这次要选哪张图没有关系
  pickerState.page = 1;

  const label = input.closest('.field-card');
  const labelText = label && label.querySelector('.field-label')
    ? label.querySelector('.field-label').textContent.trim()
    : input.dataset.field;
  pickerEl.querySelector('[data-picker-target]').textContent = labelText;

  const urlInput = pickerEl.querySelector('[data-picker-url]');
  // 当前值是 Blob 图时不预填：那不是「外部链接」，预填会让人以为要手改这串
  urlInput.value = blobKeyOf(input.value) ? '' : input.value;

  pickerEl.hidden = false;
  document.addEventListener('keydown', onPickerKeydown, true);
  renderPicker();
  const first = pickerFocusables()[0];
  if (first) first.focus();
}

function closePicker() {
  if (!pickerEl || pickerEl.hidden) return;
  pickerEl.hidden = true;
  document.removeEventListener('keydown', onPickerKeydown, true);
  const back = pickerState.trigger;
  pickerState.target = null;
  pickerState.trigger = null;
  // 焦点还回触发按钮，不然关掉弹窗后焦点掉到 body，键盘用户要从头 Tab
  if (back && back.isConnected) back.focus();
}

function applyPickedValue(value) {
  const input = pickerState.target;
  // 弹窗开着的时候字段可能已经被重渲染掉了（比如另一处保存触发了列表重画）。
  // 往一个脱离文档的 input 上写值会静默丢失，所以先确认它还在。
  if (!input || !input.isConnected) {
    showSaveStatus('该字段已刷新，请重新打开选择');
    closePicker();
    return;
  }
  input.value = value;
  // 派发 input 事件，交给 bindFields 里已有的绑定做 updateValue / markChanged /
  // updatePreview / syncBlockTitle —— 和上传成功那条路完全一样，不重复实现。
  input.dispatchEvent(new Event('input', { bubbles: true }));
  syncImageControl(input);
  closePicker();
  showSaveStatus(value ? '已选择图片' : '已清空该字段');
}

/* ── 图片字段的控制行 ─────────────────────────────────────────────────
 * 字段本体仍然是那个 input，只是**不再显示**：它继续承载值，
 * hydrateForm / updateValue / updatePreview / 导出 全都不用改一行。
 * 显示层换成「选择图片 + 上传图片 + 当前值」。
 *
 * 从 JS 注入而不是写进 HTML：图片字段一共三处 —— admin.html 里的主图，
 * 加上周边物品与历史条目两个动态生成的字段。写死在模板里就要维护三份一样的标记，
 * 而这里只认 data-type="image-src"，以后再加图片字段会自动带上整套控件。
 */
function syncImageControl(input) {
  const row = input.nextElementSibling;
  if (!row || !row.classList.contains('image-control')) return;
  const valueEl = row.querySelector('.image-value');
  if (!valueEl) return;
  const raw = input.value.trim();
  const key = blobKeyOf(raw);
  if (!raw) {
    valueEl.textContent = '未选择图片';
    valueEl.dataset.kind = 'none';
    valueEl.removeAttribute('title');
  } else if (key) {
    valueEl.textContent = 'Blob · ' + shortBlobKey(key);
    valueEl.dataset.kind = 'blob';
    valueEl.title = raw;
  } else {
    valueEl.textContent = '外部链接 · ' + raw.replace(/^https?:\/\//, '').slice(0, 42);
    valueEl.dataset.kind = 'url';
    valueEl.title = raw;
  }
}

function attachImageControls(scope) {
  (scope || document).querySelectorAll('input[data-type="image-src"]').forEach((input) => {
    if (input.dataset.uploader === '1') return;
    input.dataset.uploader = '1';

    // 输入框退居幕后：display:none 会把它一并移出无障碍树和 Tab 序列，
    // 正是想要的效果 —— 键盘用户不该 Tab 到一个看不见的文本框上。
    // 手填链接的能力没有丢，挪进了弹窗里的「外部链接」。
    input.classList.add('is-behind-picker');

    const row = document.createElement('div');
    row.className = 'image-control';

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'btn btn-sm';
    pick.textContent = '选择图片';

    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = UPLOAD_TYPES.join(',');
    picker.className = 'upload-file';
    // 原生 file 控件样式无法统一，藏起来用按钮代劳
    picker.hidden = true;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm upload-btn';
    btn.textContent = '上传图片';

    const valueEl = document.createElement('span');
    valueEl.className = 'image-value';

    const status = document.createElement('span');
    status.className = 'upload-status';
    // 上传结果要让读屏软件也念出来，否则失败提示只有看得见的人知道
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    row.append(pick, picker, btn, valueEl, status);
    // 插在输入框后面，属于同一张 field-card
    input.insertAdjacentElement('afterend', row);
    syncImageControl(input);

    const setStatus = (text, kind) => {
      status.textContent = text;
      status.dataset.kind = kind || '';
    };

    pick.addEventListener('click', () => openPicker(input, pick));
    btn.addEventListener('click', () => picker.click());

    picker.addEventListener('change', async () => {
      const file = picker.files && picker.files[0];
      // 重置 value，否则再选同一个文件不会触发 change
      picker.value = '';
      if (!file) return;

      if (!UPLOAD_TYPES.includes(file.type)) {
        setStatus(
          file.type === 'image/svg+xml'
            ? '不收 SVG（可内嵌脚本），请先转成 PNG'
            : '不支持的格式：' + (file.type || '未知'),
          'bad'
        );
        return;
      }

      btn.disabled = true;
      setStatus('上传中…（' + fmtSize(file.size) + '）');
      try {
        const url = await uploadFile(file);
        input.value = url;
        // 派发 input 事件，交给已有的绑定去做 updateValue / markChanged / updatePreview，
        // 不在这里重复一遍那三件事——重复就会有一天忘记同步。
        input.dispatchEvent(new Event('input', { bubbles: true }));
        syncImageControl(input);
        // 桶里多了一张，清单缓存作废，否则刚传的图在选择弹窗里看不到
        invalidateBlobCache();
        setStatus('已上传 · ' + fmtSize(file.size), 'ok');
      } catch (e) {
        setStatus((e && e.message) || '上传失败', 'bad');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

// 绑定输入（可重复调用；只给未绑定过的控件挂监听）
function bindFields(scope) {
  (scope || document).querySelectorAll('[data-field]').forEach((input) => {
    if (input.dataset.bound === '1') return;
    input.dataset.bound = '1';

    input.addEventListener('input', () => {
      if (input.dataset.ym) {
        updateValue(input.dataset.field, readYm(input));
        const wrap = input.closest('.field-inline');
        if (wrap) wrap.querySelectorAll('select').forEach((s) => markChanged(s));
        return;
      }
      if (input.dataset.part != null) {
        // 一段变了要把同组各段读齐重拼，不能只写自己那一段
        updateValue(input.dataset.field, readParts(input));
        markChanged(input);
        return;
      }
      updateValue(input.dataset.field, input.value);
      markChanged(input);
      updatePreview(input);
      syncBlockTitle(input);
    });
  });
  // 挂在 bindFields 末尾，是为了让两个调用点（启动时的 document、
  // renderItemList 里的 host）自动都覆盖到，不用记得两处各调一次
  attachImageControls(scope);
}
bindFields(document);

// ───────── 可增删的条目集合 ─────────
const pad2 = (n) => String(n).padStart(2, '0');

const collections = {
  merch: {
    section: 'home',
    orderKey: 'merchOrder',
    prefix: 'merch',
    defaultOrder: defaults.home.merchOrder,
    emptyText: '首页当前没有周边物品。点击上方「添加物品」新建一件。',
    confirmWord: '物品',
    fields: [
      { key: 'title', label: '物品名称', kind: 'text', half: true },
      // 状态信息：可新增下拉（选项来自其它物品正在用的状态）。展示页弹窗的
      // 「状态：…」一行读这里；旧数据 meta 里的「状态：」前缀由
      // normalizeMerchMeta 在读入时迁移过来。
      { key: 'status', label: '状态信息', kind: 'choice', choice: 'merch-status', half: true },
      { key: 'spec', label: '规格信息', kind: 'text', half: true },
      { key: 'meta', label: '编号/类型', kind: 'parts',
        parts: [
          { label: '品类', choice: 'merch-meta-kind' },
          { label: '获得方式', choice: 'merch-meta-how' },
          { label: '售价', choice: 'merch-meta-price' }
        ] },
      { key: 'type', label: '展厅分类', kind: 'select',
        options: [['gift', '舰长礼物'], ['sale', '收藏企划']] },
      { key: 'note', label: '卡片简介', kind: 'textarea', grow: true },
      { key: 'image', label: '图片链接', kind: 'text', preview: true }
    ],
    blank: (n) => ({
      title: '新物品 ' + pad2(n),
      status: '企划中',
      meta: '周边／以官方信息为准／信息更新中',
      note: '记录这件物品的画面来源、材质与收藏故事。',
      image: 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png',
      type: 'gift',
      spec: '以官方信息为准'
    })
  },
  archive: {
    section: 'archive',
    orderKey: 'itemOrder',
    prefix: 'item',
    defaultOrder: defaults.archive.itemOrder,
    emptyText: '历史展厅当前没有条目。点击上方「添加条目」新建一条。',
    confirmWord: '条目',
    fields: [
      { key: 'title', label: '物品名称', kind: 'text', half: true },
      { key: 'date', label: '日期', kind: 'year-month', half: true },
      { key: 'category', label: '类别', kind: 'choice', choice: 'archive-category',
        hint: '选项就是其它条目正在用的类别；下拉的最后一项「＋ 新增类别」可以现场加一个，加完会立刻用在本条目上，并出现在其它条目的下拉里。<strong>没有任何条目在用的类别会自动从下拉里消失。</strong>同时用于列表的「类别：…」与表格视图的标签。' },
      { key: 'state', label: '资料状态', kind: 'text', half: true },
      { key: 'gain', label: '获得方式', kind: 'text', half: true },
      { key: 'desc', label: '简介', kind: 'textarea', grow: true },
      { key: 'image', label: '图片链接', kind: 'text', preview: true }
    ],
    blank: (n) => ({
      title: '新条目 ' + pad2(n),
      date: new Date().getFullYear() + '\n' + pad2(new Date().getMonth() + 1),
      desc: '记录这件历史物品的设计概念、材质规格、获得方式与相关资料。',
      image: 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png',
      category: '未分类',
      state: '档案收录',
      gain: '以官方信息为准'
    })
  }
};

// 顺序数组是唯一权威：不在数组里的条目不会出现在展示页
function getOrder(name) {
  const cfg = collections[name];
  if (!data[cfg.section] || typeof data[cfg.section] !== 'object') data[cfg.section] = {};
  const sec = data[cfg.section];
  if (!Array.isArray(sec[cfg.orderKey])) sec[cfg.orderKey] = cfg.defaultOrder.slice();
  // 丢掉指向不存在数据的脏 id，避免渲染出空白块
  const cleaned = sec[cfg.orderKey].filter((id) => id && typeof sec[id] === 'object' && sec[id] !== null);
  if (cleaned.length !== sec[cfg.orderKey].length) sec[cfg.orderKey] = cleaned;
  return sec[cfg.orderKey];
}

// ── 日期：年 / 月 两个下拉，存回展示页要求的 "YYYY\nMM" ──
// 年份范围写死 2022–2030。注意这是硬边界：落在范围外的旧数据在下拉里找不到
// 对应项，<select> 的 value 会变成空串、看起来像没填，所以要收录更早或更晚的
// 条目，得先把这两个常量挪开，光改数据不行。
const YM_FIRST_YEAR = 2022;
const YM_LAST_YEAR = 2030;

function buildYmSelect(path, part) {
  const sel = document.createElement('select');
  sel.dataset.field = path;
  sel.dataset.type = 'text';
  sel.dataset.ym = part;
  sel.setAttribute('aria-label', part === 'year' ? '年份' : '月份');
  const addOpt = (value, text) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    sel.appendChild(opt);
  };
  if (part === 'year') {
    for (let y = YM_FIRST_YEAR; y <= YM_LAST_YEAR; y++) addOpt(String(y), y + ' 年');
  } else {
    for (let m = 1; m <= 12; m++) addOpt(pad2(m), pad2(m) + ' 月');
  }
  // 年月也走自绘下拉，否则同一张卡里有的列表是系统默认长相、有的是自绘的
  return decorateSelect(sel);
}

function ymParts(value) {
  const bits = String(value == null ? '' : value).split('\n');
  return { year: (bits[0] || '').trim(), month: (bits[1] || '').trim() };
}

// 数据里出现范围外的年月（或为空）时就地补一个选项，避免静默改写用户数据
function setYmSelect(sel, raw) {
  const want = String(raw || '');
  if (![...sel.options].some((o) => o.value === want)) {
    const opt = document.createElement('option');
    opt.value = want;
    opt.textContent = want ? want + (sel.dataset.ym === 'year' ? ' 年' : ' 月') : '—';
    sel.insertBefore(opt, sel.firstChild);
  }
  sel.value = want;
  syncDropdown(sel);
}

function readYm(sel) {
  const wrap = sel.closest('.field-inline');
  const y = wrap && wrap.querySelector('[data-ym="year"]');
  const m = wrap && wrap.querySelector('[data-ym="month"]');
  return (y ? y.value : '') + '\n' + (m ? m.value : '');
}

// ── 「编号/类型」的拆解：形如「品类／售价／获得方式」 ──
// 状态已独立成字段（见下方 normalizeMerchMeta 的旧数据迁移）。
// 拆和拼必须是无损的往返，否则用户一动下拉就会悄悄改坏原来的字符串。
// 两个保护：多出来的段全部并进最后一段（不丢字），结尾的空段拼回去时去掉
// （这样没有分隔符的自由文本不会被补成「随便写的／／」）。
const META_SEP = '／';
const META_COLON = '：';

function metaParts(value) {
  const bits = String(value == null ? '' : value).split(META_SEP);
  return [
    (bits[0] || '').trim(),
    (bits[1] || '').trim(),
    bits.slice(2).join(META_SEP).trim()
  ];
}

function joinMeta(parts) {
  const tail = [parts[0] || '', parts[1] || '', parts[2] || ''];
  while (tail.length && !tail[tail.length - 1]) tail.pop();
  return tail.join(META_SEP);
}

/* 旧数据迁移分两步：
 * 1) 状态独立成字段之前，meta 是「状态：品类／售价／获得方式」：把冒号前
 *    那段挪给 status；已单独填过 status 的不覆盖。
 * 2) 本次把「获得方式」提到「售价」之前：旧顺序「品类／售价／获得方式」
 *    转成「品类／获得方式／售价」。home.merchMetaOrder 是幂等标记，防止下次
 *    读取时再交换一次。纯内存操作，随下一次保存落库；展示页也根据此标记兼容旧数据。 */
function normalizeMerchMeta(content) {
  const home = content && content.home;
  if (!home || typeof home !== 'object') return content;
  const isTargetOrder = home.merchMetaOrder === 'kind-how-price';
  for (const id of Object.keys(home)) {
    const item = home[id];
    if (!item || typeof item !== 'object' || typeof item.meta !== 'string') continue;
    const at = item.meta.indexOf(META_COLON);
    if (at >= 0) {
      const state = item.meta.slice(0, at).trim();
      item.meta = item.meta.slice(at + 1).trim();
      if (state && !String(item.status || '').trim()) item.status = state;
    }
    if (!isTargetOrder) {
      const parts = metaParts(item.meta);
      item.meta = joinMeta([parts[0], parts[2], parts[1]]);
    }
  }
  home.merchMetaOrder = 'kind-how-price';
  return content;
}

// ── 可增选项的下拉：选项表不单独存，完全从「有哪些条目正在用这个值」推导 ──
// 所以「新增选项」就是「把新值写进当前条目」的副产物：它立刻出现在同组其它条目的
// 下拉里；而一旦没有任何条目在用它（输错了、或用它的条目都被改/删了），
// 下次渲染时它自己就消失，不会在数据里攒下一堆删不掉的脏选项。
// 刻意不保留任何常驻种子：选项表 = 当前实际配置的内容，别的都不该出现。
const dedupeList = (list) => list.filter((v, i) => v && list.indexOf(v) === i);

// derive 可选：字段值本身不是选项时（例如 meta 要取其中一段），用它抽出选项文本
function collectChoiceValues(source, section, orderKey, key, derive) {
  const sec = source && source[section];
  if (!sec || typeof sec !== 'object') return [];
  const order = Array.isArray(sec[orderKey]) ? sec[orderKey] : [];
  return dedupeList(order.map((id) => {
    const item = sec[id];
    const val = item && typeof item === 'object' ? item[key] : undefined;
    const raw = val == null ? '' : String(val);
    return derive ? String(derive(raw) || '').trim() : raw.trim();
  }));
}

// meta 三段各自一个选项组，段值靠 derive 从整串里抽出来；状态是独立字段，
// 直接取 item.status，不需要 derive。
// placeholder 要短：分段下拉那一列只有约 170px，举例挪到 example 挂在 title 上。
const choiceGroups = {
  'archive-category': {
    section: 'archive',
    orderKey: 'itemOrder',
    key: 'category',
    addLabel: '新增类别',
    placeholder: '新的类别名称',
    example: '例如「亚克力挂件」'
  },
  'merch-status': {
    section: 'home', orderKey: 'merchOrder', key: 'status',
    addLabel: '新增状态',
    placeholder: '新的状态',
    example: '例如「已开售」'
  },
  'merch-meta-kind': {
    section: 'home', orderKey: 'merchOrder', key: 'meta',
    derive: (v) => metaParts(v)[0],
    addLabel: '新增品类',
    placeholder: '新的品类',
    example: '例如「金属徽章」'
  },
  'merch-meta-how': {
    section: 'home', orderKey: 'merchOrder', key: 'meta',
    derive: (v) => metaParts(v)[1],
    addLabel: '新增方式',
    placeholder: '新的获得方式',
    example: '例如「线下会场限定」'
  },
  'merch-meta-price': {
    section: 'home', orderKey: 'merchOrder', key: 'meta',
    derive: (v) => metaParts(v)[2],
    addLabel: '新增售价',
    placeholder: '新的售价',
    example: '例如「¥68」'
  }
};

function choiceOptions(groupName) {
  const g = choiceGroups[groupName];
  if (!g) return [];
  return collectChoiceValues(data, g.section, g.orderKey, g.key, g.derive);
}

// 选项列表由数据派生，列表里**没有**哨兵项：「新增」是自绘面板底部那一行
// 常驻输入框，不是列表里的一个假选项。所以原来那套 __ADD_NEW__ 的识别、
// 回退到 dataset.prev、以及三道「别把哨兵当真值存进去」的防护全部不再需要。
function paintChoiceOptions(sel) {
  sel.textContent = '';
  choiceOptions(sel.dataset.choice).forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
}

// 数据里的值不在选项表里（导入的 JSON、或值为空）时就地补一个并选中，
// 绝不静默把用户已有的值改写成第一个选项。
function setChoiceSelect(sel, raw) {
  const want = String(raw == null ? '' : raw);
  if (![...sel.options].some((o) => o.value === want)) {
    const opt = document.createElement('option');
    opt.value = want;
    opt.textContent = want || '—（未填写）';
    sel.insertBefore(opt, sel.firstChild);
  }
  sel.value = want;
  syncDropdown(sel);
}

// ── 自绘下拉 ──
// 原生 <select> 的弹出列表是浏览器自己画的：既塞不进输入框，CSS 也管不到它的样式。
// 要「列表底部就是输入框」+「列表不能是系统默认长相」，只能整个列表自己画。
//
// 关键取舍：原生 select 留着不动，只是 display:none，继续当唯一数据源。
// 于是 data-field / bindFields / readParts / readYm / setChoiceSelect / 派生选项
// 那一整套链路一行都不用改；自绘面板只做一件事——改 select.value 再派发 input 事件，
// 等于替用户在原生下拉上点了一下。数据语义因此完全不变。
function decorateSelect(sel, group) {
  const wrap = document.createElement('div');
  wrap.className = 'dropdown';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'dd-trigger';
  trigger.dataset.ddTrigger = '1';
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  const label = sel.getAttribute('aria-label');
  if (label) trigger.setAttribute('aria-label', label);
  const valueEl = document.createElement('span');
  valueEl.className = 'dd-value';
  valueEl.dataset.ddValue = '1';
  trigger.appendChild(valueEl);

  const panel = document.createElement('div');
  panel.className = 'dd-panel';
  panel.hidden = true;
  const list = document.createElement('div');
  list.className = 'dd-list';
  list.dataset.ddList = '1';
  panel.appendChild(list);

  // 可增选项的组：列表底部固定一行输入框。它就是「新增」本身，
  // 不是需要先点开的入口——面板一展开它就在那儿，打字回车即加入。
  // 故意不带 data-field，bindFields（选择器是 [data-field]）不会绑它，
  // 所以敲字的过程不会被当成字段修改写进数据。
  if (group) {
    wrap.dataset.addable = '1';
    const add = document.createElement('div');
    add.className = 'dd-add';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = group.placeholder;
    input.dataset.choiceInput = '1';
    input.setAttribute('aria-label', group.addLabel);
    input.title = group.addLabel + '：' + (group.example || '') + '（回车加入）';
    add.appendChild(input);
    panel.appendChild(add);
  }

  wrap.append(sel, trigger, panel);
  // 用键盘直接操作原生 select、或我们自己派发 input 时，都要同步自绘显示
  sel.addEventListener('input', () => syncDropdown(sel));
  syncDropdown(sel);
  return wrap;
}

// 自绘部分只反映 select 的状态，不自己记状态。
// is-changed 也要镜像过来：select 是 display:none 的，那个「这项改过」的底色
// 必须画在自绘按钮上，否则用户完全看不出自己动过哪些字段。
function syncDropdown(sel) {
  const wrap = sel.closest ? sel.closest('.dropdown') : null;
  if (!wrap) return;
  const opt = sel.options[sel.selectedIndex];
  const valueEl = wrap.querySelector('[data-dd-value]');
  valueEl.textContent = opt ? opt.textContent : '';
  // 空值时 setChoiceSelect 会补一个「—（未填写）」，那不是真内容，调淡
  valueEl.classList.toggle('is-empty', !String(sel.value).trim());
  wrap.classList.toggle('is-changed', sel.classList.contains('is-changed'));
}

// 「改过」的标记要同时落到自绘按钮上，否则画在 display:none 的 select 上没人看见
function markChanged(el) {
  el.classList.add('is-changed');
  if (el.tagName === 'SELECT') syncDropdown(el);
}

// 列表每次展开都重画：可增选项是从数据里派生的，别的卡片一改它就变，
// 缓存下来必然过期。行用真的 <button>——Tab 能走到、回车能激活、
// 焦点框浏览器自带，不需要自己实现一套 roving tabindex。
function renderDropdownList(wrap) {
  const sel = wrap.querySelector('select');
  const list = wrap.querySelector('[data-dd-list]');
  list.textContent = '';
  [...sel.options].forEach((opt) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'dd-option';
    row.dataset.ddOption = opt.value;
    row.textContent = opt.textContent;
    if (opt.value === sel.value) {
      row.classList.add('is-on');
      row.setAttribute('aria-current', 'true');
    }
    list.appendChild(row);
  });
}

function buildChoiceControl(field, path) {
  const sel = document.createElement('select');
  sel.dataset.field = path;
  sel.dataset.type = 'text';
  sel.dataset.choice = field.choice;
  sel.setAttribute('aria-label', field.label);
  paintChoiceOptions(sel);
  return decorateSelect(sel, choiceGroups[field.choice]);
}

// 把几个可增选项下拉拼成一个字段：每个下拉带 data-part=段序号，
// 写回时由 readParts 读齐同一组的所有段再拼成完整字符串（和 year-month 同一套思路）。
function buildPartsControl(field, path) {
  const wrap = document.createElement('div');
  wrap.className = 'field-parts';
  field.parts.forEach((p, i) => {
    const cell = document.createElement('div');
    cell.className = 'field-part';
    const lab = document.createElement('span');
    lab.className = 'field-part-label';
    lab.textContent = p.label;
    const ctrl = buildChoiceControl({ label: field.label + ' · ' + p.label, choice: p.choice }, path);
    ctrl.querySelector('select').dataset.part = String(i);
    cell.append(lab, ctrl);
    wrap.appendChild(cell);
  });
  return wrap;
}

function readParts(sel) {
  const wrap = sel.closest('.field-parts');
  const parts = ['', '', ''];
  (wrap ? [...wrap.querySelectorAll('select[data-part]')] : [sel]).forEach((s) => {
    parts[Number(s.dataset.part)] = s.value;
  });
  return joinMeta(parts);
}

// 新选项里混进分隔符会让重拼后的字符串多出一段，下次读回来就整体错位；
// 冒号是旧版「状态：」前缀的专用分隔符（normalizeMerchMeta 靠它识别旧数据），
// 段内容里出现会破坏迁移。两个都只在 join 时由代码写入，段内容一律不许有。
function partInputError(sel, value) {
  if (sel.dataset.part == null) return '';
  if (value.indexOf(META_SEP) >= 0) return '这一段不能含「' + META_SEP + '」，它是各段之间的分隔符';
  if (value.indexOf(META_COLON) >= 0) return '这一段不能含「' + META_COLON + '」';
  return '';
}

function openDropdown(wrap) {
  // 同时只允许开一个：两个绝对定位的面板叠在一起没法用。
  // 关掉别的用 'away'，语义和「点到别处」一致——那边没提交的输入不会被丢掉。
  document.querySelectorAll('.dropdown.is-open').forEach((other) => {
    if (other !== wrap) closeDropdown(other, 'away');
  });
  renderDropdownList(wrap);
  wrap.dataset.ddOpen = '1';
  wrap.classList.add('is-open');
  wrap.querySelector('[data-dd-trigger]').setAttribute('aria-expanded', 'true');
  wrap.querySelector('.dd-panel').hidden = false;
}

// reason 决定底部那行没提交的输入怎么处理，三种来源语义不同：
//   'pick'  选了列表里的某一项，或刚提交完 —— 用户改了主意，输入作废
//   'esc'   按了 Esc —— 明确取消，输入作废
//   'away'  焦点／鼠标离开了整个下拉 —— 沿用「输完直接点走就落库」的约定，
//           这里必须提交，不能悄悄把用户打的字丢掉
function closeDropdown(wrap, reason) {
  if (!wrap || wrap.dataset.ddOpen !== '1') return;
  const input = wrap.querySelector('[data-choice-input]');
  if (reason === 'away' && input && input.value.trim() && !wrap.dataset.choiceBusy) {
    commitChoice(wrap);  // 它成功后自己会带着 'pick' 收起面板
    return;
  }
  delete wrap.dataset.ddOpen;
  wrap.classList.remove('is-open');
  wrap.querySelector('[data-dd-trigger]').setAttribute('aria-expanded', 'false');
  wrap.querySelector('.dd-panel').hidden = true;
  if (input) input.value = '';
}

// 点列表里的一项 = 替用户在原生 select 上选中它：改完值派发 input 事件，
// 后面写数据／排队保存／预览／标题同步那条链路（bindFields）完全复用。
// 值没变就不派发，免得点一下自己已选中的项也记一次改动。
function pickOption(wrap, value) {
  const sel = wrap.querySelector('select');
  if (sel.value !== value) {
    sel.value = value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
  }
  closeDropdown(wrap, 'pick');
  wrap.querySelector('[data-dd-trigger]').focus();
}

// 只有一条提交路径了：底部输入框回车，或者带着未提交的内容离开这个下拉。
function commitChoice(wrap) {
  if (wrap.dataset.choiceBusy) return;
  const sel = wrap.querySelector('select');
  const input = wrap.querySelector('[data-choice-input]');
  const value = input.value.trim();
  // 空着回车说明想提交但没输入：提示并留在原地，面板不收
  if (!value) { showSaveStatus('请先输入选项名称'); input.focus(); return; }
  const err = partInputError(sel, value);
  // 校验不过就保留面板和已输入的内容，让用户能直接改
  if (err) { showSaveStatus(err); input.focus(); return; }
  // 必须在 updateValue 之前问：写下去之后这个值就能被派生出来了，届时一律显示"已有"
  const existed = choiceOptions(sel.dataset.choice).indexOf(value) >= 0;
  wrap.dataset.choiceBusy = '1';
  // 先把新值落到这个下拉上：分段字段要靠 readParts 读到它才能拼出完整字符串
  setChoiceSelect(sel, value);
  // 再写进数据：走和手动选择完全相同的链路（排队保存）。
  // 必须先写，choiceOptions 才能把这个新值推导出来。
  updateValue(sel.dataset.field, sel.dataset.part == null ? value : readParts(sel));
  markChanged(sel);
  // 同组所有下拉一起重绘，新选项在每个下拉里的排序保持一致
  document.querySelectorAll('select[data-choice="' + sel.dataset.choice + '"]').forEach((other) => {
    const keep = other === sel ? value : other.value;
    paintChoiceOptions(other);
    setChoiceSelect(other, keep);
  });
  closeDropdown(wrap, 'pick');
  delete wrap.dataset.choiceBusy;
  // 输进来的名字可能本来就有（同组别的条目在用），那就是"选用"而不是"新增"，别谎报
  showSaveStatus((existed ? '已选用选项「' : '已加入选项「') + value + '」');
}

function buildControl(field, path) {
  let el;
  if (field.kind === 'year-month') {
    // 复合控件：两个下拉共同写入同一个 "YYYY\nMM"
    el = document.createElement('div');
    el.className = 'field-inline';
    el.append(buildYmSelect(path, 'year'), buildYmSelect(path, 'month'));
    return el;
  }
  if (field.kind === 'choice') {
    // 复合控件：原生 select（数据源）+ 自绘列表，列表底部常驻新增输入框
    return buildChoiceControl(field, path);
  }
  if (field.kind === 'parts') {
    // 复合控件：多个可增选项下拉共同写入同一个字符串字段
    return buildPartsControl(field, path);
  }
  if (field.kind === 'select') {
    el = document.createElement('select');
    field.options.forEach(([value, text]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      el.appendChild(opt);
    });
    // 固定选项的下拉（如展厅分类）没有新增输入框，但列表一样要自绘
    el.dataset.field = path;
    el.dataset.type = 'text';
    el.setAttribute('aria-label', field.label);
    return decorateSelect(el);
  } else if (field.kind === 'textarea') {
    el = document.createElement('textarea');
  } else {
    el = document.createElement('input');
    el.type = 'text';
  }
  el.dataset.field = path;
  el.dataset.type = field.preview ? 'image-src' : 'text';
  return el;
}

// 沿用「输入框在左、大预览在右」的结构，保证与静态分组外观一致
function buildItemBlock(name, id, index, total) {
  const cfg = collections[name];
  const block = document.createElement('div');
  block.className = 'item-block';
  block.dataset.itemBlock = name;
  block.dataset.itemId = id;
  // 记下全局序号：分页后 syncBlockTitle 不能再靠 DOM 位置反推序号了
  block.dataset.itemIndex = String(index);

  const head = document.createElement('div');
  head.className = 'item-block-head';
  const nameEl = document.createElement('span');
  nameEl.className = 'item-block-name';
  nameEl.dataset.itemTitle = '';
  nameEl.textContent = pad2(index + 1) + ' · ' + (resolveKey(cfg.section + '.' + id + '.title') || '未命名');
  const actions = document.createElement('div');
  actions.className = 'item-actions';
  actions.innerHTML =
    '<button class="btn btn-icon" type="button" data-item-move="up" title="上移" aria-label="上移">↑</button>' +
    '<button class="btn btn-icon" type="button" data-item-move="down" title="下移" aria-label="下移">↓</button>' +
    '<button class="btn btn-sm btn-danger" type="button" data-item-remove="1">删除</button>';
  actions.querySelector('[data-item-move="up"]').disabled = index === 0;
  actions.querySelector('[data-item-move="down"]').disabled = index === total - 1;
  head.append(nameEl, actions);

  const group = document.createElement('div');
  group.className = 'field-group';
  const col = document.createElement('div');
  col.className = 'field-col';
  let row = null;
  let previewPath = null;

  cfg.fields.forEach((field) => {
    const path = cfg.section + '.' + id + '.' + field.key;
    const card = document.createElement('div');
    card.className = 'field-card' + (field.half ? '' : ' full') + (field.grow ? ' grow-fill' : '');
    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = field.label;
    card.appendChild(label);
    if (field.hint) {
      const hint = document.createElement('p');
      hint.className = 'field-hint';
      hint.innerHTML = field.hint;
      card.appendChild(hint);
    }
    card.appendChild(buildControl(field, path));
    if (field.preview) previewPath = path;
    if (field.half) {
      if (!row) {
        row = document.createElement('div');
        row.className = 'field-row';
        col.appendChild(row);
      }
      row.appendChild(card);
    } else {
      col.appendChild(card);
    }
  });

  group.appendChild(col);
  if (previewPath) {
    const previewCard = document.createElement('div');
    previewCard.className = 'field-card preview-card';
    const box = document.createElement('div');
    box.className = 'image-preview';
    box.dataset.previewFor = previewPath;
    box.innerHTML = '<span>预览</span>';
    previewCard.appendChild(box);
    group.appendChild(previewCard);
  }

  block.append(head, group);
  return block;
}

/* ── 后台列表分页 ──────────────────────────────────────────────────────
 * 每页最多 4 项；不足 5 项时整条分页不出现（默认的 4 件物品看不出任何变化）。
 *
 * 与展示页分页的关键区别：这里的操作会**改变条目所在的页**，所以三处必须跟着走。
 *   · 新增 → 条目追加在末尾，必定落在最后一页。不跳页的话点了「添加」屏幕上
 *     什么都不会发生，后面的 scrollIntoView 和 focus 也会因为 DOM 里根本没有
 *     这个块而静默失效 —— 看起来就是「按钮坏了」。
 *   · 上移／下移 → 跨页边界时（第 5 项上移成第 4 项）条目会从当前页消失，
 *     必须跟到它的新页，否则像「按了一下，东西没了」。
 *   · 删除／导入更短的备份 → 当前页码可能越界，要收回来。
 *
 * 另外 buildItemBlock 收到的 index / total 一律是**全局**的，不是页内的：
 * 01/02 的编号、以及首尾条目禁用上移/下移，都得按整个列表算。按页算会让
 * 第二页的第一项显示成 01，还会错误地把它的「上移」按钮变灰。
 */
const ITEMS_PER_PAGE = 4;
const listPage = Object.create(null);

const listPageCount = (total) => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
const listPageOf = (index) => Math.floor(index / ITEMS_PER_PAGE) + 1;

function buildListPager(name, page, pages, total) {
  const bar = document.createElement('div');
  bar.className = 'list-pager';
  bar.dataset.listPager = name;

  const status = document.createElement('p');
  status.className = 'list-pager-status';
  status.setAttribute('aria-live', 'polite');
  status.textContent = '共 ' + pad2(total) + ' 项 · 第 ' + pad2(page) + ' / ' + pad2(pages) + ' 页';

  const controls = document.createElement('div');
  controls.className = 'list-pager-controls';

  const button = (label, value, opts) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm';
    b.dataset.listPage = String(value);
    b.textContent = label;
    if (opts && opts.disabled) b.disabled = true;
    if (opts && opts.current) b.setAttribute('aria-current', 'page');
    if (opts && opts.aria) b.setAttribute('aria-label', opts.aria);
    return b;
  };

  controls.appendChild(button('← 上一页', page - 1, { disabled: page === 1 }));
  // 页数多时收成 01 … 04 05 06 … 12，免得页码把整行挤到换行
  for (let p = 1; p <= pages; p++) {
    if (pages <= 7 || p === 1 || p === pages || Math.abs(p - page) <= 1) {
      controls.appendChild(button(pad2(p), p, { current: p === page, aria: '第 ' + p + ' 页' }));
    } else if (!controls.lastElementChild.classList.contains('list-pager-gap')) {
      const gap = document.createElement('span');
      gap.className = 'list-pager-gap';
      gap.setAttribute('aria-hidden', 'true');
      gap.textContent = '…';
      controls.appendChild(gap);
    }
  }
  controls.appendChild(button('下一页 →', page + 1, { disabled: page === pages }));

  bar.append(status, controls);
  return bar;
}

/**
 * 渲染某个列表的当前页。
 * opts.revealId — 让分页跟着这个条目走（新增、上移下移跨页时用）。
 */
function renderItemList(name, opts) {
  const host = document.querySelector('[data-item-list="' + name + '"]');
  if (!host) return;
  const order = getOrder(name);
  const total = order.length;
  const pages = listPageCount(total);

  if (opts && opts.revealId) {
    const at = order.indexOf(opts.revealId);
    if (at >= 0) listPage[name] = listPageOf(at);
  }
  // 删条目、或导入一份更短的备份，都可能让当前页码越界
  const page = Math.min(Math.max(listPage[name] || 1, 1), pages);
  listPage[name] = page;

  host.textContent = '';
  if (!total) {
    const empty = document.createElement('p');
    empty.className = 'item-empty';
    empty.textContent = collections[name].emptyText;
    host.appendChild(empty);
  } else {
    const from = (page - 1) * ITEMS_PER_PAGE;
    order.slice(from, from + ITEMS_PER_PAGE).forEach((id, i) => {
      host.appendChild(buildItemBlock(name, id, from + i, total));
    });
    // 只有一页时不放分页条，而不是放一个隐藏的：省掉「父级 flex 盖掉
    // [hidden] 的 display:none」这一整类坑
    if (pages > 1) host.appendChild(buildListPager(name, page, pages, total));
  }
  const counter = document.querySelector('[data-item-count="' + name + '"]');
  if (counter) counter.textContent = String(total);
  bindFields(host);
  hydrateForm(host);
}

function renderAllItemLists() {
  Object.keys(collections).forEach(renderItemList);
}

// 输入标题时同步块头文字，省去重新渲染
function syncBlockTitle(input) {
  if (!input.dataset.field.endsWith('.title')) return;
  const block = input.closest('[data-item-block]');
  if (!block) return;
  const nameEl = block.querySelector('[data-item-title]');
  if (!nameEl) return;
  // 用 buildItemBlock 写下的全局序号，不再用 DOM 位置反推：分页后一页只有 4 个块，
  // 反推出来的是 0～3，第二页的第一项会被写成 01；末尾追加的分页条也会算进去。
  const index = Number(block.dataset.itemIndex);
  nameEl.textContent = pad2((Number.isFinite(index) ? index : 0) + 1) + ' · ' + (input.value.trim() || '未命名');
}

function makeItemId(name) {
  const cfg = collections[name];
  const sec = data[cfg.section];
  let id;
  do {
    id = cfg.prefix + '-' + Math.random().toString(36).slice(2, 7);
  } while (sec[id]);
  return id;
}

function addItem(name) {
  const cfg = collections[name];
  const order = getOrder(name);
  const sec = data[cfg.section];
  const id = makeItemId(name);
  sec[id] = cfg.blank(order.length + 1);
  order.push(id);
  saveData();
  // 新条目在末尾，必定在最后一页。不跟过去的话下面两行会因为 DOM 里没有这个块
  // 而静默失效，用户点了「添加」看不到任何反应。
  renderItemList(name, { revealId: id });
  const block = document.querySelector('[data-item-block="' + name + '"][data-item-id="' + id + '"]');
  if (block) {
    block.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const first = block.querySelector('[data-field]');
    if (first) first.focus();
  }
  showSaveStatus('已添加，刷新展示页查看');
}

function removeItem(name, id) {
  const cfg = collections[name];
  const order = getOrder(name);
  const sec = data[cfg.section];
  const index = order.indexOf(id);
  if (index < 0) return;
  const title = (sec[id] && sec[id].title) || id;
  if (!confirm('确定删除' + cfg.confirmWord + '「' + title + '」吗？\n它会从展示页一并移除。原始' + cfg.confirmWord + '可通过「数据 → 恢复默认内容」还原。')) return;
  order.splice(index, 1);
  delete sec[id];
  saveData();
  renderItemList(name);
  showSaveStatus('已删除「' + title + '」');
}

function moveItem(name, id, step) {
  const order = getOrder(name);
  const from = order.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= order.length) return;
  order[from] = order[to];
  order[to] = id;
  saveData();
  // 跨页边界时（第 5 项上移成第 4 项）条目会离开当前页，跟着它走，
  // 否则看起来像「按了一下，东西没了」
  renderItemList(name, { revealId: id });
  showSaveStatus('顺序已更新');
}

document.querySelectorAll('[data-item-add]').forEach((btn) => {
  btn.addEventListener('click', () => addItem(btn.dataset.itemAdd));
});

document.querySelector('.admin-content').addEventListener('click', (event) => {
  // 分页按钮在 item-block 之外，得在下面那句 return 之前接住
  const pageBtn = event.target.closest('[data-list-page]');
  if (pageBtn) {
    const pager = pageBtn.closest('[data-list-pager]');
    if (pager) {
      listPage[pager.dataset.listPager] = Number(pageBtn.dataset.listPage);
      renderItemList(pager.dataset.listPager);
    }
    return;
  }
  const block = event.target.closest('[data-item-block]');
  if (!block) return;
  const name = block.dataset.itemBlock;
  const id = block.dataset.itemId;
  if (event.target.closest('[data-item-remove]')) { removeItem(name, id); return; }
  const move = event.target.closest('[data-item-move]');
  if (move) moveItem(name, id, move.dataset.itemMove === 'up' ? -1 : 1);
});

// 自绘下拉：点按钮开合，点列表项选中。列表项是真的 <button>，
// 所以 Tab 走位和回车激活都由浏览器负责，这里只管点击。
document.querySelector('.admin-content').addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-dd-trigger]');
  if (trigger) {
    const wrap = trigger.closest('.dropdown');
    if (wrap.dataset.ddOpen === '1') closeDropdown(wrap, 'pick');
    else openDropdown(wrap);
    return;
  }
  const opt = event.target.closest('[data-dd-option]');
  if (opt) pickOption(opt.closest('.dropdown'), opt.dataset.ddOption);
});

document.querySelector('.admin-content').addEventListener('keydown', (event) => {
  const wrap = event.target.closest('.dropdown');
  if (!wrap) return;
  if (event.target.closest('[data-choice-input]') && event.key === 'Enter') {
    event.preventDefault();
    commitChoice(wrap);
    return;
  }
  if (event.key === 'Escape' && wrap.dataset.ddOpen === '1') {
    event.preventDefault();
    closeDropdown(wrap, 'esc');
    wrap.querySelector('[data-dd-trigger]').focus();
  }
});

// 焦点整个离开这个下拉才收起——在面板里 Tab（列表项 → 输入框）不算离开，
// 所以要看 relatedTarget 是不是还在 wrap 内。为空（点到不可聚焦处）算离开。
document.querySelector('.admin-content').addEventListener('focusout', (event) => {
  const wrap = event.target.closest ? event.target.closest('.dropdown') : null;
  if (!wrap || wrap.dataset.ddOpen !== '1') return;
  if (event.relatedTarget && wrap.contains(event.relatedTarget)) return;
  closeDropdown(wrap, 'away');
});

// 点页面别处也要收起。mousedown 比 focusout 早，且能覆盖「点在不可聚焦元素上」
// 这种 focusout 根本不触发的情况。收起走 'away'，未提交的输入照样落库。
document.addEventListener('mousedown', (event) => {
  document.querySelectorAll('.dropdown.is-open').forEach((wrap) => {
    if (!wrap.contains(event.target)) closeDropdown(wrap, 'away');
  });
});

// 侧边栏切换
const navButtons = document.querySelectorAll('.admin-nav button');
const sections = {
  home: { el: document.getElementById('section-home'), title: '首页元素', sub: '当前展厅页 · 实时预览' },
  archive: { el: document.getElementById('section-archive'), title: '历史展厅', sub: '档案与时间线' },
  data: { el: document.getElementById('section-data'), title: '数据', sub: '导入 / 导出 / 重置' }
};
navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.section;
    navButtons.forEach(b => b.classList.toggle('is-active', b === btn));
    Object.entries(sections).forEach(([key, s]) => s.el.classList.toggle('is-visible', key === target));
    document.getElementById('toolbar-heading').textContent = sections[target].title;
    document.getElementById('toolbar-sub').textContent = sections[target].sub;
    // 「数据」页第一次露面时才去拉 Blob 清单：不开这一页的人不该为它付一次请求。
    // 之后每次切回来也刷一下，因为期间可能上传或保存过（保存会自动回收图片）。
    if (target === 'data') renderBlobPanel();
  });
});

// 预览按钮
document.getElementById('preview-home').addEventListener('click', () => window.open('index.html', '_blank'));
document.getElementById('preview-archive').addEventListener('click', () => window.open('history-archive.html', '_blank'));
document.getElementById('preview-home-2').addEventListener('click', () => window.open('index.html', '_blank'));
document.getElementById('preview-archive-2').addEventListener('click', () => window.open('history-archive.html', '_blank'));

// 手动保存
document.getElementById('save-manual').addEventListener('click', () => {
  clearTimeout(saveTimer);
  saveData();
});

// 导出
document.getElementById('export-json').addEventListener('click', () => {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gyp-content-overrides.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showSaveStatus('已导出 JSON');
});

document.getElementById('copy-json').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    showSaveStatus('已复制到剪贴板');
  } catch (e) {
    showSaveStatus('复制失败');
  }
});

/* ── 导入前评估会丢掉哪些图 ────────────────────────────────────────────
 * 收集器 collectBlobKeys 定义在文件靠前的「Blob 图片键名」一节 —— 它被三处用到
 * （这里、选择弹窗、数据页的清单面板），而其中最早的调用发生在启动时的
 * bindFields(document)，所以定义必须在那之前，不能留在这里。
 *
 * 真正执行删除的是服务端，这里算出来的数量只用于把弹窗写具体。所以弹窗
 * **无条件出现**，不由这个函数的结果决定问不问 —— 万一两边的口径跑偏了，
 * 最坏只是数字不准，绝不会退化成「不提示就把图删了」。
 */

// 导入
document.getElementById('import-apply').addEventListener('click', () => {
  const text = document.getElementById('import-json').value.trim();
  if (!text) { showSaveStatus('请先粘贴 JSON'); return; }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    showSaveStatus('导入失败：JSON 格式有误');
    return;
  }
  // 合法 JSON 不等于合法备份。deepMerge 遇到非对象会原样返回 base，
  // 也就是说导入一个 "123" 会静默变成「恢复默认」——连带删掉所有上传的图。
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    showSaveStatus('导入失败：顶层必须是对象');
    return;
  }
  if (!('home' in parsed) && !('archive' in parsed)) {
    showSaveStatus('导入失败：缺少 home / archive，这不像是本站的备份');
    return;
  }

  // 必须用**合并结果**算差集，不能用 parsed：备份里缺的字段会回落到默认值
  // （默认全是外链），那同样意味着原来那张上传图失去引用。用 parsed 会少算一批。
  const next = deepMerge(nestedDefaults, normalizeMerchMeta(parsed));
  const before = collectBlobKeys(data);
  const after = collectBlobKeys(next);
  const dropped = [...before].filter((k) => !after.has(k));

  const lines = ['确定要导入这份 JSON 吗？', '', '· 线上当前的内容会被立刻覆盖；'];
  if (dropped.length) {
    lines.push(
      '· 其中 ' + dropped.length + ' 张已上传的图片会因为不再被引用而从 Blob 中永久删除，',
      '  此项不可撤销，需要重新上传原文件才能恢复：'
    );
    dropped.slice(0, 5).forEach((k) => lines.push('    ' + k));
    if (dropped.length > 5) lines.push('    …另有 ' + (dropped.length - 5) + ' 张');
  } else {
    lines.push('· 已上传的图片不受影响（这份备份仍然引用着它们）。');
  }
  if (!confirm(lines.join('\n'))) { showSaveStatus('已取消导入'); return; }

  data = next;
  saveData();
  renderAllItemLists();
  hydrateForm();
  showSaveStatus('导入成功');
});

document.getElementById('import-from-file').addEventListener('click', () => {
  document.getElementById('import-file').click();
});
document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('import-json').value = reader.result;
    showSaveStatus('已读取文件，点击「导入并应用」生效');
  };
  reader.readAsText(file);
});

// 重置
document.getElementById('reset-all').addEventListener('click', () => {
  // 提示里必须点明图片会被删：默认内容全是外链，恢复默认等于让所有上传过的图
  // 都变成「不再被引用」，/api/content 的自动回收会把它们从 Blob 里删掉。
  // 只说「内容被覆盖」会让人以为图还在桶里。
  if (!confirm(
    '确定要恢复所有默认内容吗？\n\n' +
    '· 线上当前的自定义（含新增／删除的条目）将被覆盖；\n' +
    '· 上传到 Blob 的图片会因为不再被引用而被自动删除，此项不可撤销' +
    '（需要重新上传原文件才能恢复）。'
  )) return;
  data = structuredClone(nestedDefaults);
  renderAllItemLists();
  hydrateForm();
  document.querySelectorAll('.is-changed').forEach(el => el.classList.remove('is-changed'));
  clearTimeout(saveTimer);
  saveData();
});

// 连接状态徽标
function setConnBadge() {
  const el = document.getElementById('conn-badge');
  if (!el) return;
  const map = {
    ready: ['is-ready', '● 已连接线上'],
    locked: ['is-locked', '● 会话已失效'],
    offline: ['is-offline', '● 离线（改动不会保存）']
  };
  const [cls, text] = map[apiState] || map.offline;
  el.className = 'conn-badge ' + cls;
  el.textContent = text;
  const foot = document.getElementById('aside-foot-text');
  if (foot) {
    foot.innerHTML = apiState === 'ready'
      ? '内容保存在线上 KV<br>所有访客即时可见'
      : (apiState === 'locked'
        ? '会话已失效<br>请重新登录后再保存'
        : '接口不可用<br>当前仅本地预览，改动不会保存');
  }
}

// 退出登录：让服务端清掉会话 Cookie，再回登录页
document.getElementById('logout').addEventListener('click', async () => {
  try {
    await fetch(AUTH_API, { method: 'DELETE', credentials: 'same-origin' });
  } catch (e) {
    // 请求失败也要走人，不能把用户困在后台里
    console.warn('登出接口不可用：', e);
  }
  goLogin(false);
});

// 启动：先渲染默认内容，再校验会话，最后拉线上内容覆盖
renderAllItemLists();
hydrateForm();
setConnBadge();

(async function bootstrap() {
  // 第一步先问会话状态。中间件只看 Cookie 是否存在，挡不住伪造的 Cookie，
  // 所以这里必须再问一次服务端（它才有 ADMIN_TOKEN，能验签名）。
  if (hasBackend) {
    try {
      const res = await fetch(AUTH_API, { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) authState = await res.json();
    } catch (e) {
      console.warn('身份接口不可用：', e);
    }

    if (!authState.authenticated) {
      if (authState.configured) {
        // 口令已配置但会话无效 → 去登录
        goLogin(true);
        return;
      }
      // 口令没配置：登录页也帮不上忙，留在这里把原因说清楚
      apiState = 'locked';
      showSaveStatus('服务端未配置 ADMIN_TOKEN，无法保存');
      setConnBadge();
    }
  }

  try {
    data = await loadData();
    renderAllItemLists();
    hydrateForm();
    showSaveStatus('已载入线上内容');
  } catch (e) {
    // 接口不可用：保留默认内容，明确告知用户改动不会生效
    showSaveStatus('未连接到线上接口，当前为本地预览');
    console.warn('内容接口不可用：', e);
  }
  setConnBadge();
})();
