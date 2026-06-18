# CodingPet

> 🦀 一只趴在你桌面上的 Clawd 小螃蟹，跟着 Claude Code 的状态做出对应反应。

CodingPet 是 [`rullerzhou-afk/clawd-on-desk`](https://github.com/rullerzhou-afk/clawd-on-desk.git) 的 **Rust 重构版本**——保留了原项目最核心的「Clawd 桌宠 + Claude Code 状态联动」体验，把底层从 Electron + Node.js 换成了 **Tauri 2 + Rust**，让一只桌宠真正像桌宠：启动快、占内存少、安装包小。

---

## 为什么要 Fork & 重构

原版 [clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk) 是一个非常有趣的项目，但作为一个常驻桌面、几乎只渲染几张 SVG 的「桌宠」，跑在完整的 Electron + Chromium 之上有点重——一个伴随你工作一整天的小螃蟹，不应该比 IDE 还吃内存。

于是这个 Fork 做了一件事：**把原版的核心交互（Claude Code Hook → 状态机 → SVG 动画）用 Rust + Tauri 2 重新写了一遍**，并裁掉了 MVP 阶段不需要的功能，专注于「Claude Code + Clawd 一种角色」的最小可用形态。

## 性能对比

下面是 macOS (Apple Silicon) 上两个版本的实测对比。原版数字来自 Electron 应用的典型范围与该项目 release 资产，本项目数字来自本仓库 `pnpm tauri build` 的产物：

| 指标 | 原版 `clawd-on-desk` (Electron) | 本项目 `CodingPet` (Tauri + Rust) | 变化 |
| --- | --- | --- | --- |
| 安装包 (`.dmg`) | ~80–120 MB（典型 Electron 应用） | **7.2 MB** | **↓ 约 90%+** |
| 解压后 `.app` 体积 | ~250–350 MB（含 Chromium + Node 运行时） | **14 MB** | **↓ 约 95%** |
| 运行时内存占用 | 约 200–400 MB（Electron 主进程 + 渲染进程 + GPU 进程） | **约 30–80 MB**（单进程 + 系统 WebView） | **↓ 约 75%–80%** |
| 进程数 | 多进程（main / renderer / GPU / utility） | 单 Tauri 进程 | 显著减少 |
| 冷启动 | 1–3 秒（需要拉起 Chromium） | < 500 ms（系统 WebView 复用） | **更快** |
| 后端语言 | Node.js (JS) | **Rust** | 更稳、可静态校验 |
| 前端 | HTML/CSS/JS（Electron 内嵌 Chromium） | React 19 + Vite（系统 WebView 渲染） | 体积更小 |

> 安装包体积差异主要来自：Tauri 不打包浏览器，而是复用系统 WebView（macOS 用 WebKit，Windows 用 WebView2）；Rust 后端编译为单一原生二进制，无需附带 Node 运行时。

## 与原版的功能差异（这是一次有取舍的重构）

| 能力 | clawd-on-desk | CodingPet（本仓库） |
| --- | --- | --- |
| Clawd 螃蟹角色 | ✅ | ✅ |
| Claude Code Hook 状态联动 | ✅ | ✅ |
| Codex Hook 支持 | ✅ | ✅（已迁移） |
| 多 Agent（Gemini / Cursor / Copilot 等约 17 种） | ✅ | ❌（暂未移植） |
| 多主题（Cat / Cloudling / 自定义皮肤） | ✅ | ❌（仅保留 Clawd） |
| 权限弹窗 / Allow-Deny 浮卡 | ✅ | ❌（沿用 Claude Code 原生流程） |
| 移动端 PWA 镜像 | ✅ | ❌ |
| 拖拽 / 位置记忆 | ✅ | ✅ |
| 自动更新（Tauri Updater） | ✅（electron-updater） | ✅ |

如果你需要原版的全部功能（多 Agent、多皮肤、PWA、权限气泡），请直接使用 [上游项目](https://github.com/rullerzhou-afk/clawd-on-desk)。本仓库的目标是：**用 1/10 的体积、1/4 的内存换一只刚刚好的 Clawd**。

---

## 下载与安装

到 [Releases](https://github.com/zkassing/CodingPet/releases) 页下载对应平台的安装包：

- **macOS Apple Silicon**：`Coding.Pet_*_aarch64.dmg`
- **macOS Intel**：`Coding.Pet_*_x64.dmg`
- **Windows**：`Coding.Pet_*_x64-setup.exe` 或 `Coding.Pet_*_x64_en-US.msi`
- **Linux**：`coding-pet_*_amd64.AppImage` / `.deb`

### ⚠️ macOS 首次打开提示「应用已损坏，无法打开」

**这不是真的损坏**——本仓库目前还没有付费 Apple Developer 证书，分发的安装包是 ad-hoc 签名 + 未公证（unnotarized）。macOS Gatekeeper 看到这种应用会用一句相当吓人的「已损坏」拦下来（不是因为文件真坏了，而是 Apple 对未公证应用的统一文案）。

打开方式（任选其一）：

**方法一（推荐，一行搞定）**：把应用从 dmg 拖到 `/Applications` 后，在终端跑：

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Coding Pet.app"
```

输入开机密码 → 回车，之后双击就能正常打开。这条命令的作用是去掉 macOS 给从浏览器下载的文件打的「检疫」标记，对所有未签名的开源 macOS 应用都通用。

**方法二**：右键应用 → 「打开」→ 在弹出的对话框里再点「打开」（macOS 14+ 上这个回退路径在某些场景已经被收紧，如果不行就用方法一）。

**方法三**：**系统设置 → 隐私与安全性** → 滚动到底部，会看到「已阻止使用 "Coding Pet"」→ 点「仍要打开」。

> 等本仓库后续有 Apple Developer 证书 + 公证流水线后，这一步就不需要了。进度跟踪见 Roadmap 的「工程基础」段。

### Windows SmartScreen 提示

Windows 上首次运行会被 SmartScreen 拦下「Windows 已保护你的电脑」，因为安装包没有 EV Code Signing 证书。点 **「更多信息」→「仍要运行」** 即可。

### Linux

`.AppImage` 下载后 `chmod +x` 可直接运行；`.deb` 用 `sudo dpkg -i` 安装。

---

## Roadmap / TODO

下面是本仓库后续计划补齐或新做的能力，按优先级粗略排序。欢迎在 issue 里讨论顺序或认领。

### 近期（P0 / 体验补强）

- [ ] **多 Agent 接入**：在现有 Claude Code + Codex 之外补齐 Gemini CLI / Cursor Agent / Copilot CLI / Qwen Code / opencode 的 Hook 适配
- [ ] **权限气泡 (Permission Bubble)**：浮窗 Allow / Deny 卡片 + 全局快捷键（`Ctrl+Shift+Y` / `N`），替代当前「沿用 Claude Code 原生权限流」
- [ ] **多主题 (Theme Pack)**：迁移原版 Calico Cat、Cloudling 主题，并设计可热切换的主题协议（SVG / APNG / WebP 资源 + 状态映射 manifest）
- [ ] **自定义皮肤导入**：支持把 zip 形式的 Pet 包丢进设置面板即可加载（对齐原版 Codex Pet zip）
- [ ] **托盘菜单 (System Tray)**：开/关闭 / 切换主题 / 暂停 Hook / 退出
- [ ] **Mini 模式**：拖到屏幕边缘自动收起，鼠标靠近再弹出
- [ ] **Do Not Disturb**：勿扰时段静默状态切换与通知

### 中期（P1 / 体验增强）

- [ ] **眼神追随 (Eye Tracking)**：Clawd 的眼睛跟随鼠标位置
- [ ] **多显示器支持**：记忆每块屏的位置 / 跨屏拖拽
- [ ] **Session HUD / Dashboard**：当前会话的 token / 工具调用统计悬浮窗
- [ ] **国际化 (i18n)**：至少补齐 `en` / `zh-CN` / `zh-TW` / `ja` / `ko`
- [ ] **设置面板**：替代当前散落在配置文件里的开关（自启动、Hook 开关、主题、快捷键）

### 远期（P2 / 大件）

- [ ] **移动端 PWA / 镜像**：LAN-only、token 鉴权，把 agent 会话只读镜像到手机
- [ ] **JSONL 日志轮询模式**：作为 Hook 不可用时（如某些封闭 IDE）的兜底状态来源
- [ ] **插件化状态机**：把 Hook → Clawd 状态的映射抽出来，让用户能写脚本自定义新状态

### 工程基础（持续进行）

- [ ] 前端 lint / format（ESLint + Prettier，目前 `package.json` 缺 lint 脚本）
- [ ] 前端单元测试（Vitest）+ 关键交互的 E2E（Tauri WebDriver）
- [ ] Rust 侧扩充 `cargo test` 覆盖（目前仅基础检查）
- [ ] 把性能对比表里的「典型范围」换成原版/本版**实测**数字（含 Activity Monitor / Task Manager 截图）
- [ ] CI 加上 `cargo fmt --check` / `cargo clippy` / `pnpm build` 三件套

---

## 项目结构

- `src/`——前端代码，React 19 + Vite。`src/clawd/ClawdPet.jsx` 监听 Tauri 事件并渲染 `public/clawd/svg/` 下的 SVG。
- `src-tauri/`——Rust 后端。`src-tauri/src/lib.rs` 启动一个监听 `127.0.0.1:23333-23337` 的本地 HTTP 服务，把活跃端口写入 `~/.clawd/runtime.json`。
- `hooks/clawd-hook.cjs` & `hooks/codex-hook.cjs`——Claude Code / Codex 的命令钩子，从 stdin 读 hook JSON，映射到 Clawd 状态后 POST 到 `/state`。
- 拖拽位置保存在 `~/.clawd/codingpet-window.json`，删除即可恢复默认位置。

## 开发

使用 `pnpm`（Tauri 配置默认调用 `pnpm dev` / `pnpm build`）：

```bash
# 安装前端依赖
pnpm install

# 仅运行前端 Vite dev server
pnpm dev

# 运行 Tauri 桌面应用（开发模式）
pnpm tauri dev

# 构建前端
pnpm build

# 打包 Tauri 应用（生产）
pnpm tauri build
```

Rust 侧检查（在 `src-tauri/` 下）：

```bash
cd src-tauri
cargo check
cargo test
cargo fmt --check
cargo clippy --all-targets --all-features
```

## Hook 安装与手动测试

```bash
# 安装/卸载 Claude Code 状态钩子
pnpm run install:claude-hooks
pnpm run uninstall:claude-hooks

# 安装/卸载 Codex 钩子
pnpm run install:codex-hooks
pnpm run uninstall:codex-hooks

# 在应用运行时手动测试 Clawd 状态切换
pnpm run test:state -- thinking
pnpm run test:hook -- PreToolUse
pnpm run test:hook -- thinking
pnpm run test:sequence -- all
```

## 自动更新

CodingPet 使用 Tauri 2 Updater 插件，启动时从以下地址检查更新：

```
https://github.com/zkassing/CodingPet/releases/latest/download/latest.json
```

发布更新构建前，请确保 `src-tauri/tauri.conf.json` 中的 updater 公钥与 GitHub Actions secrets 中的私钥匹配。

生成 updater 密钥（私钥不要进 git）：

```bash
pnpm tauri signer generate --write-keys ~/.tauri/codingpet-updater.key
```

把生成的公钥填入 `plugins.updater.pubkey`。Release 构建时通过环境变量提供私钥：

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/codingpet-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<key password if one was set>"
pnpm tauri build
```

由于 `bundle.createUpdaterArtifacts` 已在 `src-tauri/tauri.conf.json` 中开启，release 构建会自动产出 updater artifact。本地若不需要 updater artifact，使用 `pnpm build` + `cargo check --manifest-path src-tauri/Cargo.toml` 进行验证即可。

## GitHub Actions 发布流程

`.github/workflows/release.yml` 工作流会构建 macOS / Windows / Linux 的发行包并上传到 GitHub Release。它在 push `v*` tag 时触发，也可在 Actions 页面手动启动。

使用前需要在 GitHub 仓库做以下设置：

1. **Settings → Secrets and variables → Actions** 添加：
   - `TAURI_SIGNING_PRIVATE_KEY`——updater 私钥完整内容。
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`——私钥密码（如有）。
2. **Settings → Actions → General → Workflow permissions** 启用 **Read and write permissions**，让 `GITHUB_TOKEN` 能创建 release / 上传资产。

每次发版：

1. 同步更新版本号——`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
2. 提交并 push。
3. 打 tag 并推送：
   ```bash
   git tag v0.1.3
   git push origin v0.1.3
   ```
4. 等待 macOS / Windows / Linux 三个平台的 release workflow 跑完。
5. 检查 draft release 中的资产（包括 `latest.json`）后正式发布。
6. 用旧版本 app 验证一次升级链路：能识别新版本 → 下载 → 安装 → 重启。

---

## 致谢

- 上游项目：[rullerzhou-afk/clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk)——Clawd 螃蟹的灵感来源、原始 SVG 资源与多 Agent Hook 的早期实现。
- Tauri 2 团队提供的 Rust 桌面框架。
- 本仓库与原项目一样是粉丝向作品，与 Anthropic、OpenAI 没有官方关联。
