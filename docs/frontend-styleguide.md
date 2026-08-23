# 鸽一品周边展厅 · 前端样式说明

**用途：** 后续改动或新增页面/元素时照此执行，保证三个页面视觉与代码风格一致。
本文所有数值都是从现有源码里抄出来的真实值，不是近似描述——可以直接复制粘贴。

配套文档：`brand-spec.md`（品牌来源与色彩依据）、`creative-direction.md`（创作方向）、`NOTES.md`（复刻来源与已知缺口）。

---

## 0. 文件地图

交付目录是 `site/`，它同时也是代码仓的根目录和 EdgeOne 的部署根目录，结构一一对应：

| 文件 | 角色 | 样式块位置 |
|---|---|---|
| `index.html` | 首页 · 当前展厅 | 内联 `<style>` 第 9–249 行 |
| `history-archive.html` | 历史档案展厅（列表／表格双视图 + 分页） | 内联 `<style>` 第 9–152 行 |
| `admin.html` | 后台管理页 · **仅结构**，236 行 | 无内联样式 |
| `login.html` | 后台登录页 · 自包含单文件 | 内联 `<style>`（令牌与站点一致） |
| `assets/admin.css` | 后台样式（513 行） | 整个文件 |
| `assets/admin.js` | 后台逻辑（741 行） | — |
| `assets/login.js` | 登录页逻辑（普通脚本，非 module） | — |
| `functions/api/content.js` | EdgeOne 边缘函数：读写 KV，写入前验签 | — |
| `functions/api/auth.js` | EdgeOne 边缘函数：登录 / 登出 / 查询会话 | — |
| `middleware.js` | 边缘中间件：未登录跳登录页（**仅体验，非安全边界**） | — |
| `edgeone.json` | EdgeOne 项目配置：`/api/*` 不缓存、后台页禁止索引 | — |

仓库里**没有任何图片**，站点图标也走图床（见 §9）。

技术约定，不要打破：

- **原生 JS，无构建工具、无框架、无运行时依赖**，双击用 `file://` 就能打开。
- **两个展示页保持单文件内联 `<style>`**：它们要能被单独丢到任何地方打开，少一个请求就少一个出错点。
- **后台页拆成 HTML + 外部 CSS/JS**：它有 1400 多行，内联会超出单文件上限。外部脚本用
  `<script src="assets/admin.js" defer>`——**必须是 classic script，不许写 `type="module"`**，
  否则 `file://` 下会因 CORS 直接不执行。同理 `assets/admin.js` 里不能出现 `import` / `export`。
- 每个文件控制在 1000 行上下；超了就抽外部文件，不要无限膨胀。
- **图片一律走图床直链** `https://i0.hdslb.com/bfs/garb/open/<文件名>`，不放本地副本。
  **没有例外**——站点图标也是图床链接，所以仓库里一张图片都没有（见 §9）。
- 新页面从现有展示页**复制整段 `:root` + 基础重置**开始，不要重写 CSS。


---

## 1. 设计令牌（复制这一段就对了）

三个页面共用同一套 `:root`。新页面直接照抄：

```css
:root {
  --bg: oklch(1 0 0);              /* 纸白，页面底色 */
  --surface: oklch(0.97 0 0);      /* 极浅灰，图片容器底 / hover 底 */
  --fg: oklch(0.28 0 0);           /* 主文字、实线分隔、强分组线 */
  --muted: oklch(0.56 0 0);        /* 次要文字、编号、元信息 */
  --border: oklch(0.9 0 0);        /* 常规 1px 分隔线 */
  --accent: oklch(0.53 0.12 257);  /* 晴空蓝，唯一强调色 */
  --display: "Noto Serif SC", "Songti SC", STSong, serif;
  --body: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
  --mono: ui-monospace, "Cascadia Mono", monospace;
  --ease: cubic-bezier(.22, .61, .36, 1);
  --page-x: clamp(20px, 3.3vw, 58px);   /* 全站左右安全边距 */
}
```

`admin.html` 额外两个（仅后台用）：

```css
--surface-2: oklch(0.94 0 0);   /* 已声明但目前无引用；要用二级底色就用它，别新造灰阶 */
--danger: oklch(0.55 0.2 27);   /* 只给「删除」这类破坏性操作的文字/描边 */
```

