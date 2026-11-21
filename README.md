# 絮的粉色日记 · AI 多模态桌宠

> 一个运行在 DSH Desktop 里的粉色系 AI 桌宠：Live2D/WebM 渲染、QQ 官方 Bot 接入、多模态图片与引用消息、身份层与 ACL 分级记忆、自动日记与记忆查看器。

本项目是把一套本地私有的桌宠实验整理成的可复现开源版本：自训 GPT-SoVITS 语音、
结构化记忆检索、以及一本她能自己翻的粉色日记，桌面与 QQ 共用同一份记忆。代码采用 MIT 协议；Live2D 模型不随仓库分发，详见 [assets/README.md](assets/README.md)。

---

## 功能亮点

- **Live2D / WebM 桌宠渲染**
  - 桌面窗口与 Web 聊天弹窗（dsh-xilian-core）；
  - 支持透明桌宠、拖拽、点击、气泡对话；
  - 19 段预渲染 WebM 素材：5 个动作 / 2 个转身 / 12 个表情（1000×1000、30fps、VP9 带 alpha）；
  - 右键「镜像翻转」即时换向，方向存 `localStorage`，重启保持；
  - `POST /dsh-pet-7340/anim` 可在聊天/插件里点播任意片段（如 AI 判断开心 → `expr_星星眼`）；
  - 素材规格、配置池与接口详见 [docs/dsh-pet-animations.md](docs/dsh-pet-animations.md)；
  - 自带模型占位说明，使用者可替换为自己的 Live2D/WebM 素材。

- **自己的声音（GPT-SoVITS）**
  - 本地 GPT-SoVITS v2ProPlus + 自训权重，不是调云端 TTS；
  - 服务按需拉起、空闲 20 分钟自动休眠，醒来后首次合成约 60-80 秒；
  - 语音优先：`[语音]` 标签命中时先发语音，失败回落文字；
  - 强制 UTF-8 环境，避免 `♪` 这类字符在 GBK 下合成 400。

- **结构化记忆（可检索）**
  - 长对话超预算时，最旧 20% 轮次压成 block（摘要 + 原文都保留）；
  - 她可以 `[[search_old_memory: 关键词]]`、`[[decompress_old_memory: b1]]` 主动查旧事；
  - 记忆按 scope 隔离（本地 / 主人私聊 / 群聊 / 他人私聊），不串门。

- **QQ 官方 Bot 接入**
  - QQ 私聊与群聊；
  - 群聊只在 @ 机器人时响应；
  - 群聊图文、引用文字、引用图片解析；
  - QQ 侧不使用 qqbot 的斜杠命令，所有 `/...` 都作为普通聊天文本。

- **多模态输入**
  - 本地/网页粘贴或拖拽图片；
  - QQ 图片、引用图片走同一套下载、压缩、超时降级管线；
  - 记忆面板按需加载缩略图，不把 base64 写进记忆。

- **身份层 + 分级记忆 ACL**
  - 主人 openid 白名单，严格按 openid 识别，不做昵称匹配；
  - 本地 / 主人私聊：身份层 + 私密记忆 + 日记；
  - 普通用户私聊：身份层 + 该用户自己的私聊/公开群历史；
  - 群聊：身份层 + 当前群历史 + 当前发言人公开资料；
  - 群聊绝不读取任何人的私聊 raw；被问私聊内容时统一回答：
    > 这是我们的秘密哦。

- **自动粉色日记（她可以自己翻）**
  - 珍贵对话自动写入当天 Markdown；
  - 23:59 定时一日总结；也可以点面板上的「写今日总结」提前写（每天只写一次）；
  - 她可以 `[[read_diary: 2026-11-13]]`、`[[search_diary: 关键词]]` 主动查旧日记；
  - 对话里只自动带最近 3 篇，更早的日期列在尾部「日记篇目」里，需要时自己查；
  - 开局自动清理"昨天空白且无对话"的日记，避免留空页；
  - 日记不记录图片日志；纯图片不写，图文只写文字；
  - 日记目录可通过配置修改，默认 `~/.dsh/pink-diary`。

