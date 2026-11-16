# HANDOFF · 部署与移动端适配 处置手册

> 用途：把「项目推不上 Cloudflare」和「补 Android/iOS 适配」这两件事，从排查到修好固化下来。
> 适用：任意纯静态 / 前端项目（本仓库是纯静态：`index.html` + `css` + `js` + `data` + `fonts`）。
> 用法：复制到目标项目根目录，按第 0 节判断自己属于哪种情况，然后只读对应章节。

**目录**

- [0. 30 秒速查](#0-30-秒速查)
- [1. 问题 A：Cloudflare 构建卡在 clone repo](#1-问题-acloudflare-构建卡在-clone-repo)
- [2. 问题 B：Android / iOS 适配](#2-问题-bandroid--ios-适配)
- [3. 发布流程](#3-发布流程)
- [4. 验收清单](#4-验收清单)
- [5. 已经踩过的坑（实证记录）](#5-已经踩过的坑实证记录)
- [6. 交给下一个 AI 的提示词](#6-交给下一个-ai-的提示词)
- [7. 环境附注：DSH 工具链的两个坑](#7-环境附注dsh-工具链的两个坑)

---

## 0. 30 秒速查

| 症状 | 跳到 |
|---|---|
| 构建日志 `clone repo` 一行红叉，出现 `fatal: No url found for submodule path ... in .gitmodules` 或 `Failed: error occurred while updating repository submodules` | [§1](#1-问题-acloudflare-构建卡在-clone-repo) |
| 构建能过、页面能开，但手机上布局拥挤、底部被刘海/手势条压住、键盘弹出后按钮跑掉、点按没反馈 | [§2](#2-问题-bandroid--ios-适配) |
| 推送成功但线上还是旧页面 | [§3 的缓存版本号](#33-缓存版本号必须改) |
| **命令全部返回「成功」但什么都没做**：退出码 0、stdout 空、文件一个没变 | [§7.1](#71-shell-命令返回成功却什么都没做) |
| `git push` 报 `CRYPT_E_NO_REVOCATION_CHECK` 或 `unable to get local issuer certificate` | [§7.2](#72-git-推送的-tls-报错) |

一条命令先判断是不是子模块问题：

```bat
git ls-files --stage | findstr /b "160000"
```

**有输出＝有子模块指针，很可能就是它；无输出＝另找原因，见 [§1.7](#17-修完还是失败其它常见原因)。**

---

## 1. 问题 A：Cloudflare 构建卡在 clone repo

### 1.1 日志长什么样

```
2026-xx-xxTxx:xx:xx  Cloning repository...
From https://github.com/<you>/<repo>
 * branch            <sha> -> FETCH_HEAD
HEAD is now at <sha> <commit message>
fatal: No url found for submodule path '<path>' in .gitmodules
Failed: error occurred while updating repository submodules
```

关键点：**`build` 和 `deploy` 两步根本没开始**（日志里显示 `—`）。也就是说，跟你的 `package.json`、构建命令、输出目录全都没关系，别去那里找。

### 1.2 根因

Git 索引里有两种"目录"：

| 种类 | 索引里的 mode | 内容 |
|---|---|---|
| 普通目录 | `040000`（tree） | 真实文件 |
| **子模块** | **`160000`（gitlink）** | 只有一条指针：指向另一个仓库的某个 commit |

一个目录里如果**自带 `.git`**（比如从别处 clone/解压进来的工具库、主题、示例项目），你 `git add .` 时 Git **不会**把里面的文件加进来，而是把它变成一个 `160000` 指针，同时只在终端提示一句：

```
warning: adding embedded git repository: <path>
```

而 `.gitmodules`（记录 path + url 的文件）**只有在你用 `git submodule add` 时才会自动生成**。于是形成坏状态：

> 仓库里有指针，但没有指针指向的 URL → 任何会递归克隆子模块的 CI 都必然失败。

Cloudflare 的 clone 阶段就是递归初始化子模块的；官方文档明确要求 `.gitmodules` 里每条都必须同时有 `path` 和 `url`：
<https://developers.cloudflare.com/pages/configuration/debugging-pages/>

### 1.3 判定（三条命令）

```bat
:: 1) 索引里有没有 160000 指针
git ls-files --stage | findstr /b "160000"

:: 2) 有没有 .gitmodules（没有＝上面那条输出必然致命）
git ls-files --error-unmatch .gitmodules

:: 3) 这个目录是不是嵌套仓库（是的话，以后还会被 add 回来）
if exist "<path>\.git" echo NESTED-REPO
```

> 在 VSCode 的源代码管理面板里**看不出来**：嵌套仓库在 Git 眼里是"干净的"，只显示一个子模块条目，点开也没有任何可操作的东西。必须用命令行查。

> **判定只认 `git ls-files --stage`。** 不要用 grep / ripgrep 去扫 `.git/index` 判断有没有指针——索引是二进制，扫描会给出**假阴性**。本项目实测：`grep 160000 .git/index` 报无命中，而 `git ls-files --stage` 里明明躺着一条 `160000 6e6b21e1… 0  UgTrans`。同理，`git status` 干净、VSCode 面板干净，都不等于没有指针。

### 1.4 修复（两条命令，保留本地文件）

```bat
cd /d <项目根目录>

:: 只从索引里删掉指针，磁盘上的文件一个都不动
git rm --cached -f "<path>"

:: 若上面报错，用这条兜底
git update-index --force-remove -- "<path>"
```

`<path>` 就是日志里 `submodule path '...'` 引号里的那串（注意大小写，直接复制最保险）。

然后**必须**补 `.gitignore`，否则下次 `git add .` 又会把指针加回来（因为那个嵌套 `.git` 还在磁盘上）：

```gitignore
# —— 本地工具 / 临时产物，不参与部署 ——
.opencode/
~/
.codeartsdoer/
.codegraph/
Birinchi_Test/
_probe.*
cleanup-repo.*
push.bat
*.log
```

> `~/` 这一条是给 Windows 的：在 `cmd` 里 `mkdir ~/xxx` 不会展开 `~`，会在仓库里**字面创建**一个名为 `~` 的文件夹，通常还是某个目录的整份重复拷贝。

提交并推送：

```bat
git add .gitignore
git commit -m "chore: drop broken submodule gitlink, ignore tooling dirs"
git push
```

> **指针已经提交进 HEAD 时**（本项目就是这种情况）：`git rm --cached` 只是把这次删除放进暂存区，`git status` 会显示 `D  UgTrans`，**必须再 commit + push 才算真的拿掉**；否则 Cloudflare 拉到的仍然是带指针的那个提交。先确认它到底在不在 HEAD 里：
>
> ```bat
> git ls-tree -r HEAD | findstr /b "160000"
> ```

> **`.gitignore` 必须存成无 BOM 的 UTF-8。** 带 BOM 时第一条规则会被读成 `\ufeffnode_modules/`，静默失效——本项目就是这样白瞎了 `node_modules/` 这条规则。改完逐条验：`git check-ignore -v node_modules/`。

### 1.5 验证（推之前先自己验）

```bat
:: 两条都应该没有输出
git ls-files --stage | findstr /b "160000"
git ls-tree -r HEAD --name-only | findstr /i "<path 的目录名>"

:: 确认忽略规则真的生效（应打印命中的 .gitignore 规则）
git check-ignore -v "<path>"
```

全部通过后再去 Cloudflare 点 **Retry deployment**。

### 1.6 如果确实需要这个子模块

只有这种情况才该补 `.gitmodules`（且子仓库必须**公开**，Cloudflare 访问不到私有仓库）：

```ini
[submodule "名称"]
	path = 相对路径
	url = https://github.com/<owner>/<repo>.git
```

然后：

```bat
git submodule add <url> <path>   :: 或手工补 .gitmodules 后
git submodule sync
```

> 但对于「从别处抄来的工具目录 / 示例项目 / 主题」，99% 的情况你并不需要它当子模块——直接 `git rm --cached` 并忽略即可。

### 1.7 修完还是失败？其它常见原因

按顺序排除：

1. **Cloudflare 连的仓库/分支不对**：Settings → Build → 检查 Git repository / Branch。镜像站（如 gitcode）停在旧提交时很常见。
2. **私有仓库 / 子模块私有**：构建机器没有权限，clone 会失败或子模块拉不下来。
3. **Git LFS 文件**：仓库里如果用了 LFS 而没配置，clone 阶段会失败。
4. **构建命令与输出目录**：纯静态站点应为 **Build command 留空**、**Build output directory = `/`**（入口 `index.html` 在根目录时）。
5. **单文件 / 文件数超限**：Pages 单文件上限 25 MiB、单次部署文件数上限 20,000。字体几百个 woff2 一般没事，但要留意单个大视频/大 JSON。
6. **commit message 里有 emoji**：官方文档提示 Git 集成场景下可能出问题，能避则避。

---

## 2. 问题 B：Android / iOS 适配

桌面端好看的页面，到手机上通常同时坏在六件事上。按下面顺序改，一次到位。

### 2.1 HTML：三个 meta 必须改

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#0B1218">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

- `viewport-fit=cover` **不加，`env(safe-area-inset-*)` 全部返回 0**，刘海适配等于没做。
- `theme-color` 控制 Android Chrome 地址栏 / iOS 状态栏配色，切换主题时要同步改（见 §2.4 JS）。

### 2.2 CSS：安全区 + 动态视口 + 触屏基线

```css
:root {
  --sat: env(safe-area-inset-top, 0px);
  --sar: env(safe-area-inset-right, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
  --sal: env(safe-area-inset-left, 0px);
}

html {
  -webkit-text-size-adjust: 100%;   /* 横屏时 Safari 不放大字号 */
  text-size-adjust: 100%;
}

body {
  overscroll-behavior-y: none;      /* 去掉下拉刷新/橡皮筋，更像 App */
}

/* 触屏基线：无蓝框、无 300ms 延迟、双击不缩放、长按不选中 */
button, a, summary, .btn {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  user-select: none;
}

/* 满屏容器：dvh 才等于"可见高度" */
.shell { height: 100vh; height: 100dvh; }
```

**为什么必须 `dvh`**：`100vh` 在 iOS Safari / Android Chrome 里包含了会伸缩的地址栏，页面底部会稳定被裁掉一截。`100dvh` 跟随可见区域变化；老浏览器保留 `vh` 做兜底，所以两行都写。

**贴边元素必须吃安全区**：任何 `position: fixed/sticky` 的顶栏、底栏、悬浮按钮：

```css
.topbar   { padding-top:    calc(8px + var(--sat)); }
.bottombar{ padding-bottom: calc(8px + var(--sab)); }
.app      { padding-left:   calc(12px + var(--sal));
            padding-right:  calc(12px + var(--sar)); }   /* 横屏刘海在侧边 */
```

### 2.3 触控目标与 hover

- 尺寸：**iOS ≥ 44×44pt，Android ≥ 48×48dp**。视觉图标可以小，用 padding 撑大点击区。
- iOS 会把"最后一处的 hover 样式"粘住，必须用 `hover: none` 关掉，改成 `:active` 反馈：

```css
@media (hover: none) and (pointer: coarse) {
  .btn:hover { transform: none; background: inherit; }
  .btn:active { transform: scale(0.96); background: var(--signal-faint); }
  .card:hover { border-color: var(--border); }
}
```

- 输入框字号 **≥16px**，否则 iOS 聚焦时会自动放大页面（这是最常见的"页面被顶歪"原因）：

```css
@media (max-width: 640px) {
  textarea, input, .editable { font-size: 17px; line-height: 1.9; }
}
```

### 2.4 JS：主题持久化 + 主题色同步 + 转化后滚动

首屏前定主题（放进 `<head>`，避免亮色系统下黑闪）：

```html
<script>
  (function () {
    try {
      var s = localStorage.getItem("app-theme");
      var t = (s === "day" || s === "night") ? s
        : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "day" : "night");
      document.documentElement.setAttribute("data-theme", t);
    } catch (e) { }
  })();
</script>
```

业务脚本里同步 `theme-color`，并跟随系统：

```js
function applyTheme(theme, persist) {
  document.documentElement.setAttribute("data-theme", theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "day" ? "#E4E9EF" : "#0B1218");
  if (persist) { try { localStorage.setItem("app-theme", theme); } catch (e) { } }
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "day" ? "day" : "night";
}

applyTheme(currentTheme(), false);

// 用户没手动选过时，跟随系统深浅色
var mq = window.matchMedia("(prefers-color-scheme: light)");
var onScheme = function (e) {
  var saved = null;
  try { saved = localStorage.getItem("app-theme"); } catch (_) { }
  if (!saved) applyTheme(e.matches ? "day" : "night", false);
};
if (mq.addEventListener) mq.addEventListener("change", onScheme);
else if (mq.addListener) mq.addListener(onScheme);   // Safari < 14
```

主操作按钮触发后把结果滚进视野、顺手收起键盘：

```js
function revealResult(el) {
  if (!window.matchMedia("(max-width: 640px)").matches) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var top = el.getBoundingClientRect().top + window.pageYOffset - 64; // 64 ≈ 吸顶栏高度
  window.scrollTo({ top: top < 0 ? 0 : top, behavior: reduce ? "auto" : "smooth" });
}
```

### 2.5 断点建议

| 断点 | 处理 |
|---|---|
| `≤ 860px` | 多栏 → 单栏；侧边竖直导航 → 顶部横条（吸顶）；装饰性元素隐藏 |
| `≤ 640px` | 真正的手机构局：装饰条幅隐藏、标题区两行、主按钮通栏且 ≥48px、面板不嵌套滚动、输入 17px |
| `≤ 380px` | 超窄屏：隐藏 eyebrow、标题降到 17px、状态胶囊截断 |
| `(max-height: 480px) and (orientation: landscape)` | 横屏手机：压缩上下留白，面板最小高度改用 `dvh` |

手机布局的取舍原则（本仓库验证有效）：

- 装饰性滚动条幅（ticker）、环形动画、刻度尺 —— 手机上直接 `display:none`，把纵向空间还给内容。
- 输出面板在手机上**不要**内部滚动（`overflow-y: visible` + `flex: 0 0 auto`），否则长文会缩在 200px 的小窗里，且面板 `overflow:hidden` 会把它裁掉。
- 主操作从"中间那一列"改成"输入与输出之间的通栏按钮"，拇指可达。

### 2.6 真机验证

1. 电脑端：DevTools → 设备栏，至少过 **375×667（SE）、390×844（iPhone 14）、360×800（安卓）** 三档，再看 844×390 横屏。
2. 真机：本地服务必须绑 `0.0.0.0` 才能在手机访问（`python -m http.server 8000 --bind 0.0.0.0`），然后用手机打开 `http://<电脑局域网 IP>:8000`。
3. 重点看：刘海区留白、底部手势条、键盘弹出时主按钮是否被顶掉、长按是否误选中、双击是否缩放。

---

## 3. 发布流程

### 3.1 提交（VSCode 或命令行）

```bat
git add -A
git commit -m "feat: responsive mobile UI for Android and iOS"
git push
```

前提：`.gitignore` 已按 §1.4 配好，否则 `git add -A` 会把嵌套仓库重新变成 `160000` 指针，Cloudflare 立刻再次失败。

### 3.2 Cloudflare 设置

| 项目类型 | Build command | Build output directory |
|---|---|---|
| 纯静态（本仓库） | 留空 | `/` |
| Vite / Vue / React | `npm run build` | `dist` |
| Next.js（静态导出） | `npm run build` | `out` |

改完设置要点 **Retry deployment**（新设置只对下一次构建生效）。

### 3.3 缓存版本号必须改

HTML 里引用静态资源的地方加查询参数，每次发布递增，否则用户/Cloudflare 边缘可能一直拿旧 CSS：

```html
<link rel="stylesheet" href="css/style.css?v=16">
<script src="js/app.js?v=16"></script>
```

---

## 4. 验收清单

**部署**

- [ ] `git ls-files --stage | findstr /b "160000"` 无输出
- [ ] 根目录无 `.gitmodules`（或其中每项都同时有 `path` 和 `url`）
- [ ] `.gitignore` 覆盖所有本地工具目录，`git check-ignore -v <path>` 能命中
- [ ] `git add -A` 之后 `git status` 里没有意外文件
- [ ] Cloudflare `clone repo` 通过，`build` / `deploy` 都变绿
- [ ] 线上打开是新版本（资源 `?v=` 已递增）
- [ ] `.gitignore` 是无 BOM 的 UTF-8，且 `git check-ignore -v node_modules/` 能单独命中第一条规则

**移动端**

- [ ] 三个手机尺寸 + 横屏都不横向滚动、不被裁切
- [ ] 刘海机型顶部内容不被状态栏压住；底部按钮不被手势条压住
- [ ] 输入框聚焦时页面不放大（字号 ≥16px）
- [ ] 所有可点元素 ≥44×44（iOS）/ 48×48（Android）
- [ ] 触屏上 hover 样式不残留，按下有反馈
- [ ] 打开深色模式再切主题，地址栏/状态栏颜色跟着变
- [ ] `prefers-reduced-motion` 下动画关闭、滚动不抖动
- [ ] 键盘弹出后主按钮仍可点（页面可滚动到它）
- [ ] 加了 `?v=` 之后本地预览仍 200（静态服务器要能剥掉查询串）

---

## 5. 已经踩过的坑（实证记录）

| 现象 | 真相 | 结论 |
|---|---|---|
| Cloudflare 报 `No url found for submodule path` | 仓库里有 `160000` 指针但无 `.gitmodules`；来源是 `.opencode/skills/<name>` 这个自带 `.git` 的工具目录被 `git add .` 扫进去 | 用 `git rm --cached` + `.gitignore`，不要试图补 `.gitmodules` |
| 修过一次、过几天又复发 | 嵌套 `.git` 还在磁盘上，后续某次 `git add -A` 把指针原样加回来 | 必须同时写 `.gitignore` 的 `.opencode/` 规则 |
| `基本没改动却提示子模块变更` | 同上，指针指向的 commit 变了 | 同上 |
| `.bat` 双击一闪而过 | 常见成因（按可能性排序）：① 文件含 UTF-8 中文而 cmd 按 GBK 解析；② LF 换行；③ 多行 `( )` 块或 `goto`。任一条都可能让 cmd 提前退出，`pause` 根本到不了 | 启动脚本用**纯 ASCII**、单行命令、不用多行括号块与 `goto`，最后无条件 `pause`；复杂逻辑交给 `.ps1`，`.bat` 只做一行调用 |
| `.ps1` 报一堆 `Missing closing '}'`、中文变 `閿欒` | 无 BOM 的 UTF-8 `.ps1` 被 PowerShell 5.1 按 GBK 解码，中文里的字节把引号提前闭合了 | `.ps1` 全 ASCII；或在 `.bat` 里用 `Get-Content -Raw -Encoding UTF8` 读出再 `[scriptblock]::Create()` 执行 |
| 仓库里出现名为 `~` 的文件夹 | `cmd` 里 `mkdir ~/x` 不展开 `~`，字面建了目录 | `.gitignore` 加 `~/`，直接删掉 |
| 手机上正文被裁掉半屏 | 容器 `height:100vh` | 改 `100dvh` 并保留 `vh` 兜底 |
| 手机底部按钮被手势条盖住 | 没吃 `safe-area-inset-bottom` | 固定底栏 `padding-bottom: calc(10px + var(--sab))` |
| 手机点一下有蓝色方框 | 默认 tap highlight | `-webkit-tap-highlight-color: transparent` |
| 手机上 hover 效果"卡住" | 触屏没有真实的 hover 离开事件 | `@media (hover:none)` 重置 + `:active` 反馈 |
| 命令返回「成功」却什么都没做：退出码 0、stdout 空、文件夹里一个文件都没变 | DSH 在 Windows 上把 Electron 主程序当作沙箱 runner 启动，且目标进程的 env 少了 `ELECTRON_RUN_AS_NODE=1`；Electron 以 GUI 身份起来、抢不到磁盘缓存、单实例锁让它以 0 退出——而退出码 0 在沙箱契约里就是成功 | 见 [§7.1](#71-shell-命令返回成功却什么都没做)：切 Full access 或单次提权绕过沙箱 |
| `grep` / `ripgrep` 扫 `.git/index` 找不到 `160000`，实际却有子模块指针 | 索引是二进制，文本搜索会假阴性 | 只用 `git ls-files --stage` 判定（[§1.3](#13-判定三条命令)） |
| `.gitignore` 第一条规则不生效 | 文件带 UTF-8 BOM，第一条模式被读成 `\ufeffnode_modules/` | 存成无 BOM 的 UTF-8，改完 `git check-ignore -v <path>` 逐条验 |
| `git push` 报 `schannel: ... CRYPT_E_NO_REVOCATION_CHECK (0x80092012)`，换 `-c http.sslBackend=openssl` 又报 `unable to get local issuer certificate` | 本机 git 来自 DSH 自带的 `@dsh-ops` MSYS2 包，`ucrt64/ssl/certs/ca-bundle.crt` 不存在；schannel 的吊销检查也无处可查 | 临时 `GIT_SSL_NO_VERIFY=1 git push`，或改用自己装的标准 Git for Windows（[§7.2](#72-git-推送的-tls-报错)） |
| 加了 `?v=` 之后本地预览 404 | 静态服务器把 query 当成路径的一部分 | 用 `new URL(req.url, base).pathname` 取路径（本仓库 `server.mjs` 已如此） |

---

## 6. 交给下一个 AI 的提示词

把本文件放在项目根目录，然后对 AI 说：

> 读根目录 `HANDOFF.md`。
> 任务一：按 §1.3 检查本仓库是否存在 `160000` 子模块指针——**只用 `git ls-files --stage`**，不要 grep 二进制索引；再用 `git ls-tree -r HEAD` 确认它是否**已经提交**。若存在，按 §1.4 修复（保留本地文件，补 `.gitignore`），按 §1.5 验证，并确认 `.gitignore` 无 BOM。不要改构建配置。
> 任务二：按 §2 检查本项目的移动端适配，逐项对照 §4 的清单，列出缺失项并按 §2.2–§2.5 的模板改 CSS/HTML/JS。
> 任务三：如果所有命令都返回「成功」却什么都没做，先读 §7——那不是你的命令写错了。
> 约束：不要引入新依赖，不要改业务逻辑，改完列出所有改动文件和验证方法。

---

## 7. 环境附注：DSH 工具链的两个坑

> 本节与项目代码无关，讲的是「跑命令的工具本身」。换机器/换环境可能不复现，但踩到时症状极具欺骗性：**你会先怀疑自己的命令写错了，然后花很久才发现命令根本没被执行。**

### 7.1 shell 命令返回成功，却什么都没做

**症状（要同时满足）**

- 退出码 `0`，stdout 完全为空；
- 没有任何副作用：`echo x > file` 不产生文件，`git --version` 无输出；
- **连不存在的命令也返回 0**（`nonexistent-binary-xyz --version` 本应 `command not found` + 退出码 127）；
- stderr 只有 Chromium 三行，PID 每次不同：

```
[33248:1116/112807.435:ERROR:net\disk_cache\cache_util_win.cc:25] Unable to move the cache: 拒绝访问。 (0x5)
[33248:1116/112807.435:ERROR:net\disk_cache\disk_cache.cc:290] Unable to create cache
[33248:1116/112807.435:ERROR:gpu\ipc\host\gpu_disk_cache.cc:737] Gpu Cache creation failed: -2
```

**根因（DSH 0.2.2-rc.3 Windows 打包版）**

每条 shell 命令都会被包进 ACL 沙箱 runner：

```
[DeepSeek Harness.exe, ...\dsh-sandbox-windows-acl\lib\runner.js, --mode workspace-write, ..., --, pwsh.exe ...]
```

`argv[0]` 是 Electron 主程序，**但派生目标进程时没有带上 `ELECTRON_RUN_AS_NODE=1`**：外层 runner 的 `runnerEnvironment()` 设了，真正构建目标 env 的 `targetEnvironment()` 没设。

于是 Electron 以 **GUI 应用**身份启动 → 初始化 Chromium → 与已在运行的实例争抢同一个磁盘缓存（就是那三行报错）→ 单实例锁让它**立刻退出**。而退出码 0 在沙箱契约里就是「成功」，各失败判定器（`classifyRunnerFailure`、ACL 的 `exit 127 + windows-acl-run:` 规则）都不认为 0 是失败，最终被包装成「成功、无输出」。

**绕过（二选一）**

1. 把会话权限切到 **Full access**：不套沙箱，命令直连，之后免审批；
2. 保持 workspace-write，每次调用显式带 `danger-full-access` + 理由，逐次审批。

**先确认是「没执行」还是「执行了没输出」**，用一条必然留下痕迹的命令：

```bash
echo probe-ok && git --version
```

仍然空输出，就是本节的问题。

**上游修法**：`targetEnvironment()` 里当 `process.versions.electron` 存在时补 `ELECTRON_RUN_AS_NODE: '1'`（与 `runnerEnvironment()` 一致）。另一个潜伏坑：`dsh-shell-env` 把 `process.execPath` 当作 `DSH_NODE_EXECUTABLE` 传给 shell，将来用 `$env:DSH_NODE_EXECUTABLE` 跑脚本会撞同一个坑。

### 7.2 git 推送的 TLS 报错

**症状**

```
fatal: unable to access 'https://github.com/<owner>/<repo>.git/':
  schannel: next InitializeSecurityContext failed: CRYPT_E_NO_REVOCATION_CHECK (0x80092012)
```

换后端再试会变成：

```
git -c http.sslBackend=openssl push
# fatal: SSL certificate problem: unable to get local issuer certificate (20)
```

**根因**：本机 `git` 来自 DSH 自带的 `@dsh-ops` MSYS2 包（`…\@dsh-ops\bash-win32-x64\ucrt64\…`），而 `ucrt64/ssl/certs/ca-bundle.crt` **不存在** → OpenSSL 后端无根证书；schannel 的吊销检查在当前网络下也做不了。

**绕过**

```bat
:: 临时（仅本次）
set GIT_SSL_NO_VERIFY=1
git push

:: 或持久化（仅本仓库；注意这是关闭校验）
git config --local http.sslVerify false
```

长期正解：装一份标准 Git for Windows（自带 CA bundle），或把代理/公司根证书导入系统证书库。

### 7.3 命令完全不可用时的只读诊断法

shell 全挂时，文件类工具仍然可用，`git` 的关键状态可以直接读文件得到：

| 想知道 | 直接读 |
|---|---|
| 远程地址、分支追踪 | `.git/config` |
| 当前分支指向的提交 | `.git/refs/heads/<branch>` |
| 提交历史、是否做过 `git rm` | `.git/logs/HEAD`（reflog 是纯文本） |
| 是否存在嵌套仓库 | 逐个 `read <dir>/.git/HEAD`，能读到就是 |
| `.gitmodules` 是否存在 | `read .gitmodules` 是否 not found |

两个必须记住的坑：**glob / grep 类工具会硬跳过 `.git` 目录**，只能按已知路径逐文件探测；`.git/index` 是二进制，按 §1.3 的结论不能用文本搜索判定。

---

*本手册最初基于 SC2TCofTW_Test 的真实故障与修复过程整理；第 7 节及 §1.3 / §1.4 / §4 / §5 的补充条目来自 UgTrans 项目（2026-11）的实测，命令与片段均已在对应项目验证可用。*