### 用色纪律

1. **强调色每屏最多出现两次。** 目前的分配：首页 Hero 的 `.primary-action` 实心按钮 + 全站 `:focus-visible` 焦点环。历史页正文里没有实心蓝按钮，别加。
2. **派生色用 `oklch()` 手写，不要引入新的 hex。** 现有派生值只有这几个，复用它们：
   - 按钮 hover 深蓝：`oklch(0.45 0.12 257)`
   - 选中文本底：`oklch(0.9 0.05 257)`
   - 后台「已修改」输入框：底 `oklch(0.96 0.02 257 / .35)`、描边 `oklch(0.72 0.08 257)`
   - 图上白色标签底：`oklch(1 0 0 / .88)`（首页）／`oklch(1 0 0 / .9)`（历史页）
   - 弹层阴影 `oklch(0.28 0 0 / .24)`、遮罩 `oklch(0.28 0 0 / .38)`、装饰圆环描边 `oklch(0.28 0 0 / .14)`
3. **不加圆角、不加投影。** 唯一例外是 `dialog` 的 `box-shadow` 和装饰性 `.orbit`（`border-radius: 50%`）。图片容器全部直角裁切。
4. 不用渐变做背景。`select` 的下拉小箭头是用两条 `linear-gradient` 画的三角形，属功能实现，不算装饰渐变。

---

## 2. 排版

**三种字体各有固定职责，不要混用：**

| 字体 | 用在哪 |
|---|---|
| `--display`（衬线） | `h1`、`h2`、卡片 `h3`、后台区块标题、大数字 |
| `--body`（黑体） | 正文段落、按钮、表单控件 |
| `--mono` | 品牌字、编号（`01 / GIFT`、`ARCHIVE 03`）、日期、元信息、页脚、小标签 |

**衬线大标题的固定手法：** 大字号 + 负字距 + 紧行高。字号越大，字距收得越紧。

| 层级 | font-size | letter-spacing | line-height |
|---|---|---|---|
| 首页 `h1` | `clamp(58px, 7.5vw, 124px)` | `-.075em` | `.86` |
| 历史页 `h1` | `clamp(60px, 9vw, 144px)` | `-.08em` | `.86` |
| 区块 `h2`（首页 collection） | `clamp(38px, 5.6vw, 76px)` | `-.065em` | `.98` |
| 区块 `h2`（历史页 gallery） | `clamp(42px, 6vw, 84px)` | `-.07em` | `.96` |
| 弹层 `h2` | `clamp(42px, 5vw, 70px)` | `-.07em` | `.95` |
| 首页卡片 `h3` | `clamp(27px, 2.6vw, 43px)` | `-.055em` | `1` |
| 历史列表 `h3` | `clamp(30px, 3.2vw, 48px)` | `-.06em` | `1` |
| 历史表格 `h3` | `clamp(23px, 2.2vw, 33px)` | `-.055em` | `1` |
| 后台 `h1` / `h2` / `h3` | `clamp(22px,2.4vw,34px)` / `clamp(28px,3.2vw,46px)` / `20–22px` | `-.03 ~ -.05em` | `.96–1` |

**正文与小字（这几档就够了，别新造字号）：**

- 正文段落 `13–16px` / `line-height 1.6–1.8`（越长的段落行高越大）
- 次要说明 `12–14px`，配 `color: var(--muted)`
- mono 小标签 `10–11px`，配 `letter-spacing: .04–.08em`
- 段落宽度用 `max-width: 28–33em` 卡住，不要让正文横跨整屏

**行宽与断行：** 大标题用 `max-width: 7em`／`7.3em` 控制换行位置；移动端解开为 `max-width: none` 并把字距收到 `-.09em`。禁止用 `white-space: nowrap` 硬撑标题，也禁止 `overflow: hidden` 藏掉溢出文字。

---

## 3. 布局系统

**页面骨架（三段式）：**

```
.site-header   →  padding: 24px var(--page-x) 0;  min-height: 88px
                  grid-template-columns: 1fr auto 1fr（左品牌／中说明／右导航）
main           →  padding: 0 var(--page-x)
footer         →  padding: 16px var(--page-x) 24px;  同样 1fr auto 1fr
```

**分隔线是这个设计的主要结构语言，两级：**

