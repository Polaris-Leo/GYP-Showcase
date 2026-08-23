/* 鸽一品内容后台 · 逻辑。数据存 EdgeOne KV，经 /api/content 读写 */
// 内容接口：EdgeOne Pages Function，读写绑定的 KV
const CONTENT_API = '/api/content';
// 管理口令只存在当前标签页（sessionStorage），关闭即失效；内容本身一律存线上 KV
const TOKEN_KEY = 'gyp-admin-token';
const getToken = () => sessionStorage.getItem(TOKEN_KEY) || '';
const setToken = (v) => { if (v) sessionStorage.setItem(TOKEN_KEY, v); else sessionStorage.removeItem(TOKEN_KEY); };

// 默认值模板（用于初次填充和重置）
const defaults = {
  home: {
    'brand-home': '鸽一品\nGEYIPIN',
    'nav-collection': '收藏',
    'nav-history': '历史展厅',
    'nav-captain': '舰长礼物',
    'hero-heading': '把一片天空\n带回家。',
    'hero-intro': '这里收录与鸽一品角色故事有关的周边设想：可以收藏、可以相赠，也可以在未来成为真实的发售企划。每一件都有它的画面、来处与说明。',
    'hero-primary-cta': '浏览本期展厅',
    'hero-artwork.src': 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png',
    'collection-heading': '周边清单\n× 04',
    merchOrder: ['merch-sky', 'merch-plush', 'merch-birthday', 'merch-cafe'],
    'merch-sky.title': '云上通行证',
    'merch-sky.meta': '设想：入会纪念票卡／无售价／限时寄送',
    'merch-sky.note': '把晴空、白鸽和长长的缎带压进一张可被收藏的通行证，留给一起飞过这段旅程的人。',
    'merch-sky.image': 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png',
    'merch-sky.type': 'gift',
    'merch-plush.title': '云团抱枕',
    'merch-plush.meta': '设想：异形抱枕／无售价／季度礼物',
    'merch-plush.note': '用画面中被拥抱的小鸟做成软软的轮廓，作为桌面和沙发上的陪伴物。',
    'merch-plush.image': 'https://i0.hdslb.com/bfs/garb/open/171b8d6f02d93b4ee97fa230eff3ecad5e63e9fd.png',
    'merch-plush.type': 'gift',
    'merch-birthday.title': '生日小夜灯',
    'merch-birthday.meta': '设想：亚克力夜灯／待定／生日限定',
    'merch-birthday.note': '生日画面的糖果色被裁成一盏小灯；点亮时，桌面像刚刚拆开一份礼物。',
    'merch-birthday.image': 'https://i0.hdslb.com/bfs/garb/open/436cd3b761aaa29766c7fad8e44b4672f7734eef.png',
    'merch-birthday.type': 'sale',
    'merch-cafe.title': '星屿立牌',
    'merch-cafe.meta': '设想：双层亚克力／待定／常规收藏',
    'merch-cafe.note': '前景是认真端盘的鸽一品，背面藏着忙碌的小白鸽；从不同角度看，像一段有声音的餐桌故事。',
    'merch-cafe.image': 'https://i0.hdslb.com/bfs/garb/item/c6836114214dcba20fcc30167be8239863b9083e.png',
    'merch-cafe.type': 'sale',
    'captain-heading': '礼物不是门槛，\n是一起留下的记号。'
  },
  archive: {
    'archive-brand-home': '鸽一品\nGEYIPIN',
    'nav-current-collection': '当前展厅',
    'nav-archive-list': '历史展厅',
    'archive-title': '让每一件，\n都有来处。',
    'archive-intro': '这里收录曾经出现过的周边与纪念物。首批六件作为档案模板：名称与时间线用于展示，图片、规格、获得方式仍待对应的真实资料补全。',
    itemOrder: ['item-star', 'item-badge', 'item-card', 'item-keychain', 'item-color-paper', 'item-summer'],
    'item-star.title': '星羽立牌',
    'item-star.date': '2025\n10',
    'item-star.desc': '首批历史档案的示例条目：以飞鸟和缎带为轮廓的双层亚克力立牌，待补充真实设计稿、尺寸与发售渠道。',
    'item-star.image': 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png',
    'item-star.category': '亚克力立牌',
    'item-badge.title': '云团徽章组',
    'item-badge.date': '2025\n11',
    'item-badge.desc': '以云朵、小鸟和表情切片组织的收藏徽章组。此处用于记录日后需要补录的图案、工艺与实际发售月份。',
    'item-badge.image': 'https://i0.hdslb.com/bfs/garb/open/171b8d6f02d93b4ee97fa230eff3ecad5e63e9fd.png',
    'item-badge.category': '马口铁徽章',
    'item-card.title': '冬日天空透卡',
    'item-card.date': '2025\n12',
    'item-card.desc': '一组围绕节日问候设计的透明卡片。档案完成时可在此补上每张卡的正反面、套组数量与原始包装照片。',
    'item-card.image': 'https://i0.hdslb.com/bfs/garb/open/436cd3b761aaa29766c7fad8e44b4672f7734eef.png',
    'item-card.category': '透卡套组',
    'item-keychain.title': '羽毛信笺挂件',
    'item-keychain.date': '2026\n02',
    'item-keychain.desc': '以角色来信作为概念的金属或亚克力挂件。这里保留了一个适合补入挂件实拍、材质与随附卡片说明的位置。',
    'item-keychain.image': 'https://i0.hdslb.com/bfs/garb/item/c6836114214dcba20fcc30167be8239863b9083e.png',
    'item-keychain.category': '钥匙扣／挂件',
    'item-color-paper.title': '生日纪念色纸',
    'item-color-paper.date': '2026\n04',
    'item-color-paper.desc': '用于记录一年一次的祝福时刻。后续可增加绘师、签名形式、寄送范围与完整包装等已确认资料。',
    'item-color-paper.image': 'https://i0.hdslb.com/bfs/garb/open/436cd3b761aaa29766c7fad8e44b4672f7734eef.png',
    'item-color-paper.category': '纪念色纸',
    'item-summer.title': '夏日集会立牌',
    'item-summer.date': '2026\n06',
    'item-summer.desc': '这一页时间线暂以夏日主题收束。未来替换为实物照后，可成为浏览历年物品、补充再售讯息的长期档案入口。',
    'item-summer.image': 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png',
    'item-summer.category': '亚克力立牌'
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
    return deepMerge(nestedDefaults, parsed && typeof parsed === 'object' ? parsed : {});
  } catch (e) {
    apiState = 'offline';
    throw e;
  }
}

