# 絮的粉色日记 · AI 多模态桌宠

> 一个运行在 DSH Desktop 里的粉色系 AI 桌宠：Live2D/WebM 渲染、QQ 官方 Bot 接入、多模态图片与引用消息、身份层与 ACL 分级记忆、自动日记与记忆查看器。

本项目是把一套本地私有的桌宠实验整理成的可复现开源版本。代码采用 MIT 协议；Live2D 模型不随仓库分发，详见 [assets/README.md](assets/README.md)。

---

## 功能亮点

- **Live2D / WebM 桌宠渲染**
  - dsh-pet 桌面窗口与 Web 聊天弹窗；
  - 支持透明桌宠、拖拽、点击、气泡对话；
  - 自带模型占位说明，使用者可替换为自己的 Live2D/WebM 素材。

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

- **自动粉色日记**
  - 珍贵对话自动写入当天 Markdown；
  - 定时一日总结；
  - 日记不记录图片日志；纯图片不写，图文只写文字；
  - 日记目录可通过配置修改，默认 `~/.dsh/pink-diary`。

- **动态上下文压缩**
  - 默认 1M 上下文窗口，80%（800k）触发压缩；
  - 低于阈值时加载全部历史，不再固定 `slice(-10)` / `slice(-12)`；
  - 超限时取最旧 20% 的完整 user/assistant 轮次，同步生成不超过 50 字的旧记忆摘要；
  - 摘要 5 秒超时或失败时，直接丢弃旧 20%，保证回复不被阻塞。

- **Token 成本优化**
  - 本地正则判断屏幕意图，普通消息不再额外调用一次 82-token 的识屏判断；
  - System Prompt 固定前缀：人设 → 身份 → 记忆工具 → ACL；
  - 时间、Profile、日记、block 索引、预检索结果全部后置；
  - 每轮模型请求后打印 `prompt_tokens / completion_tokens / total_tokens / cache_hit_tokens`。

- **视频分镜**
  - QQ `video/mp4` 入站不下载整段视频，只记录 URL/ID 并先回 `[视频处理中...]`；
  - 模型可用 `[[video_storyboard: v1]]` 请求分镜；
  - 本地适配 `dsh-video-storyboard` CLI，输出一张 PNG 作为多模态附件；
  - 20 秒超时/失败回 `[视频解析失败，请稍后再试]`。

- **记忆查看器**
  - DSH 侧栏查看 dsh-pet 对话；
  - 最近 10 条 + 加载更早；
  - 图片缩略图按需加载。

---

## 目录结构

```text
pink-diary-pet/
├─ src/
│  ├─ dsh-pet-host/              # dsh-pet 0.3.8 的最终修改版
│  │  ├─ index.js
│  │  ├─ client.js
│  │  ├─ config.js               # 路径/owner 配置读取
│  │  └─ runtime/electron-helper/
│  ├─ qqbot/                     # dsh-qqbot 0.5.2 的最终修改版
│  │  ├─ gateway/
│  │  └─ pet-bridge/
│  ├─ plugins/
│  │  ├─ pink-diary/             # DSH 粉色日记插件
│  │  └─ memory-viewer/          # DSH 记忆查看器插件
│  └─ shared/
├─ config/
│  ├─ config.example.yml
│  └─ identity.example.json
├─ scripts/
│  ├─ install.mjs                # 部署到 DSH profile
│  └─ verify.mjs                 # 隐私/语法检查
├─ tests/fixtures/               # 仅脱敏示例
├─ assets/                       # 不放模型，仅说明
├─ README.md
├─ LICENSE
├─ NOTICE
└─ .gitignore
```

`src/dsh-pet-host/` 与 `src/qqbot/` 是**最终代码**，不是 patch 文件。  
`scripts/install.mjs` 只负责把这些文件复制到 DSH profile，不再维护零散补丁。

---

## 快速开始

### 1. 环境准备

- **Node.js >= 22.12.0**
  - dsh-pet 0.3.8 要求 Node >= 22.12；
  - qqbot 0.5.2 要求 Node >= 20.3，实际以 22.12 为准。
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
npm install
```

根目录只安装部署脚本所需的 `js-yaml`。`dsh-pet`、`dsh-qqbot`、`sharp` 由 DSH profile 提供。

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
  pictureDir: "~/.dsh/dsh-pet/pictures"
  memoryDir: "~/.dsh/dsh-pet"

profile:
  name: "desktop"
```

或使用 `.env`：