- `1px solid var(--border)` —— 常规分隔（Hero 底、卡片网格线、列表行、字段卡缝隙）
- `1px solid var(--fg)` —— 强分组线，只用在「章节开始/结束」：`.gallery-head`、`.pagination`、后台 `.section-head`

**网格线的做法：** 容器给 `border-left` + `border-top`，每个格子给 `border-right` + `border-bottom`，靠重叠拼出连续网格。首页 `.collection-grid` 是 2 列，历史页 `.archive-grid` 是 3 列。新增网格时照这个来，不要给每个卡片画四边框。

**大留白靠 `clamp` 的垂直内边距撑出来：**

- 章节标题区 `padding: clamp(70px, 10vw, 144px) 0 44px`
- 长文区块 `padding: clamp(85px, 12vw, 170px) 0`
- 分页区 `padding: 26px 0 clamp(90px, 12vw, 150px)`

**卡片最小高度（保证画面节奏，不要调小）：** 首页 `.merch-card` 430px、历史 `.archive-grid-card` 508px（图 340px + 文案 144px）、历史列表行 `.archive-item` 330px、弹层 `.dialog-inner` 510px。

---

## 4. 组件规范

### 4.1 展示页

| 组件 | 关键约定 |
|---|---|
| `.brand` | mono 14px，`letter-spacing: .08em`，两行「鸽一品 / GEYIPIN」 |
| `.header-nav a` | 默认透明下边框，hover/focus 变 `var(--fg)`——用**下划线**表示可点，不改文字颜色 |
| `.hero` | 双列 `minmax(0,1.13fr) minmax(280px,.87fr)`，左文右图，`border-bottom` 收口 |
| `.hero-image-wrap` | `aspect-ratio: 1240 / 1867`（素材原始比例），`width: min(78%, 480px)`，居中；`::after` 伪元素做左下角图注 |
| `.subnav` | mono 10px 两端对齐的一行元信息条 |
| `.filters` | 一排 ghost 按钮，选中态只是 `border-color: var(--fg)`，不填色 |
| `.merch-card` | 内部再分双列：左图右文；文案区 `.merch-info` 用 `margin: auto 0 12px` 把标题顶到垂直居中偏下 |
| `.detail-link` | 文字 + 下边框的行内按钮，hover 时下边框转 `--accent` |
| `.archive-item` | 三列：日期 / 图 / 文案，`minmax(110px,.46fr) minmax(240px,1fr) minmax(220px,.82fr)` |
| `.archive-date` | mono，`clamp(18px,1.9vw,27px)`，年月**两行**显示（`<br>` 分隔） |
| `.archive-grid-card` | 整卡可点：`role="button" tabindex="0"`，focus 环用 `outline-offset: -4px` 画在卡内 |
| `.pagination` | 左侧 `aria-live="polite"` 状态文本，右侧上一页/下一页；禁用态降对比是允许的 |
| `dialog` | 原生 `<dialog>`，`width: min(920px, calc(100vw - 28px))`，左图右文，`::backdrop` 加 3px 模糊 |
| `.back-to-top` | 固定右下 48×48，滚动后加 `.is-visible`；hover 黑白反转 |
| `footer` | mono 10px，`1fr auto 1fr`，移动端塌成单列且全部左对齐 |

### 4.2 后台页