async function pushData() {
  const res = await fetch(CONTENT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': getToken() },
    body: JSON.stringify(data)
  });
  if (res.status === 401) { apiState = 'locked'; throw new Error('口令不正确或已失效'); }
  if (!res.ok) {
    let detail = 'HTTP ' + res.status;
    try { const j = await res.json(); if (j && j.error) detail = j.error; } catch (_) {}
    throw new Error(detail);
  }
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
    if (input.dataset.ym) {
      setYmSelect(input, ymParts(value)[input.dataset.ym]);
      return;
    }
    input.value = value != null ? value : '';
    updatePreview(input);
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

// 绑定输入（可重复调用；只给未绑定过的控件挂监听）
function bindFields(scope) {
  (scope || document).querySelectorAll('[data-field]').forEach((input) => {
    if (input.dataset.bound === '1') return;
    input.dataset.bound = '1';
    input.addEventListener('input', () => {
      if (input.dataset.ym) {
        updateValue(input.dataset.field, readYm(input));
        const wrap = input.closest('.field-inline');
        if (wrap) wrap.querySelectorAll('select').forEach((s) => s.classList.add('is-changed'));
        return;
      }
      updateValue(input.dataset.field, input.value);
      input.classList.add('is-changed');
      updatePreview(input);
      syncBlockTitle(input);
    });
  });
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
      { key: 'meta', label: '编号/类型', kind: 'text', half: true },
      { key: 'type', label: '展厅分类', kind: 'select',
        hint: '决定首页筛选归类，以及卡片序号后缀（GIFT / PLAN）。',
        options: [['gift', '舰长礼物'], ['sale', '收藏企划']] },
      { key: 'note', label: '卡片简介', kind: 'textarea', grow: true },
      { key: 'image', label: '图片链接', kind: 'text', preview: true,
        hint: '填图床完整链接。B 站装扮素材的链接＝<code>https://i0.hdslb.com/bfs/garb/open/</code> ＋ 图片文件名。' }
    ],
    blank: (n) => ({
      title: '新物品 ' + pad2(n),
      meta: '设想：待补充／待定／待定',
      note: '在这里写下这件物品的设想：画面从哪来、想用什么材质，以及它为什么值得被收藏。',
      image: 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png',
      type: 'gift'
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
      { key: 'date', label: '日期', kind: 'year-month', half: true,
        hint: '直接选择年月；展示页仍会分两行显示年份与月份。' },
      { key: 'category', label: '类别', kind: 'text',
        hint: '同时用于列表的「类别：…」与表格视图的标签。' },
      { key: 'desc', label: '简介', kind: 'textarea', grow: true },
      { key: 'image', label: '图片链接', kind: 'text', preview: true,
        hint: '填图床完整链接。B 站装扮素材的链接＝<code>https://i0.hdslb.com/bfs/garb/open/</code> ＋ 图片文件名。' }
    ],
    blank: (n) => ({
      title: '新条目 ' + pad2(n),
      date: new Date().getFullYear() + '\n' + pad2(new Date().getMonth() + 1),
      desc: '在这里补充这件历史物品的资料：设计概念、材质规格、获得方式与实物照片的来源。',
      image: 'https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png',
      category: '待补充'
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
const YM_FIRST_YEAR = 2020;

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
    const last = new Date().getFullYear() + 2;
    for (let y = YM_FIRST_YEAR; y <= last; y++) addOpt(String(y), y + ' 年');
  } else {
    for (let m = 1; m <= 12; m++) addOpt(pad2(m), pad2(m) + ' 月');
  }
  return sel;
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
}

function readYm(sel) {
  const wrap = sel.closest('.field-inline');
  const y = wrap && wrap.querySelector('[data-ym="year"]');
  const m = wrap && wrap.querySelector('[data-ym="month"]');
  return (y ? y.value : '') + '\n' + (m ? m.value : '');
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
  if (field.kind === 'select') {
    el = document.createElement('select');
    field.options.forEach(([value, text]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      el.appendChild(opt);
    });
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

  const head = document.createElement('div');
  head.className = 'item-block-head';
  const nameEl = document.createElement('span');
  nameEl.className = 'item-block-name';
  nameEl.dataset.itemTitle = '';
  nameEl.textContent = pad2(index + 1) + ' · ' + (resolveKey(cfg.section + '.' + id + '.title') || '未命名');
  const keyEl = document.createElement('span');
  keyEl.className = 'item-block-key';
  keyEl.textContent = id;
  const actions = document.createElement('div');
  actions.className = 'item-actions';
  actions.innerHTML =
    '<button class="btn btn-icon" type="button" data-item-move="up" title="上移" aria-label="上移">↑</button>' +
    '<button class="btn btn-icon" type="button" data-item-move="down" title="下移" aria-label="下移">↓</button>' +
    '<button class="btn btn-sm btn-danger" type="button" data-item-remove="1">删除</button>';
  actions.querySelector('[data-item-move="up"]').disabled = index === 0;
  actions.querySelector('[data-item-move="down"]').disabled = index === total - 1;
  head.append(nameEl, keyEl, actions);

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
    label.append(document.createTextNode(field.label + ' '));
    const code = document.createElement('code');
    code.textContent = id + '.' + field.key;
    label.appendChild(code);
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

function renderItemList(name) {
  const host = document.querySelector('[data-item-list="' + name + '"]');
  if (!host) return;
  const order = getOrder(name);
  host.textContent = '';
  if (!order.length) {
    const empty = document.createElement('p');
    empty.className = 'item-empty';
    empty.textContent = collections[name].emptyText;
    host.appendChild(empty);
  } else {
    order.forEach((id, index) => host.appendChild(buildItemBlock(name, id, index, order.length)));
  }
  const counter = document.querySelector('[data-item-count="' + name + '"]');
  if (counter) counter.textContent = String(order.length);
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
  const index = Array.prototype.indexOf.call(block.parentElement.children, block);
  nameEl.textContent = pad2(index + 1) + ' · ' + (input.value.trim() || '未命名');
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
  renderItemList(name);
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
  renderItemList(name);
  showSaveStatus('顺序已更新');
}

document.querySelectorAll('[data-item-add]').forEach((btn) => {
  btn.addEventListener('click', () => addItem(btn.dataset.itemAdd));
});

document.querySelector('.admin-content').addEventListener('click', (event) => {
  const block = event.target.closest('[data-item-block]');
  if (!block) return;
  const name = block.dataset.itemBlock;
  const id = block.dataset.itemId;
  if (event.target.closest('[data-item-remove]')) { removeItem(name, id); return; }
  const move = event.target.closest('[data-item-move]');
  if (move) moveItem(name, id, move.dataset.itemMove === 'up' ? -1 : 1);
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

// 导入
document.getElementById('import-apply').addEventListener('click', () => {
  const text = document.getElementById('import-json').value.trim();
  if (!text) { showSaveStatus('请先粘贴 JSON'); return; }
  try {
    const parsed = JSON.parse(text);
    data = deepMerge(nestedDefaults, parsed);
    saveData();
    renderAllItemLists();
    hydrateForm();
    showSaveStatus('导入成功');
  } catch (e) {
    showSaveStatus('导入失败：JSON 格式有误');
  }
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
  if (!confirm('确定要恢复所有默认内容吗？线上当前的自定义（含新增／删除的条目）将被覆盖。')) return;
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
    locked: ['is-locked', '● 需要口令'],
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
        ? '尚未验证口令<br>点右上「解锁」后可保存'
        : '接口不可用<br>当前仅本地预览，改动不会保存');
  }
}

// 解锁（输入管理口令）
document.getElementById('unlock').addEventListener('click', async () => {
  const input = prompt('请输入管理口令：', '');
  if (input == null) return;
  setToken(input.trim());
  clearTimeout(saveTimer);
  await saveData();
});

// 启动：先渲染默认内容，再拉线上内容覆盖
renderAllItemLists();
hydrateForm();
setConnBadge();

(async function bootstrap() {
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