- **动态上下文压缩**
  - 默认 65,536 上下文窗口，80%（约 52k）触发压缩；
  - 低于阈值时加载全部历史，不再固定 `slice(-10)` / `slice(-12)`；
  - 超限时取最旧 20% 的完整 user/assistant 轮次，同步生成不超过 50 字的旧记忆摘要；
  - 摘要 5 秒超时或失败时，直接丢弃旧 20%，保证回复不被阻塞。

- **Token 成本优化**
  - 本地正则判断屏幕意图，普通消息不再额外调用一次 82-token 的识屏判断；
  - System Prompt 固定前缀：人设 → 身份 → 记忆工具 → 日记工具 → 规则；
  - 时间、日记、篇幅/表达提醒全部后置到 user 尾部；
  - 不做"按问题自动检索旧记忆"：那会让 system 每轮变化、缓存前缀失效；
  - 实测：单轮输入约 45k，缓存命中率约 90%，每轮真正新 token 约 4.3k；
  - 每轮模型请求后把 `prompt_tokens / completion_tokens / cache_hit_tokens` 写进
    `~/.dsh/xilian/pet/token-usage.log`。

- **视频分镜**
  - QQ `video/mp4` 入站不下载整段视频，只记录 URL/ID 并先回 `[视频处理中...]`；
  - 模型可用 `[[video_storyboard: v1]]` 请求分镜；
  - 本地适配 `dsh-video-storyboard` CLI，输出一张 PNG 作为多模态附件；
  - 20 秒超时/失败回 `[视频解析失败，请稍后再试]`。

- **两个面板**
  - 记忆查看：DSH 侧栏查看对话，最近 10 条 + 加载更早，缩略图按需加载；
  - 粉色日记：按日期浏览、手动写、删除、让絮写一段、写今日总结（带去重）。

---

## 目录结构

```text
pink-diary-pet/
├─ packages/core/               # dsh-xilian-core（唯一真源，junction 部署到 profile）
│  ├─ lib/
│  │  ├─ index.js               # 宿主：提示词/记忆/聊天/QQ/TTS/路由
│  │  ├─ client.js              # 浏览器端
│  │  ├─ config.js              # 运行时配置（diaryDir / memoryBlocks …）
│  │  ├─ memory-*.js            # 结构化记忆：块账本/检索/摘要/上下文/工具
│  │  └─ diary-tools.js         # 日记查询工具（解析/检索/格式化）
│  └─ runtime/electron-helper/  # 桌面窗口（Electron）
├─ src/
│  ├─ plugins/pink-diary/       # 日记面板（前端 + 空壳宿主）
│  ├─ plugins/memory-viewer/    # 记忆面板（前端 + 空壳宿主）
│  └─ qqbot/                    # qqbot 补丁镜像（仅归档，部署在 profile 的 node_modules）
├─ tools/
│  ├─ gpt-sovits/               # 启动/停止/修剪脚本
│  └─ dsh/                      # 补丁文件 + 校验脚本 + cookie 维护
├─ tests/                       # memory-blocks / diary-tools
├─ docs/                        # 架构、提示词地图、补丁与运维文档
├─ config/                      # config.example.yml / identity.example.json
├─ scripts/                     # install.mjs / verify.mjs / upstream-diff.mjs
└─ assets/                      # 图标与压缩表情包（模型不入库）
```

`packages/core/` 是唯一真源，通过 junction 挂进 DSH profile；`src/qqbot/` 只是补丁归档，
真正生效的是 profile 里 `@tencent-connect/dsh-qqbot` 的 `dist/`（由 pnpm patch 重放，见
[docs/Qqbot-Patches.md](docs/Qqbot-Patches.md)）。

---

## 快速开始

### 1. 环境准备