| 组件 | 关键约定 |
|---|---|
| `.admin-shell` | `grid-template-columns: 280px minmax(0, 1fr)`，左侧栏 `position: sticky` 满高 |
| `.admin-nav button` | 左侧 2px 指示条表示选中（`.is-active`），移动端改成底部 2px |
| `.admin-toolbar` | sticky 顶栏，`z-index: 5`，右侧放操作按钮组 |
| `.btn` / `.btn-primary` / `.btn-danger` | 全站只有**一个** `.btn-primary`（保存）；删除用 `.btn-danger`（文字色 `--danger`，hover 才把描边转成 `--danger`） |
| `.field-group` | **flex 行**，底色 `var(--border)`、子卡片底色 `var(--bg)`、`gap: 1px` —— 缝隙即分隔线 |
| `.field-col` + `.field-card.preview-card` | 左侧输入列（`flex: 5 1 340px`）+ 右侧大图预览（`flex: 1 1 300px`）。两者高度必须相等 |
| `.field-card.grow-fill` | 简介卡吸收左列剩余高度，其 `textarea` 跟着变高，用来抹平与右侧预览的高度差——**不要用固定高度硬凑** |
| `.preview-card .image-preview` | `aspect-ratio: 1240 / 1867`，和首页主视觉同比例；`object-fit: contain` 完整显示 |
| `.field-card.full` | 独占一整行的字段卡（`flex: 1 1 100%`）。默认 `.field-card` 是 `flex: 1 1 260px`，会自动与邻卡并排；长文本字段用 `.full` |
| `.field-inline` | 两个 `select` 并排占一行（年/月），`flex: 1 1 0; min-width: 0` |
| `.field-choice` + `.choice-new` | 可增选项的下拉：上排「`select` + ＋新增」，下排折叠的输入行。`.choice-new` 用 class 设了 `display: flex`，会盖掉 `[hidden]` 的 UA `display: none`，**必须显式补一条 `.choice-new[hidden] { display: none }`**，否则新增行永远展开 |
| `.field-parts` + `.field-part` | 一个字符串字段拆成多段各自选（编号/类型）。`grid-template-columns: repeat(auto-fit, minmax(210px, 1fr))` 自动在宽栏排两列、窄栏退一列，不写断点；每段上方一个 `.field-part-label` 小标题 |
| `.item-block` | 一个可增删条目 = 标题行（名称 + key + 操作按钮）+ 一个 `.field-group` |
| `.list-toolbar` | 虚线框统计条，右侧 `margin-left: auto` 顶出「添加」按钮 |
| `.item-empty` | 虚线框空态，文案写清下一步动作 |
| `.save-status` | 底部居中 toast，`.is-visible` 时上浮显现 |
| `.conn-badge` | 顶栏连接状态徽标，三态互斥：`.is-ready` 用 `--accent`、`.is-locked` 用 `--fg`、`.is-offline` 用 `--danger`，都是**文字色与描边色同时改**。900px 以下隐藏。**离线态必须显眼**——它是「改动没保存上」的唯一提示 |
| `.notice` | 浅灰提示条，内嵌 `code` 用白底 + 细框 |

**表单控件统一规格：** `border: 1px solid var(--border)`，`padding: 9px 10px`，`font-size: 13px`；`select` 固定 `height: 35px` 并自绘箭头；`textarea` `min-height: 72px` + `resize: vertical`。**已修改未保存**的控件加 `.is-changed` 类（淡蓝底 + 蓝描边），这是给用户的核心反馈，新增字段务必沿用。

---

## 5. 交互态（硬要求，逐条对照）

| 状态 | 规则 |
|---|---|
| hover（链接） | 只动**下边框颜色**（transparent → `--fg`），文字颜色不变 |
| hover（卡片） | 底色 `--bg` → `--surface`，图片 `transform: scale(1.045~1.08)` |
| hover（ghost 按钮） | 加 `border-color: var(--border)` + 底色 `--surface` |
| hover（实心按钮） | 前景背景**同时**换：`--accent` → `oklch(0.45 0.12 257)`，文字保持 `--bg` |
| hover（黑白反转按钮） | `.back-to-top` / `.page-button` 一条规则里同时写 `background: var(--fg); color: var(--bg)` |
| focus-visible | 统一 `outline: 2px solid var(--accent); outline-offset: 4px`；卡内焦点用 `-4px`；表单用 `outline-offset: 1px` + 蓝描边 |
| disabled | 唯一允许降对比的状态：`.page-button:disabled` 转灰 + `cursor: not-allowed`；`.btn:disabled` 用 `opacity: .3` 并锁住 hover |

**三条禁令：**
1. 绝不把 hover 文字改成 `--muted` 或任何更接近背景的颜色。
2. 绝不出现浅底浅字／深底深字。
3. 每个可聚焦元素都必须有可见焦点环——新增按钮时把选择器补进现有那条 `:focus-visible` 规则里，不要漏。

**触摸目标：** 目标是展示页控件 ≥44px。当前实际情况（如实记录，别照抄小的那几个）：

