# 鸽一品 / GEYIPIN 周边展厅 — 项目说明与部署指南

> 目标形态：**静态站托管 + 边缘函数 + KV 存储**，后台 `admin.html` 在线可视化编辑，
> 改动直接写入线上 KV，**所有访客刷新即可见**。不需要服务器，不需要构建步骤。

---

## 1. 为什么是这个方案（而不是 B 或 C）

之前给过三个选项，这里是最终结论：

| 方案 | 在线可视化编辑 | 需要维护服务器 | 改完是否立刻对所有访客生效 | 结论 |
|---|---|---|---|---|
| **A** 纯静态、删掉后台 | ✗ 改 HTML | ✗ | — | 放弃：失去编辑能力 |
| **B** 数据文件 + 后台导出文件 | △ 编辑是可视化的，但要下载文件→提交→等重新部署 | ✗ | ✗ 要重新部署 | 放弃：不算「在线编辑」 |
| **C** Node + Express 自建后端 | ✓ | ✓ 要买机器、装环境、盯进程、配 HTTPS | ✓ | 放弃：EdgeOne 已经白送同等能力 |
| **D** EdgeOne Pages + Functions + KV ← **采用** | ✓ | ✗ 全托管 | ✓ 即时 | **最合适** |

**为什么 D 优于 C**：你本来就要用 EdgeOne 部署。EdgeOne Pages 自带边缘函数和 KV 键值存储，
等于后端已经包含在托管里了。自建 Node 服务只是把同样的功能挪到一台需要你自己运维的机器上，
还多出机器成本、HTTPS 证书、进程守护、备份这些活儿。

**关键设计：静态优先，接口只做增强。**
两个展示页的默认内容仍然**硬编码在 HTML 里**，页面加载后才异步请求 `/api/content` 覆盖。
所以即使 KV 没绑定、函数挂了、或者你直接双击本地文件打开，页面依然是完整好看的——
不会白屏，不会「加载中」。这一点是从原来 localStorage 版本继承下来的保证，特意保留了。

---

## 2. 目录结构

仓库根目录即部署根目录，EdgeOne Pages 直接连本仓库即可，无需构建步骤。

```
.                              ← 部署根目录
├── index.html                 当前展厅（单文件，内联样式）
├── history-archive.html       历史展厅（单文件，内联样式）
├── admin.html                 内容后台 · 仅结构，236 行
├── login.html                 后台登录页（单文件，内联样式）
├── middleware.js              边缘中间件：未登录访问后台时跳登录页（仅体验，非安全边界）
├── assets/
│   ├── admin.css              后台样式（535 行）
│   ├── admin.js               后台逻辑（1082 行）
│   └── login.js               登录页逻辑
├── functions/
│   └── api/
│       ├── auth.js            边缘函数：登录 / 登出 / 查询会话
│       └── content.js         边缘函数：GET 读内容 / POST 写内容
├── docs/
│   └── frontend-styleguide.md 前端样式契约：设计令牌、组件规范、数据契约
├── edgeone.json               EdgeOne 项目配置：/api/* 不缓存、后台页禁止索引
├── .gitattributes             行尾统一 LF
├── .gitignore
└── README.md                  本文件
```

### 为什么函数目录叫 `functions/` 而不是 `edge-functions/`

官方文档《Edge Functions》里写的是 `/edge-functions` 目录，但那指的是**构建产物**位置。
实际源码目录是 `functions/`，构建后才被打包进 `.edgeone/edge-functions/`（已 gitignore）。
两个独立来源可以互相印证：

- 官方模板库 `TencentEdgeOne/pages-templates`：17 个示例用 `functions/`，其中包括 KV 示例 `functions-kv`。
- 线上真实项目 `Yukari-Song-List-EdgeOne`：源码 `functions/`，产物 `.edgeone/edge-functions/`。

所以 `functions/api/content.js` 对应的路由就是 `/api/content`，位置无需改动。

**两个展示页刻意保持单文件内联样式**——它们要能被单独丢到任何地方打开，少一个请求就少一个出错点。
**后台页则拆成 HTML + 外部 CSS/JS**，因为它原本 1489 行，早已超出单文件的可维护上限。
外部脚本用 `<script src="assets/admin.js" defer>`，是 classic script 而**不是 `type="module"`**：
模块脚本在 `file://` 下会被 CORS 拦掉，那样双击打开就废了。