- **Node.js >= 24**
  - DSH 0.2.2 自带 Node 24 运行时；
  - qqbot 0.5.2 要求 >= 20.3，GPT-SoVITS 走独立的 conda 环境。
- **（可选）GPT-SoVITS v2ProPlus**
  - 需要语音时安装，仓库不分发模型权重；设置见 `~/.dsh/xilian/tts/settings.json`。
- **DSH Desktop**
  - 需要已经安装并启动过一次，确保存在 profile：
    ```text
    ~/.dsh/profiles/desktop
    ```
- **QQ 开放平台 Bot**
  - 需要 AppID / AppSecret；
  - 需要开启私聊和群聊能力。

### 2. 克隆与安装依赖

```bash
git clone https://github.com/<your-name>/pink-diary-pet.git
cd pink-diary-pet
npm install          # 只装部署脚本需要的 js-yaml
```

根目录只安装部署脚本所需的 `js-yaml`。`dsh-xilian-core`、`dsh-qqbot`、`sharp` 由 DSH profile 提供。

### 3. 准备配置

```bash
cp config/config.example.yml config/config.yml
cp .env.example .env
```

编辑 `config/config.yml`：

```yaml
qq:
  appId: "你的 QQ Bot AppID"
  appSecret: "你的 QQ Bot AppSecret"
  ownerOpenIds:
    - "你的 openid"
  sharedC2cIds:
    - "你的 openid"

paths:
  diaryDir: "~/.dsh/pink-diary"
  pictureDir: "~/.dsh/xilian/pet/pictures"
  memoryDir: "~/.dsh/xilian/pet"

profile:
  name: "desktop"
```

或使用 `.env`：

```env
QQBOT_APP_ID=你的 AppID
QQBOT_APP_SECRET=你的 AppSecret
OWNER_OPENIDS=你的 openid
PINK_DIARY_DIR=~/.dsh/pink-diary
PINK_PICTURE_DIR=~/.dsh/xilian/pet/pictures
DSH_PROFILE=desktop
```

> `config/config.yml`、`.env` 已被 `.gitignore` 排除。  
> 真实 openid 不要写进代码或 README。

### 4. 注册 QQ Bot

