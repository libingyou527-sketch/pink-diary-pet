# Xilian-Pet 重构方案 v2（Fork 路线）

> 生成时间：2026-11-18 17:40
> 前提变更：**取消"不物理合并官方源码"红线**，改为 fork-first
> 对照：v1 外挂式方案保留在 `REFACTOR-PLAN.md`

---

## 0. 结论先说

| 项目 | v1 外挂式 | v2 Fork |
|---|---|---|
| 到"功能完整独立客户端" | 11–14 人日 | **5–6.5 人日** |
| 到"能对话的窗口" | 3.5–4 人日 | 3.5–4 人日（持平） |
| 记忆/日记/表情/视频分镜 | 需迁移 +2–3.5d | **零成本，现成** |
| QQ 接管（PetBridge） | 需写约 200 行客户端 | **零成本，现成** |
| 27 条业务路由 | 需逐条重写 | **零成本，现成** |
| 上游更新风险 | 无 | **有**：2400 行 diff 需 rebase |

核心判断：fork 把"重写"换成"接手"，用**长期维护责任**换**短期交付速度**。
对单人项目通常划算——代价必须制度化（见 §5），否则半年后就是灾难。

---

## 1. 目标结构

```text
D:\tools\Xilian-Pet\                    ← 一个 git 仓库，包含三块
├── .git/                               ← 保留 upstream tag，便于三方合并
├── package.json                        ← 包名 dsh-xilian-core
├── lib/
│   ├── index.js                        ← 宿主插件（官方 0.3.8 + 我们的 2405 行）
│   ├── standalone.js                   ← 独立启动器（官方已有，直接复用）
│   ├── client.js                       ← DSH 内嵌网页版（保留但不启用）
│   ├── memory-*.js                     ← 我们的 5 个模块（原样）
│   ├── video-storyboard.js             ← 我们的视频分镜
│   └── config.js
├── runtime/electron-helper/            ← Electron 壳（官方 + 我们 +380/-14）
├── assets/                             ← 表情 101+101、webm 动作库、字体、logo
├── cordis.patch.yml                    ← 插件 id 改名
├── LICENSE                             ← 保留 MIT 与版权声明
└── docs/
    ├── SHELL-PATCHES.md                ← 壳侧改动清单（便于回扒官方优化）
    └── Upstream-Log.md                 ← 上游同步记录
```

与 DSH 的关系：仍是插件，跑在 DSH 里（D1=A 不变）。
与官方的关系：**代码同源，仓库独立**；官方升级不再覆盖你，但也需要你主动同步。

---

## 2. 迁移清单（fork 路线：几乎全是"复制 + 改名"）

### 2.1 建仓第一次提交（baseline）

```text
1. 从 ~/.dsh/profiles/desktop/node_modules/dsh-pet 整包复制到 D:\tools\Xilian-Pet
   （这是"当前可用版本"，已含我们全部 2405 行改动，不是官方 0.3.8）
2. git init && git add -A && git commit -m "baseline: dsh-pet 0.3.8 + 本地改动"
3. 再从官方 tarball 导入纯净 0.3.8 到另一个分支/tag：
     git checkout --orphan upstream-0.3.8
     （解压 npm 包 → commit → tag）
4. 回到 main，git merge --allow-unrelated-histories upstream-0.3.8（记录共同祖先）
   —— 目的是让未来三方合并有 base 可依
```

> 已知官方 tarball 已缓存在 `%TEMP%\dsh-pet-official\package`（381 文件），可直接用。

### 2.2 必改的 8 处（改完就能跑）

| # | 位置 | 现值 | 改为 | 影响面 |
|---|---|---|---|---|
| 1 | `package.json` `name` | `dsh-pet` | `dsh-xilian-core` | 安装/依赖解析 |
| 2 | `cordis.patch.yml` 插件 id | `dsh-pet` | `dsh-xilian-core` | profile 装配 |
| 3 | `lib/index.js` `ROUTE_PREFIX` | `/dsh-pet-7340` | `/xilian` | 壳↔插件全部 HTTP |
| 4 | `runtime/electron-helper/constants.js` | `dsh-pet-7340` | `xilian` | 壳的请求前缀 |
| 5 | `lib/index.js` 数据目录 | `~/.dsh/dsh-pet` | `~/.dsh/xilian` | 记忆/日记/配置 |
| 6 | `runtime/electron-helper/main.js` configUrl 默认 | `:3080/dsh-pet-7340/config` | 动态端口 + `/xilian/config` | 壳启动 |
| 7 | `package.json` `bin` | `dsh-pet-standalone` | `xilian-pet` | 独立启动命令 |
| 8 | `package.json` `dsh.client` | 保留或移除 | 建议移除（不做网页版） | 少一半维护面 |