所有图片已改用图床，所以原始素材（`素材/`，约 106 MB 含 mp4）和 `assets/gyp/` 下已弃用的
本地图片都已从版本控制移出并写入 `.gitignore`——文件仍在本地磁盘上，只是不再入库、不再部署。

**2026-08-23 已重写全部 Git 历史**，用 `git filter-branch` 把这些二进制从每一个提交里
彻底剔除，并强制推送。所以现在 clone 下来是个纯文本仓库。副作用：**所有提交的 SHA 都变了**，
重写之前的克隆无法直接 `git pull`，需要重新 clone 或 `git fetch && git reset --hard origin/main`。

工作区根目录下的 `gyp-merch-gallery.html`、`history-archive.html`、`admin.html`
是**改造前的旧版**，仅作对照保留。确认新版无误后可以删除，避免两份并存产生分歧。

---

## 3. 图片全部改为图床链接

所有展示用图片已从本地 `assets/gyp/*.png` 换成 B 站图床直链，共替换 **49 处**
（首页 12、历史页 21、后台 16）。

| 原本地文件 | 图床链接 |
|---|---|
| `hero-sky.png` | `https://i0.hdslb.com/bfs/garb/open/c2bb646b6369aad51a004d673e3287e912d7756a.png` |
| `pigeon-plush.png` | `https://i0.hdslb.com/bfs/garb/open/171b8d6f02d93b4ee97fa230eff3ecad5e63e9fd.png` |
| `birthday-set.png` | `https://i0.hdslb.com/bfs/garb/open/436cd3b761aaa29766c7fad8e44b4672f7734eef.png` |
| `galaxy-cafe.png` | `https://i0.hdslb.com/bfs/garb/item/c6836114214dcba20fcc30167be8239863b9083e.png` ⚠️ |

对应关系是用 **MD5 逐一比对** `assets/gyp/` 与 `素材/` 目录得出的，不是靠文件名猜的；
每个链接都实测过 HTTP 200，且**返回字节数与本地文件完全一致**。

### ⚠️ 两个例外，务必知道

1. **`galaxy-cafe.png`（星屿立牌）的前缀是 `/bfs/garb/item/`，不是 `/bfs/garb/open/`。**
   用 `/open/` 前缀访问它会返回 **404**。11 个素材里只有这一个是 `item`，其余 10 个都是 `open`。
   所以「在文件名前加 `/bfs/garb/open/`」这条规则有一个例外，加图片时请先用浏览器验证链接能打开。

2. **站点图标在另一个域下。** 它不是 `i0.hdslb.com/bfs/garb/open/`，而是
   `https://i2.hdslb.com/bfs/face/606736d259de6feb6a90c6205b7edc63e671302d.jpg`
   ——`i2` 不是 `i0`，`face` 不是 `garb/open`，扩展名是 `.jpg`（所以 `type="image/jpeg"`）。
   这张图与 `素材/网站图标.jpg` 字节完全一致（84511 字节，md5 `1c168eb2…`），已核对。
   **必须写完整的 `https://`**：协议相对的 `//i2.hdslb.com/…` 在 `file://` 下会被解析成
   `file://i2.hdslb.com/…`，双击打开时取不到图标。

结果是**仓库里没有任何图片文件**。

### 未使用的素材

`素材/` 里还有 7 张图和 3 个视频没有用在站点上。它们也都在图床上（前缀均为 `/open/`）：

```
2eacd00649097deefc395d2820b202c60d3db24f.png   49607673e2b01bbbce11a3f37e22d716db1e9a4e.png
69b02395532e23ceb3acd4daf12bdfffe762c93d.png   7e4e6f2a4d6d64faa00467e8347f498440b3d45e.png
b56b95bf354fdd724e9c96b41e8c2027c20d5716.png   fb36d3d2e06a579a6d8b70992371a7a5f8521460.png
fd2c265c2f1e00f7ae309edb227c04a463f2777b.png
```

要用哪张，直接在后台「图片链接」字段粘贴 `https://i0.hdslb.com/bfs/garb/open/<文件名>` 即可，
不需要改代码，也不需要把文件放进项目。

---

## 4. 内容存储：从 localStorage 换成 KV