| 控件 | 实际尺寸 | 状态 |
|---|---|---|
| `.primary-action`（首页 CTA） | 48px | ✅ |
| `.back-to-top`（两页） | 48×48 | ✅ |
| 历史页 `.view-button` / `.page-button` / `.close-button` | 44px | ✅ |
| 首页 `.filter-button` | **36px** | ⚠️ 低于 44px，后续可提到 44px |
| 首页 `.close-button` | **38×38** | ⚠️ 低于 44px，历史页同名组件已是 44px，可对齐过去 |

后台是桌面工具，`.btn` 38px、`.btn-sm`/`.btn-icon` 28px 是有意为之——**只在 `admin.html` 里允许**。新增控件请直接按 44px 起步。

---

## 6. 动效

- 统一缓动 `var(--ease)` = `cubic-bezier(.22, .61, .36, 1)`。
- 时长分档：颜色/描边 `.2–.25s`；进场 `.35–.7s`；图片缩放 `.7–.8s`。
- 进场动画用 `.reveal` → `.reveal.is-visible`（`opacity` + `translateY(20px)`），由 `IntersectionObserver` 加类。**目前只有 `index.html` 实现了这套**（12 处引用）；`history-archive.html` 没有进场动画。要给历史页或新页面加，就把首页那段 CSS + observer 整段搬过去，不要另写一套。
- 页面滚动用 `html { scroll-behavior: smooth }`，**不要用 `scrollIntoView`**（会破坏嵌入预览）。
- 每个页面末尾必须带这段无障碍兜底：

```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
```

---

## 7. 响应式断点

| 断点 | 谁用 | 做什么 |
|---|---|---|
| `max-width: 1100px and min-width: 761px` | 首页 | Hero 压缩到 620px 高、图宽 `min(92%,400px)` |
| `max-width: 900px` | 后台 | 侧栏塌成顶部横向滚动 tab，数据面板单列 |
| `max-width: 760px` | 展示页 | header 去掉中间说明列、双列全部单列、网格降列、footer 单列左对齐、弹层单列 |
| `max-width: 470px` | 展示页 | 卡片彻底单列、导航 gap 收到 10px、分页按钮 `flex: 1` 占满 |

移动端是**重新排布**而不是等比压缩：`.archive-item` 在 760px 变成「日期 | 内容」两列并让图和文案都落到第 2 列，470px 才全单列。`body` 有 `overflow-x: hidden`，但这不是横向溢出的挡箭牌——新组件要自己保证不溢出。

---

## 8. `data-od-id` 命名约定

页面区域、标题、CTA、控件、可复用卡片都要带 `data-od-id="kebab-case"`，装饰元素不需要。它同时是**后台覆盖脚本的锚点**，改名等于断开后台联动。

现有命名规律：

```
brand-home / archive-brand-home        品牌位
nav-collection / nav-history / nav-archive-list   导航项
hero-heading / hero-primary-cta        Hero 元素
collection-heading / captain-heading   区块标题
archive-item-<key>                     历史列表行（key 如 star / badge / summer）
archive-grid-card-<key>                历史表格卡（与列表行同一个 key）
archive-page-previous / archive-page-next        分页按钮
```

新增条目时 `archive-item-xxx` 与 `archive-grid-card-xxx` 的 `xxx` **必须一致**，两个视图靠它配对。

---

## 9. 内容覆盖契约（改动前必读）

内容不写进 HTML，也不再进浏览器本地存储。**单一数据源是 EdgeOne KV**，通过一个边缘函数收口：

```
admin.html ──POST /api/content──┐
                                ├─→ EdgeOne KV（命名空间绑定名 GYP_CONTENT，键 site-content）
展示页 ─────GET /api/content────┘
                                    值形状：{ home: {...}, archive: {...} }
```

### EdgeOne 的四个约定（已核实，不要按 Cloudflare 的习惯改）

都对照过官方文档、官方模板库 `TencentEdgeOne/pages-templates` 和一个线上真实项目。
两家平台很像，但**恰好在最关键的 KV 上不一样**，凭习惯改必然踩坑：

| 约定 | 正确写法 | 容易写错成 |
|---|---|---|
| 函数源码目录 | `functions/` | `edge-functions/`——那是**构建产物**目录（`.edgeone/edge-functions/`） |
| KV 句柄 | **裸全局变量** `GYP_CONTENT.get(...)` | `env.GYP_CONTENT.get(...)`——取不到，会返回 503 |
| 环境变量 | `context.env.ADMIN_TOKEN` | （这条一样，确实走 `env`） |
| 处理函数导出 | 具名 `export async function onRequest(context)` | `export default {...}`——官方零个示例这么写 |