**第 6 条最重要**：DSH 端口每次都变（50312 → 61374），壳不能写死。
方案：插件启动时把 `{port, token}` 写入 `~/.dsh/xilian/pet.json`，壳读它（与 qqbot 的
`pet-bridge.json` 同一套路，已验证可行）。

### 2.3 不需要改的（直接白拿）

```text
27 条业务路由          index.js 里全套（chat / config / emoji / state / pose / playback …）
记忆系统               memory-blocks/context/search/summary/tools 五个模块
日记 / 图片 / 视频分镜  diary* / PICTURE_* / video-storyboard
表情路由与资产          /emoji/*  + assets/emojis(_compressed) + emojis_meta.json
QQ 接管                lib/index.js:5188 已经在读 pet-bridge.json 并连 WebSocket
独立启动器             lib/standalone.js（用 @electron/get 拉 Electron、起本地 server）
壳全套                 main/sprite/renderer/shared-core/preload/index.html
```

### 2.4 需要额外处理的 3 件事

```text
A. 与官方共存冲突
   两个插件都连 qqbot 的 9527 WebSocket → 后连的会把先连的踢掉。
   必须：profile 里禁用 dsh-pet，只启用 dsh-xilian-core（你说的"我自己禁用"正好）

B. 数据迁移
   ~/.dsh/dsh-pet/{memory.json,user-memory.json,daily-diary.json,...}
   → ~/.dsh/xilian/  （复制而非移动，验证通过后再删旧目录）
   已有 908 条 pet 记忆 + 984 条 QQ 记忆，务必先备份

C. 资产去重
   assets/_unused-webm-20261109 里 111MB 官方 webm：
   fork 后它仍占体积。决定"要动作库 / 不要"→ 影响 exe 大小
```

---

## 3. 工作量

| 阶段 | 内容 | 人日 | 交付 |
|---|---|---|---|
| F1 | 建仓、baseline、upstream tag、共同祖先 | 0.5 | 可合并的 git 历史 |
| F2 | 8 处改名 + 数据目录 + 端口发现 | 1 | 插件以新身份跑起来 |
| F3 | profile 安装、禁用官方、27 路由验证 | 1 | 功能对齐 |
| F4 | 壳独立启动（standalone 指向新前缀） | 1–1.5 | **双击出窗口、能对话** |
| F5 | 打包 exe（electron-builder / 复用 ensure-electron） | 1.5–2 | Xilian-Pet.exe |
| F6 | 数据迁移 + 回归（记忆/QQ/语音/表情） | 1 | 验收 |
| 合计 | | **6–7 人日** | |

**最快可验收点：F4 结束（3.5–4 人日）** —— 那时已经是完整功能（记忆/日记/表情/QQ 全在），
只是还没打包成 exe。

对比 v1：同等功能要 11–14 人日。**fork 省下约 6–8 人日**。
---

## 4. 要不要顺手模块化？（可选，不阻塞）

v1 方案里最费工的是"从 474 个闭包声明里拆模块"。fork 之后**这件事可以不做**。

```text
不做：index.js 继续是 7633 行的单文件
   优点：零迁移风险，改一行是一行
   缺点：以后新增功能还是往巨文件里塞

要做（推荐在 F6 之后、单独排期）：只拆 4 个高内聚块
   src/prompt/   prompt 拼装（BEHAVIOR_FORMAT_RULES / chatTail / identitySuffix）
   src/emoji/    表情标签与路由
   src/tts/      [语音] 拦截 + GPT-SoVITS 转发
   src/memory/   五个 memory-* 模块已在独立文件，天然可分
   预计 2–3 人日，纯重构，不改行为，每拆一个跑一次对拍
```

结论：**第一版一律不拆。** 等 F4 验收通过、系统稳定后再按需重构。

---

## 5. 上游维护制度（fork 的最大风险，必须现在定规矩）