```env
QQBOT_APP_ID=你的 AppID
QQBOT_APP_SECRET=你的 AppSecret
OWNER_OPENIDS=你的 openid
PINK_DIARY_DIR=~/.dsh/pink-diary
PINK_PICTURE_DIR=~/.dsh/dsh-pet/pictures
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
- 生成 `~/.dsh/dsh-pet/pink-diary-pet.json`；
- 创建日记/图片目录；
- 复制最终 host / qqbot / 两个插件到 profile；
- 如果 `~/.dsh/dsh-pet/identity.json` 不存在，生成空 owner 的示例身份文件。

也可以先 dry-run：

```bash
node scripts/install.mjs --profile desktop --dry-run
```

### 6. 配置 QQ 凭证

`config.yml` / `.env` 中的 AppID/AppSecret 不会自动写入 DSH 的插件配置。  
请在 DSH Desktop 的 QQ 插件配置中填入同样的值，或按 DSH 插件配置文档编辑 profile 的 `cordis.patch.yml`。

> 不要把带真实 AppSecret 的 `cordis.patch.yml` 提交到 Git。

### 7. 启动

重启 DSH Desktop，或重载 dsh-pet/qqbot 插件。

默认目录：

```text
~/.dsh/pink-diary              # 日记
~/.dsh/dsh-pet/pictures        # 图片
~/.dsh/dsh-pet/memory.json     # 主人本地记忆
~/.dsh/dsh-pet/identity.json   # 身份层
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
  window: 1000000
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

更换模型时只改 `window`，不需要改代码。

### 结构化记忆实验分支

`feature/structured-memory-blocks` 分支额外实现：

- scope 隔离的 block ledger（`context-blocks.json`）；
- 后台结构化摘要，不阻塞当前回复；
- `search_old_memory` / `decompress_old_memory` 工具模块；
- CJK/BM25 + fuzzy 检索；
- 默认关闭，配置：
  ```yaml
  memoryBlocks:
    enabled: false
    file: "~/.dsh/dsh-pet/context-blocks.json"
  ```
- 详细设计与测试范围见 [docs/structured-memory-experiment.md](docs/structured-memory-experiment.md)。

该实验分支不改变稳定版同步摘要路径，也不会在未安装该分支时生效。

### 身份层

```text
~/.dsh/dsh-pet/identity.json
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

`src/dsh-pet-host/config.js` 读取：

1. 环境变量 `PINK_DIARY_DIR` / `PINK_PICTURE_DIR`；
2. `~/.dsh/dsh-pet/pink-diary-pet.json`；
3. 默认值。

默认：

```text
~/.dsh/pink-diary
~/.dsh/dsh-pet/pictures
```

### 用户记忆

```text
~/.dsh/dsh-pet/user-memory.json        # 私聊
~/.dsh/dsh-pet/user-group-memory.json  # 群聊公开历史
~/.dsh/dsh-pet/user-profiles.json      # 公开 profile
```

群聊路径只读 `user-profiles.json`，不会读取 `user-memory.json`。

---

## 安全提示

1. **AppSecret 绝不提交**  
   `config/config.yml`、`.env`、profile 的 `cordis.patch.yml` 都可能含真实凭证。

2. **不要提交真实记忆**  
   `memory.json`、`identity.json`、`user-*.json`、`pet-qq-memory.json` 都属于隐私数据。

3. **不要提交真实日记/图片**  
   `~/.dsh/pink-diary`、`~/.dsh/dsh-pet/pictures` 以及任何私人绝对路径目录都不要放进仓库。

4. **不要提交真实 openid**  
   文档、测试、示例统一使用 `<OWNER_OPENID>` / `00000000000000000000000000000000`。

5. **模型版权单独处理**  
   Live2D 模型不在 MIT 范围内，详见 [assets/README.md](assets/README.md)。

---

## 依赖版本

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | >= 22.12.0 | dsh-pet 运行时要求 |
| dsh-pet | 0.3.8 | 桌宠 host，MIT |
| @tencent-connect/dsh-qqbot | 0.5.2 | QQ Bot 接入，MIT |
| @tencent-connect/qqbot-nodejs | 1.0.5 | QQ SDK，MIT |
| sharp | 0.35.5 | 图片压缩（由 profile 安装） |
| js-yaml | ^4.1.0 | 安装脚本读取配置 |
| Electron | DSH Desktop 提供 | 不重复安装 |

`npm install` 只安装根目录的 `js-yaml`。完整运行时依赖由 DSH profile 的 `node_modules` 提供。

---

## 开发与验证

```bash
npm run verify
```

检查：

- 是否残留真实 openid / 本地绝对路径；
- JS/JSON 语法；
- 是否误提交 `.tmp`、`backup`、patch 快照。

---

## 版权与许可

- **代码**：MIT，见 [LICENSE](LICENSE)。
- **上游修改**：基于 `dsh-pet 0.3.8`（Copyright © 2026 PC2005-cloud）和 `@tencent-connect/dsh-qqbot 0.5.2`（Copyright © 2026 Tencent Connect），二者均为 MIT；见 [NOTICE](NOTICE)。
- **Live2D 模型**：原私有配置使用 Steam 创意工坊 **RelySeven** 的作品，不可商用，不随本仓库分发。
- **本仓库只开源代码逻辑**，不包含模型、真实记忆、日记、图片或用户数据。

---

## 免责声明

本项目涉及 QQ 官方 Bot、第三方模型和本地 AI 服务。请遵守 QQ 开放平台条款、模型作者授权以及所在地法律法规。因使用本项目产生的账号、数据或版权问题由使用者自行承担。