因为 KV 是裸全局变量，`resolveKV()` 里第一顺位必须是**直接引用标识符** `GYP_CONTENT`
（用 `typeof` 守卫避免未绑定时抛 `ReferenceError`）。`globalThis['GYP_CONTENT']` 不可靠：
若运行时是用模块作用域注入的，从 `globalThis` 上取不到。改绑定名时这两处都要同步改。

**排查口诀：404 是路由问题，503 是绑定问题。** 又因为下面「静态优先」的设计，
接口坏了首页照样正常显示，**光看首页发现不了**，必须直接访问 `/api/content`。

### 鉴权：两条规矩

**1. 验签的密码学函数在 `auth.js` 和 `content.js` 里各有一份，改一处必须改两处。**

这是有意重复，不是漏了重构。EdgeOne 的 `functions/` 是**按文件路径路由**的目录：
往里放一个非路由的共享模块，会不会被当成路由、跨目录 `import` 能不能被正确打包，
官方示例里找不到印证。宁可复制这 30 行，也不赌一个没验证过的模块解析行为。
两份代码的头部都写了这条警告，动之前先看一眼。

**2. `middleware.js` 不是安全边界，安全边界在 `POST /api/content` 的验签。**

中间件的 context 里**没有 `env`**（只有 `request / next / redirect / rewrite / geo / clientIp`），
拿不到 `ADMIN_TOKEN`，签名无法校验，所以它只能判断 Cookie 在不在。
它跳转是**单向的**（未登录 → 登录页），不做反向跳转：否则拿着一张过期但存在的 Cookie 的人，
会在「中间件 → 后台 → admin.js 发现过期 → 登录页 → 中间件」之间无限弹跳。
增删鉴权逻辑时，永远假设中间件可能完全不生效。

### 静态优先——这条是地基，任何改动都不能破坏

两个展示页的默认内容**仍然硬编码在 HTML 里**。页面加载后才异步请求 `/api/content` 覆盖：

```js
const res = await fetch('/api/content', { cache: 'no-store' });
if (!res.ok) return;                       // 接口挂了 → 用 HTML 里的默认内容
const data = await res.json();
const overrides = (data && data.home) || {};
if (!Object.keys(overrides).length) return; // KV 是空的 → 同上
```

所以 KV 没绑定、函数报错、断网、或者本地双击用 `file://` 打开，页面都会**完整渲染**，不白屏、不转圈、不出现骨架屏。这继承的是旧版「没有覆盖数据就早退」的设计意图，只是数据源从 localStorage 换成了 KV。**新增字段时照抄这个「取不到就 return」的写法，不要写成 await 完才渲染。**

### 数据形状（容易记错，这里写清）

- 顶层只有 `home` 和 `archive` 两个键，**边缘函数会拒绝其它顶层键**（400）。
- 条目**平铺**在集合键下面，例如 `data.archive['item-star']`，**没有 `items` 子对象**。
- `data.home.merchOrder` / `data.archive.itemOrder` 是**唯一权威顺序**：id 不在数组里就不渲染。数组不做深合并，所以删除能在导出/导入 JSON 后存活。
- 展示用的编号是**算出来的不是存的**：`01 / GIFT`、`ARCHIVE NN`、弹层序号都按数组下标 + `type` 现算，所以增删排序后编号自动自愈。
- 历史日期存 `"YYYY\nMM"`：列表视图把 `\n` 换成 `<br>`（两行），表格视图用 `dateToDot` 换成 `.`（`2025.10`）。表格里的分隔是**全角** `／`，列表里是半角 `/`。
- 图片字段存的是**图床完整链接**，不是文件名也不是相对路径。

### 写入侧的三条纪律

| 纪律 | 为什么 |
|---|---|
| 口令只放 `sessionStorage`（键 `gyp-admin-token`），随 `X-Admin-Token` 头发送 | 关标签页即失效；**绝不能把口令写进任何 HTML 或提交进仓库** |
| 服务端 `ADMIN_TOKEN` 环境变量缺失时，函数返回 **503 拒绝写入**，不是放行 | 失败要关门，不能让后端在没配口令时裸奔 |
| `saveData()` 串行化：请求进行中时置 `pendingSave`，改动合并进下一次 | KV 没有事务，并发写会互相覆盖 |