fork 之后最大的坑不是技术，是**半年后你不知道自己改过什么**。三条制度：

### 5.1 三方合并模型

```text
git 里的三个点：
  base     官方 0.3.8（tag: upstream-0.3.8）
  ours     main（我们的 2405 行改动）
  theirs   官方新版（fetch 到 upstream/main）

同步流程：
  git remote add upstream https://github.com/PC2005-cloud/dsh-pet.git
  git fetch upstream
  git merge upstream/main          ← 冲突集中在我们改过的 6 个文件
```

### 5.2 改动登记表（docs/Upstream-Log.md）

每次同步记一行：

```text
| 日期 | 官方版本 | 冲突文件 | 处理方式 | 备注 |
|---|---|---|---|---|
| 2026-11-18 | 0.3.8 | - | baseline 建立 | 含本地 2405 行 |
```

### 5.3 壳侧改动单独可重放（docs/SHELL-PATCHES.md）

我们已经知道壳的精确改动量：

```text
sprite.js      +160 / -6    朝向持久化、镜像翻转、HUD 位移
renderer.js    +101 / 0     壳侧渲染补充
shared-core.js  +94 / -7    共享逻辑
main.js         +25 / -1    托盘菜单/自检
```

做法：这 4 处改动各自独立 commit，并在 SHELL-PATCHES.md 记录"文件/函数/目的/冲突风险"。
官方壳有优化时，只 rebase 这 4 个 commit，而不是重读 15 个文件。

**红线（新）**：壳的骨架（物理引擎 / DPI 线性化 / 指针命中 / 置顶看门狗）**只增量、不改实现**，
否则每次上游同步必然撞车。

---

## 6. 风险清单

| 风险 | 等级 | 说明 | 对策 |
|---|---|---|---|
| 上游 rebase 成本 | **高** | 2400 行 diff，官方每次改这 6 个文件都可能冲突 | §5 三方合并 + 登记表；一年同步 1–2 次即可 |
| 双插件抢 9527 | 高 | 两个 pet 都连 qqbot 桥，后连踢先连 | profile 只启用一个；启动时自检并报错 |
| 端口硬编码 | 中 | DSH 端口每次变（50312→61374） | 写 `~/.dsh/xilian/pet.json` 发现文件 |
| 数据迁移丢档案 | 中 | 908 + 984 条记忆 | 复制不移动，先备份，验证后删 |
| 许可证义务 | 中 | MIT 允许 fork，但须保留版权与 LICENSE | 保留 LICENSE + README 注明 fork 自 dsh-pet 0.3.8 |
| exe 体积 | 低 | webm 111MB + Electron ~200MB | 动作库按需；Electron 用 ensure-electron 按需下载 |
| 与官方功能分叉 | 低 | 我们不跟官方演进，会逐渐落后 | 接收"落后"是 fork 的既定代价 |

---

## 7. 需要你拍板的 4 件事

```text
D1 包名/命令名
   dsh-xilian-core（插件） + xilian-pet（命令行） —— 建议
   或你指定别的

D2 数据目录
   ~/.dsh/xilian/  ← 建议（与官方隔离）
   或继续用 ~/.dsh/dsh-pet/（与官方共用，风险：官方启用时会读同一份）

D3 webm 动作库（111MB）
   搬回 assets/webm/（exe 变大，但动作库可用）
   或保持 _unused（体积小，动作库不可用）

D4 官方 dsh-pet
   从 profile 卸载（干净，不可回退）
   或仅禁用（保留回退能力，但 profile 体积多一份）
```

---

## 8. 下一步（确认后我就开工）

```text
Step 1  F1 建仓（0.5d）—— 复制、git init、baseline commit、upstream tag
        ↑ 这一步无风险、可随时丢弃，建议先做

Step 2  F2 改名（1d）—— 8 处改动，跑通"插件以新身份加载"

Step 3  F3+F4（2–2.5d）—— 禁用官方、验证 27 路由、壳独立启动
        ↑ 到这里可验收：双击出窗口、能打字、有回复、记忆在、QQ 在

Step 4  F5+F6（2.5–3d）—— 打包 exe、数据迁移、回归
```

**验收标准（Step 3）**：双击启动 → 悬浮窗出现 → 输入框打字 → 气泡显示回复 →
精灵动作正常 → 记忆能读写 → QQ 能收发（含语音）。