### 改造前
后台把内容写进浏览器的 `localStorage['gyp-admin-overrides']`。
问题：只有**你这台电脑的这个浏览器**能看到改动，访客看到的永远是默认内容；清缓存就丢。

### 改造后
```
admin.html  ──POST /api/content──▶  边缘函数  ──put──▶  EdgeOne KV
                                                          │
展示页  ──GET /api/content───────▶  边缘函数  ──get──────┘
```

- 内容的唯一存放点是 **KV**，全站共享。
- 项目里**已无任何 `localStorage`**（三个页面 grep 结果为 0）。
- `sessionStorage` 只用来暂存**管理口令**，关掉标签页即失效，与内容存储无关。

### 后台的三种连接状态

右上角有状态徽标，一眼看出当前能不能存：

| 徽标 | 含义 | 能否保存 |
|---|---|---|
| `● 已连接线上`（蓝） | 接口正常，口令有效 | ✓ 自动保存 |
| `● 需要口令`（黑） | 接口正常，但口令没填或不对 | ✗ 点「解锁」输入口令 |
| `● 离线（改动不会保存）`（红） | 接口不可用（本地打开 / KV 未绑定） | ✗ **仅本地预览** |

这个徽标是特意加的：原来的版本在保存失败时几乎没有提示，容易让人以为改动生效了。
现在离线状态下侧栏也会写明「当前仅本地预览，改动不会保存」。

### 保存行为

- 输入后 **400ms 防抖**自动保存（原来是 300ms，因为现在是网络请求，稍微放宽）。
- 保存**串行化**：一次请求还没回来时，后续改动会合并进下一次请求，
  避免并发写入互相覆盖（KV 没有事务，这一步是必要的）。
- 「数据」页的导出／导入**保留**了，但定位变了：现在是**备份与迁移**工具，
  不再是跨设备同步的唯一手段。导入会立刻覆盖线上内容。

---

## 5. 部署步骤

> 本节的每一条都已对照官方文档 + 官方模板库 + 一个线上真实 EdgeOne 项目核实过，
> 不是按 Cloudflare 的习惯推测的（这两家很像但不一样，KV 取法就正好不同）。

1. **导入仓库开启自动部署**：EdgeOne 控制台 → Pages → 新建项目 → 导入 Git 仓库，
   选择本仓库。构建设置里**构建命令留空**（本项目无构建步骤），
   输出目录也**不用填**——根目录静态站保持默认即可。
   > 官方纯静态模板 `html5up-massively` / `html5up-paradigm-shift` 同样是根目录多页 HTML，
   > 既没有 `package.json` 也没有配置输出目录，可以照此参照。本仓库的 `edgeone.json`
   > 也**故意不写 `outputDirectory`**：没有任何官方示例把它设成 `"."`，与其赌一个没人验证过的
   > 写法，不如用已被证明可行的默认值。

   导入后 EdgeOne 会把项目绑定到一个**部署分支**（本仓库为 `main`）。
   之后每次 `git push` 到该分支都会自动触发构建与发布，这就是你要的代码仓自动部署。

2. **创建并绑定 KV 命名空间**：控制台创建一个 KV 命名空间，
   绑定名填 **`GYP_CONTENT`**。

   > ⚠️ **EdgeOne 的 KV 绑定是一个「裸全局变量」，不是 `env.XXX`。**
   > 绑定名必须和代码里的全局变量名**逐字一致**，否则函数取不到句柄。
   > 官方 KV 示例写的是 `my_kv.get(...)`，线上项目 Yukari 写的是 `Yukari_Songs.get(...)`，
   > 都不经过 `env`。本项目对应 `functions/api/content.js` 里的 `GYP_CONTENT`。
   > 改名的话，该文件顶部的 `KV_BINDING` 常量**和 `resolveKV()` 里的标识符都要同步改**。

3. **设置管理口令**：在 Pages 项目的环境变量里加
   **`ADMIN_TOKEN`** = 你自己定的一串口令。
   > 环境变量走的是 `context.env.ADMIN_TOKEN`——这条和 KV 不同，确实通过 `env` 读取。
   > 没设这个变量时，函数会**拒绝所有写入**（而不是放行），避免后台裸奔。