保存是 400ms 防抖 + 网络请求，比本地存储慢一个量级，所以**每次保存的结果必须落到 UI 上**：`.save-status` toast 报成败，`.conn-badge` 报连接态。**不许静默失败**——旧版就是因为保存失败几乎无提示，容易让人误以为已经生效。

### 给后台加一个可编辑字段

1. 在展示页目标元素上加 `data-od-id="xxx"`；
2. 在展示页的 `applySiteContent()` 里补一行 `setText('xxx', get(overrides, 'xxx'))`；
3. 在 `assets/admin.js` 的 `defaults` 里加默认值；
4. 在对应 `collections[...].fields` 数组里加一项：

```js
{ key: 'category', label: '类别', kind: 'choice', choice: 'archive-category',
  hint: '同时用于列表的「类别：…」与表格视图的标签。' }
```

`kind` 目前支持 `text` / `textarea` / `select` / `year-month` / `choice` / `parts`；`half: true` 表示与相邻字段共占一行，`grow: true` 表示吸收剩余高度，`preview: true` 表示右侧出大图预览。**新字段优先复用这几个 kind，不要新造控件。**

**`select` 与 `choice` 怎么选：** 值有没有可能变多。`select` 是闭集，`options` 写死在字段定义里——只有当展示页也**按值分支**时才用它（例如 `merch.type`：首页的筛选按钮和 `GIFT`/`PLAN` 后缀映射是硬编码的，第三个值首页认不出来，会被静默当成 `gift`，所以它必须闭）。展示页只是把值当文本显示时用 `choice`，让用户能自己加。

**`choice` 的选项表不落库**，而是「种子 ∪ 当前有条目正在用的值」实时推导（`choiceGroups` + `collectChoiceValues`）。所以「新增选项」＝「把新值写进当前条目」的副产物：它立刻出现在同组其它条目的下拉里，而输错了、没人在用的值下次渲染就自己消失——不用加删除选项的 UI，也不会在数据里攒脏选项。种子只取默认内容里真实出现过的值，外加项目既有的占位约定（`待补充` / `待定`）。

**`parts` 用于「一个字符串字段其实是几段拼的」**（`merch.meta` ＝ `状态：品类／售价／获得方式`）。每段一个 `choice` 下拉，`data-part=段序号`，改动时由 `readParts` 读齐同组各段再拼回整串——和 `year-month` 两个下拉共写一个 `date` 是同一套思路。写这类编解码器时**拆和拼必须是无损往返**，否则用户一动下拉就会悄悄改坏原值；`metaParts`/`joinMeta` 靠两条保护做到这点：多出来的段全部并进最后一段（不丢字），结尾的空段拼回去时去掉（没有分隔符的自由文本不会被补成 `随便写的／／`）。另外**段内容里必须禁止出现分隔符**（`partInputError`），否则重拼后会多出一段、下次读回来整体错位。

### 新增一个可增删的集合

在 `collections` 里加一项，需要：`section`（`home`/`archive`）、`orderKey`、`prefix`、`defaultOrder`、`emptyText`、`confirmWord`、`fields`、`blank(n)`。增删排序逻辑（`addItem` / `removeItem` / `moveItem`）是通用的，不用重写。

### 图床链接的三个坑

1. 规则是「文件名前加 `https://i0.hdslb.com/bfs/garb/open/`」，但**有例外**：星屿立牌那张的前缀是 `/bfs/garb/item/`，用 `/open/` 会 404。**加新图前先在浏览器里验一下链接能打开。**
2. 站点图标走的是**另一个域和另一个路径**——`https://i2.hdslb.com/bfs/face/606736d259de6feb6a90c6205b7edc63e671302d.jpg`（`i2` 不是 `i0`，`face` 不是 `garb/open`，而且是 `.jpg`，所以 `type="image/jpeg"`）。别套用商品图的规则去拼它。
3. **图床链接一律写完整的 `https://`，不要写协议相对的 `//i2.hdslb.com/…`。** 后者在 `file://` 下会被解析成 `file://i2.hdslb.com/…` 而取不到——本项目要求双击能打开，所以这条是硬性的。