---

*本方案所有改动量数字来自实测：官方 0.3.8 tarball 381 文件 vs 本地 616 文件；
diff +2405/-53；壳侧 +380/-14；27 条路由；PetBridge WS 协议 3 种报文。*
---

## 9. 最终裁决（2026-11-18 定稿）：插件并入整合

用户决策：**dsh-pet 禁用 / 使用独立客户端 / 大脑为 dsh-xilian-core / 后端插件并入整合**

### 9.1 最终插件清单

| 插件 | 状态 | 理由 |
|---|---|---|
| `dsh-xilian-core`（自研） | 启用 | 大脑 + 壳后端 + TTS 三合一 |
| `dsh-pet`（官方） | 禁用（保留） | 防抢 9527 WebSocket；防双份记忆写入；保留回退 |
| `@tencent-connect/dsh-qqbot` | 启用 | 纯黑盒，只提供 9527 桥 |
| `@memef1f1y/dsh-plugin-tts` | 禁用 | 语音并入 core，避免两条 TTS 路径 |
| `dsh-voice` | 保留 | STT 语音输入，与桌宠无关 |
| `memory-viewer` / `pink-diary` | 保留 | 自有 UI 插件 |

### 9.2 并入内容

```text
1. dsh-pet 宿主半边整体 fork（27 路由 / 记忆 / 日记 / 表情 / PetBridge 客户端）—— 0 成本
2. TTS 插件中的 gptsovits provider（约 90 行）折入 core 的 src/tts/ —— 0.5 人日
3. 新增 core 路由 POST /xilian/voice —— 0.5 人日
4. 新增壳内音频播放能力（new Audio + 自动播放策略 + 降级）—— 0.5 人日
```

### 9.3 关键缺口：壳不能放音频（实测）

```text
electron-helper 全量搜索 new Audio / <audio> / .mp3 / AudioContext / speechSynthesis
→ 0 命中
壳里的 playback 指"动画视频回放"，与语音无关
web 版 client.js 才有 playReplyVoice() → /dsh-tts-api/speak
```

**结论：不补这块，语音在独立壳里会静默失效**（模型输出 voice:true，壳无人消费）。

### 9.4 数据目录：第一阶段不改名

```text
决定：继续共用 ~/.dsh/dsh-pet/
理由：保留 dsh-pet 作为回退时，共用目录可零迁移回退
     改名要搬 908 + 984 条记忆，回退时还要搬回来
时机：新壳稳定、回退需求消失后再改名
```

### 9.5 工作量修正（净持平）

| 阶段 | 人日 |
|---|---|
| F1 建仓 | 0.5 |
| F2 改名（不含数据目录） | 0.8 |
| F3 安装 + 禁用官方 + 27 路由验证 | 1.0 |
| F3.5 TTS 折入 + `/xilian/voice` | 0.5 |
| F4 壳独立启动 | 1.0–1.5 |
| F4.5 壳内语音播放 | 0.5 |
| F5 打包 exe | 1.5–2.0 |
| F6 数据迁移 | 0（共用） |
| **合计** | **5.8–6.8** |

### 9.6 必须接受的副作用

```text
禁用 dsh-pet → DSH 网页里的桌宠一起消失
我们只在独立壳里能看到絮
（若两者都要，会抢 9527，只能二选一）
```
---

## 10. 决策定稿（2026-11-18 18:00）

### 10.1 已锁定

| # | 决策 | 结论 |
|---|---|---|
| D1 | 大脑位置 | **插件内**（dsh-xilian-core），依赖 DSH 在线 |
| D2 | QQ 接管 | **复用 dsh-pet 现成 PetBridge 客户端**（fork 白拿） |
| D3 | 独立方式 | **fork dsh-pet 整包**（红线取消），新包名 `dsh-xilian-core` |
| D4 | 官方 dsh-pet | **禁用**（保留，可回退） |
| D5 | 包结构 | **monorepo（方案 C）+ 半并（方案 B）** |
| D6 | 记忆/日记 UI | **不脱离 DSH**：界面留在 DSH 网页，不做壳内版本 |
| D7 | 数据目录 | 第一阶段**共用** `~/.dsh/dsh-pet/`（回退零迁移） |
| D8 | TTS 插件 | **禁用**，gptsovits provider 折入 core |
| D9 | 模块化 | 第一版**不做**，等稳定后单独排期 |