1. 打开 [QQ 开放平台](https://q.qq.com/)；
2. 创建机器人应用；
3. 在「开发设置」获取：
   - `AppID`
   - `AppSecret`
4. 开启「私聊」和「群聊」能力；
5. 将机器人加入测试群；
6. 群聊必须 **@ 机器人** 才会收到消息；
7. 如使用沙箱环境，把测试 QQ 加入沙箱白名单。

QQ 群 Bot 不会向普通群消息推送未 @ 的消息；图片和引用消息也需要 @ 才会进入处理链路。

### 5. 部署到 DSH profile

```bash
npm run install:host -- --profile desktop
```

脚本会：

- 读取 `config/config.yml` 与 `.env`；
- 生成 `~/.dsh/xilian/pet/pink-diary-pet.json`；
- 创建日记/图片目录；
- 复制最终 host / qqbot / 两个插件到 profile；
- 如果 `~/.dsh/xilian/pet/identity.json` 不存在，生成空 owner 的示例身份文件。

也可以先 dry-run：

```bash
node scripts/install.mjs --profile desktop --dry-run
```

### 6. 配置 QQ 凭证

`config.yml` / `.env` 中的 AppID/AppSecret 不会自动写入 DSH 的插件配置。  
请在 DSH Desktop 的 QQ 插件配置中填入同样的值，或按 DSH 插件配置文档编辑 profile 的 `cordis.patch.yml`。

> 不要把带真实 AppSecret 的 `cordis.patch.yml` 提交到 Git。

### 7. 启动

重启 DSH Desktop，或重载 dsh-xilian-core / qqbot 插件。

默认目录：

```text
~/.dsh/pink-diary              # 日记
~/.dsh/xilian/pet/pictures        # 图片
~/.dsh/xilian/pet/memory.json     # 主人本地记忆
~/.dsh/xilian/pet/identity.json   # 身份层
~/.dsh/qqbot/pet-qq-memory.json
```

首次启动会自动创建日记和图片目录。

---

## 使用说明

### 本地桌宠

- 在 DSH 中打开桌宠；
- 聊天、发图、拖拽图片；
- 点击/拖拽桌宠进行互动；
- 记忆查看器可查看历史。

### QQ 私聊

- 直接发消息；
- 发图；引用图片；
- 普通用户只会读写自己的用户级记忆；
- 主人 openid 才会进入完整私密层。

### QQ 群聊

- 必须 @ 机器人；
- 群聊只能读取：
  - 身份层；
  - 当前群历史；
  - 当前发言人的公开 profile；
- 不会读取任何人的私聊 raw；
- 群友问私聊内容时固定回答：
  ```text
  这是我们的秘密哦。
  ```

### 关于 QQ 指令

当前 petMode **禁用了 qqbot 的斜杠命令**：

```text
/new
/clear
/help
/compact
/preset
```

都会被当作普通聊天文本，不会清空记忆，也不会切换会话。  
如果需要清空记录，请使用 DSH 本地界面或后续版本提供的桌宠专用命令。

---

## 配置说明

### 上下文窗口与摘要

`config/config.yml`：

```yaml
context:
  window: 65536      # 预算 = window × compressionRatio ≈ 52k
  compressionRatio: 0.8
  summaryRatio: 0.2
  summaryMaxChars: 50
  summaryTimeoutMs: 5000
```

当 `System + 当前输入 + 历史 + 图片估算` 超过 `window * compressionRatio`：

1. 取最旧 `summaryRatio`（20%）的完整对话轮次；
2. 同步调用模型生成一句 ≤50 字摘要；
3. 用 `[旧记忆摘要：...]` 替换旧轮次；
4. 保留剩余 80% 历史；
5. 摘要超过 5 秒或失败，直接丢弃旧 20%，不阻塞回复。

更换模型时只改 `window`，不需要改代码。窗口开太大不会更聪明：历史越长，
她对其中某一句的注意力越差（"第一句话是什么"这类问题会答不上）。

### 结构化记忆（已启用）

超预算时，最旧 20% 的完整轮次会压成一个 block：

```text
block = 摘要（给上下文）+ 原始消息（给检索）+ 关键词 + 时间边界
文件   ~/.dsh/xilian/pet/context-blocks.json
scope  本地 owner / 主人私聊 owner-private / 群聊 group:<id>，互相隔离
```

她有两种工具可以主动查旧事（文本标记，非函数调用）：

```text
[[search_old_memory: 关键词]]   命中 block 的摘要 + 该块开头两条原文
[[decompress_old_memory: b1]]   取某个 block 的原文，可分页
```

设计取舍：**不做"按当前问题自动检索"**。试过放在 system 和 user 尾部，
前者每轮破坏缓存前缀，后者让她"手里被塞了搜索结果"、容易主动翻旧账；
现在只保留块索引，旧细节一律由她自己查。

配置：

```json
"memoryBlocks": { "enabled": true, "file": "~/.dsh/xilian/pet/context-blocks.json" }
```

两种写法都认：`memoryBlocks.enabled` 与扁平的 `memoryBlocksEnabled`。
详细设计与测试见 [docs/structured-memory-experiment.md](docs/structured-memory-experiment.md)。

### 身份层

```text
~/.dsh/xilian/pet/identity.json
```

```json
{
  "owner": {
    "openIds": [],
    "displayName": "主人",
    "address": "主人",
    "preferences": "温柔、亲近的语气"
  }
}
```

- `openIds` 为空时，不识别任何主人；
- 只按 openid 识别，不做昵称匹配；
- 身份摘要限制 200 字。

### 路径

`packages/core/lib/config.js` 读取：

1. 环境变量 `PINK_DIARY_DIR` / `PINK_PICTURE_DIR`；
2. `~/.dsh/xilian/pet/pink-diary-pet.json`；
3. 默认值。

默认：

```text
~/.dsh/pink-diary
~/.dsh/xilian/pet/pictures
```

### 用户记忆

```text
~/.dsh/xilian/pet/user-memory.json        # 私聊
~/.dsh/xilian/pet/user-group-memory.json  # 群聊公开历史
~/.dsh/xilian/pet/user-profiles.json      # 公开 profile
```

群聊路径只读 `user-profiles.json`，不会读取 `user-memory.json`。

---

## 安全提示

1. **AppSecret 绝不提交**  
   `config/config.yml`、`.env`、profile 的 `cordis.patch.yml` 都可能含真实凭证。

2. **不要提交真实记忆**  
   `memory.json`、`identity.json`、`user-*.json`、`pet-qq-memory.json` 都属于隐私数据。

3. **不要提交真实日记/图片**  
   `~/.dsh/pink-diary`、`~/.dsh/xilian/pet/pictures` 以及任何私人绝对路径目录都不要放进仓库。

4. **不要提交真实 openid**  
   文档、测试、示例统一使用 `<OWNER_OPENID>` / `00000000000000000000000000000000`。

5. **模型版权单独处理**  
   Live2D 模型不在 MIT 范围内，详见 [assets/README.md](assets/README.md)。

---

## 依赖版本

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | >= 24 | DSH 0.2.2 runtime |
| DSH | 0.2.2-rc.5 | 桌面宿主 |
| dsh-xilian-core | 0.1.0 | 本项目内核（fork 自 dsh-pet 0.3.8，MIT） |
| GPT-SoVITS | v2ProPlus | 本地语音，AGPL（独立安装，不随仓库分发） |
| @tencent-connect/dsh-qqbot | 0.5.2（钉死） | QQ Bot，本地补丁 + pnpm patch 重放 |
| @tencent-connect/qqbot-nodejs | 1.0.5 | QQ SDK，MIT |
| sharp | 0.35.5 | 图片压缩（由 profile 安装） |
| js-yaml | ^4.1.0 | 安装脚本读取配置 |
| Electron | DSH Desktop 提供 | 不重复安装 |

`npm install` 只安装根目录的 `js-yaml`。完整运行时依赖由 DSH profile 的 `node_modules` 提供。

---

## 开发与验证

```bash
npm run verify                      # 路径/密钥/语法体检
node tests/memory-blocks.test.mjs   # 结构化记忆（4 项）
node tests/diary-tools.test.mjs     # 日记解析与检索（4 项）
node tools/dsh/verify-qqbot-patches.mjs   # qqbot 补丁是否还在
```

检查：

- 是否残留真实 openid / 本地绝对路径；
- JS/JSON 语法；
- 是否误提交 `.tmp`、`backup`、patch 快照；
- qqbot 的 petMode / 语音 / pet-bridge 标记是否完整（DSH 或插件更新后必跑）。

---

## 版权与许可

- **代码**：MIT，见 [LICENSE](LICENSE)。
- **上游修改**：基于 `dsh-pet 0.3.8`（Copyright © 2026 PC2005-cloud）和 `@tencent-connect/dsh-qqbot 0.5.2`（Copyright © 2026 Tencent Connect），二者均为 MIT；见 [NOTICE](NOTICE)。
- **Live2D 模型**：原私有配置使用 Steam 创意工坊 **RelySeven** 的作品，不可商用，不随本仓库分发。
- **本仓库只开源代码逻辑**，不包含模型、真实记忆、日记、图片或用户数据。

---

## 免责声明

本项目涉及 QQ 官方 Bot、第三方模型和本地 AI 服务。请遵守 QQ 开放平台条款、模型作者授权以及所在地法律法规。因使用本项目产生的账号、数据或版权问题由使用者自行承担。