---

## 10. 新增页面检查清单

1. 复制 `history-archive.html` 的 `:root` + 基础重置 + `.site-header` / `footer`，不要从零写 CSS。
2. `<html lang="zh-CN">`、`<meta name="viewport">`、`favicon` 用图床直链（见 §9 第 3 条，必须带 `https://`）、`<meta name="description">` 写真实描述。
3. 所有可见文案用简体中文；编号、状态标签用 mono。
4. 页面里同一动作只有一个实心主按钮，其余用 ghost / 文字链接。
5. 补齐 `data-od-id`；需要后台可编辑就同时接 `applySiteContent()`，并保留「取不到就 return」的静态兜底。
6. 加上 760px / 470px 断点和 `prefers-reduced-motion` 兜底。
7. 自查：无重叠、无裁切、无末行孤字、hover/focus 对比度不下降。
8. 占位内容必须**如实标注**（现在用的是「示例图／待替换」「待补充」），不要编造数据。

---

## 11. 不要做的事

- 不用紫色渐变、不给每层背景加渐变；
- 不用 emoji 当图标；
- 不用「左侧色条 + 圆角卡片」那种提示框样式（本项目提示条是 `.notice`：细框 + 浅灰底）；
- 不用 Inter / Roboto / Arial 当展示字体；
- 不加圆角和投影（`dialog` 除外）；
- 不用米色/奶油底色；
- 不在展示页放只给管理者用的控制面板——那些都属于 `admin.html`；
- 不编造销量、库存、评分等数据。

---

## 12. 与代码仓同步的注意事项

Linked code folder：`C:\Users\17855\Desktop\Code\GYP\GYP-Showcase`（只读参考，需明确授权才写入）。
远端 `origin`：`github.com/Polaris-Leo/GYP-Showcase`。

`site/` 的文件名现在与代码仓根目录**一一对应**，不再有改名映射。同步就是把 `site/` 的
六个交付文件平移过去。

**2026-08-23：Hero CSS 的分歧已经解决。** 此前代码仓和工作区的 `.hero` 有 7 处不同，
处理办法是**保留代码仓已提交的 4 个排版／比例值**（`min-height: min(720px, 76vh)`、
列比例 `minmax(0,1.13fr) minmax(280px,.87fr)`、`gap: clamp(34px,6vw,112px)`、
`h1: clamp(56px,9.2vw,148px)`），**只把工作区独有的 1100px 中屏断点补进代码仓**——纯增量，
不回退任何已定稿的值。工作区随后对齐成与代码仓逐字节一致。另外两处工作区独有的写法被丢弃：
`.hero-image-wrap::after` 的 `z-index: 5`（`::after` 在 DOM 顺序上本就晚于 `.hero-image`，
无实际效果）和 `min-height` 里的 `svh` 单位（760px 以下 `.hero` 已是 `min-height: auto`，
`svh` 要解决的地址栏伸缩在这里用不上）。

所以现在**两边没有故意的差异了**，`site/index.html` 与代码仓 `index.html` 应当完全相同。
同步前照例先 `diff` 一遍：如果出现差异，说明有一侧被单独改过，先弄清是谁改的、为什么，
**不要直接整文件覆盖**。

遗留未定：移动端 `.hero` 的 `padding-top` 取 `85px`（代码仓值，现为准）还是 `48px`。
这个从代码上判断不了，得在真机上看顶部有没有被 `.site-header` 压住。

### 不入库的东西

`.gitignore` 挡掉了 `素材/`（约 106 MB 原始素材，含 mp4）和 `assets/gyp/`（已弃用的本地图片）。
仓库只装文本文件，**一张图片都没有**。

**2026-08-23 已用 `git filter-branch` 重写全部历史**，把这些二进制从每个提交里剔除后强推。
所以「历史里还留着大文件」这个问题已经解决，不要再按旧说法处理。代价是所有提交 SHA 都变了——
如果你在别处有旧克隆，重新 clone，别硬 merge。

新增静态资源时留意 `.gitignore` 的 `assets/` 规则，别让新文件被误挡——加完跑一次
`git check-ignore -v <新文件>` 确认。