### 10.2 目标目录（monorepo）

```text
D:\tools\Xilian-Pet\                  ← 一个 git 仓库
├── packages/
│   ├── core/                         ← dsh-xilian-core（宿主：27 路由 + 记忆 + 表情 + TTS + QQ 桥）
│   │   └── index.js                  ← 巨型单文件（暂不拆）
│   ├── memory-viewer/                ← 只留 UI 半边，数据读 /xilian/memory
│   ├── pink-diary/                   ← 只留 UI 半边，数据读 /xilian/diary
│   └── shell/                        ← Electron 壳（runtime/electron-helper fork）
├── pnpm-workspace.yaml
├── docs/
│   ├── SHELL-PATCHES.md
│   └── Upstream-Log.md
└── LICENSE                           ← MIT，注明 fork 自 dsh-pet 0.3.8
```

### 10.3 并入/不并入清单（最终）

```text
并入 core（宿主）：
  ✓ dsh-pet 的 27 条业务路由（整体 fork）
  ✓ memory-viewer 的 GET /dsh-pet-memory  → 改为 /xilian/memory
  ✓ pink-diary 的 GET /xu-diary          → 改为 /xilian/diary
  ✓ TTS 插件的 gptsovits provider（约 90 行）
  ✓ 新增 POST /xilian/voice

保留为独立包（只留 UI 半边）：
  · memory-viewer/client.js（45KB，slots + locale）
  · pink-diary/client.js（25KB，slots + locale）

不并入：
  ✗ TTS 插件的其余 provider / RVC / ChatTTS 代码（随插件一起禁用）
  ✗ dsh-voice（STT，独立职能）
```

### 10.4 工作量（最终）

| 阶段 | 人日 |
|---|---|
| F1 monorepo 建仓 + baseline + upstream tag | 0.5 |
| F2 改名 + 路由前缀 + 端口发现 | 0.8 |
| F3 安装 + 禁用官方 + 27 路由验证 | 1.0 |
| F3.5 TTS 折入 + `/xilian/voice` | 0.5 |
| F3.6 记忆/日记路由并入 core（+两个 UI 包改 endpoint） | 0.3 |
| F4 壳独立启动 | 1.0–1.5 |
| F4.5 壳内语音播放 | 0.5 |
| F5 打包 exe | 1.5–2.0 |
| F6 数据迁移 | 0（共用目录） |
| **合计** | **6.1–7.1** |

### 10.5 明确的非目标（本期不做）

```text
✗ 壳内记忆查看器 / 日记面板（1–2 人日/个，需要时再排）
✗ index.js 模块化拆分（474 个闭包声明，2–3 人日，等稳定）
✗ DSH 升级（推迟到 P6 之后，按 §10.4 的门禁执行）
✗ 移除官方余额/投喂（保留）
✗ 与官方 dsh-pet 共存（会抢 9527，只能二选一）
```

### 10.6 webm 占位文件：实证与处置（2026-11-18）

原判断有误。所谓"官方 111MB 动作库"经实测**不是动作库**：

```text
assets/_unused-webm-20261109/
  文件数        106
  大小          全部 953,457 字节（完全一致）
  MD5（前 100）  A5E69579 —— 同一个文件被复制 106 份
  占用          ≈ 96 MB

assets/webm/（我们真实的库）
  文件数        19
  总大小        26.5 MB
  大小分布      797KB ~ 8.1MB（各异，真视频）
```

**处置：直接删除 `_unused-webm-20261109/`，保留 `assets/webm/`。**

依据：

```text
动画是运行时按文件名查找的：
  findAnim(名) → assets/webm/名.webm  或  $DSH_HOME/dsh-pet/main-animation/webm/名.webm
  没有配置清单，没有索引
这 106 个文件早已不在 webm/ 目录内 → 今天任何动作请求它们本来就是 404
→ 删除不改变任何现有行为，纯回收 96MB
```

附带结论：

```text
- 仓库 .gitignore 已排除 assets/**/*.webm → 这些文件从未进过 git，删除不产生 diff
- fork 后的 exe 体积直接省约 96MB
- "要不要动作库"这个问题被消解：真正的动作库只有 19 个，一直保留
```