4. **部署**，然后打开 `https://<你的域名>/admin.html`，
   会自动跳到 `/login.html` → 输入口令登录 → 改内容 → 打开首页确认生效。

### 自查清单

- [ ] `/api/content` 直接用浏览器打开，返回 JSON（首次是 `{}`）而不是 404 → 函数生效了
- [ ] 若返回 **503 且提示「KV 未绑定」** → 函数跑起来了但 KV 绑定名不对，回到第 2 步逐字核对
- [ ] `/api/auth` 直接打开，返回 `{"authenticated":false,"configured":true}`
      → 登录接口生效且 `ADMIN_TOKEN` 已配置；`configured:false` 说明第 3 步没做
- [ ] 未登录时访问 `/admin.html` 会跳到登录页 → 中间件生效（**不生效也不影响安全**，见 §6）
- [ ] 登录后徽标显示「● 已连接线上」→ KV 绑定成功
- [ ] 改一个标题保存，无痕窗口打开首页能看到 → 全站生效
- [ ] 无痕窗口直接打开 `/admin.html` 点保存，报「会话已失效」→ 鉴权生效

> 排查顺序很重要：**404 是路由/目录问题，503 是绑定问题**，两者原因完全不同。
> 因为展示页是「静态优先」的（`if (!res.ok) return;`），接口坏掉时首页依然正常显示内置默认值，
> **光看首页永远发现不了问题**，必须直接访问 `/api/content` 才能确认。


---

## 6. 安全说明（请务必看一眼）

### 登录是怎么做的

1. `login.html` 把口令 POST 到 `/api/auth`，服务端拿 `ADMIN_TOKEN` 比对。
2. 比对通过后签发一个会话票据：`<过期时间戳>.<base64url(HMAC-SHA256(ADMIN_TOKEN, 过期时间戳))>`，
   写进 Cookie **`gyp_admin`**（`Path=/; HttpOnly; Secure; SameSite=Strict`），有效期 **12 小时**。
3. 每次 `POST /api/content` 都会**重新验签并检查过期时间**，不是「看一眼 Cookie 在不在」。
4. 口令本身**不落地**——不写 localStorage、不写 sessionStorage，只有那张签名票据存在 Cookie 里。

因为签名的密钥就是 `ADMIN_TOKEN` 本身，**改一次 `ADMIN_TOKEN` 就等于把所有已发出的会话全部作废**，
不需要额外的注销机制。

### 真正的安全边界在哪里

**是 `POST /api/content` 里的验签，不是 `middleware.js`。**

`middleware.js` 只做一件事：发现没带 `gyp_admin` Cookie 就把访问者跳到登录页。
它**故意**不做验签，因为中间件的 context 里**没有 `env`**（只有 `request / next / redirect /
rewrite / geo / clientIp`），拿不到 `ADMIN_TOKEN`，签名根本无法校验。
另外 EdgeOne 中间件是否会拦截静态资源请求（`/admin.html`）在官方文档里没有明确说明。

所以设计上让这两条都**可以失效而不影响安全**：中间件不生效，最坏情况是别人能打开后台界面看一眼；
点保存时函数那一层照样会 401。反过来说，**别指望中间件挡住任何东西**。

> 这里刻意**没有照抄参考项目**（Yukari）的做法。它的中间件用
> `cookieHeader.includes('yukari_admin_session=')` 判断登录，Cookie 值从不校验——
> 任何人手搓一个同名 Cookie 就能通过；它的 Cookie 也没加 `Secure`。
> 本项目沿用了它的**形态**（登录页 + HttpOnly Cookie + 中间件跳转），但把判断换成了真验签。

### 已知取舍

- 口令是**单一共享口令**，没有账号体系、没有操作日志。个人站合理，多人协作就该升级。
- **没有登录失败限流。** 这是有意的：基于 KV 的限流会让登录可用性绑死在 KV 绑定上——
  KV 一出问题连登录都进不去。口令请设长一些（20 位以上随机串），别用生日。
- **`ADMIN_TOKEN` 只存在服务端环境变量里**，不要写进任何 HTML 或提交进仓库。
- `X-Admin-Token` 请求头仍然被 `POST /api/content` 接受，方便脚本化调用。
  它和会话 Cookie 是二者取一的关系，安全强度相同（都是拿 `ADMIN_TOKEN` 常量时间比对）。
