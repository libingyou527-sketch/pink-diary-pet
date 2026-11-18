# PROJECT_STATUS.md

> 项目：粉发桌宠「絮」· DSH Pet / QQ Bot / GPT-SoVITS
> 快照时间：2026-11-18 16:40（Asia/Shanghai）
> 工作区：`%USERPROFILE%\Documents\deepseek-harness\default-workspace`
> 项目根目录：`%USERPROFILE%\Documents\deepseek-harness\default-workspace\pink-diary-pet`

## 0. 重大变更（2026-11-18）：语音管线换心

```text
旧：ChatTTS(9966) + RVC(4892) + ffmpeg 切句/拼接
新：GPT-SoVITS v2ProPlus(9880) 单次 /tts
```

- ChatTTS / RVC **进程已停用**，目录原地保留（未删、未移、未备份）。
- `dsh-pet` 已移除 ChatTTS 自动拉起逻辑（`ensureChatTtsStarted` 调用与 import）。
- 旧切句 / 拼接 / RVC 变声代码在 QQ 侧已删除，改为纯文本直连 `/tts`。
- `[表情:xxx]` 与 `[语音]` 剥离逻辑保留（QQ 侧 `stripSpeechTags`，插件侧 `stripSpeakTags`）。
- 动态端口探测保留：QQ 侧改为探测 GPT-SoVITS 的 `/tts` 路由（`resolveGsvBase`）。


---

## 1. 核心架构

### 1.1 云边联动

```text
DSH Web / Desktop（云端模型侧）
  └─ dsh-pet 插件（本地 Host）
       ├─ 组装 System Prompt（静态）
       ├─ 组装当前 User 消息（动态：日记、权限、当前时间、本回合表情列表）
       ├─ 调用 deepseek-account / deepseek-flash
       ├─ 读写 memory.json
       ├─ 本地表情包 / 图片 / 视频
       └─ 本地 TTS → GPT-SoVITS 9880/tts

QQ 侧
  └─ @tencent-connect/dsh-qqbot
       ├─ QQ 收消息 → pet-bridge → dsh-pet
       ├─ dsh-pet 生成回复 → send_to_qq
       ├─ 文字 / 表情图发送
       └─ [语音] 标签 → GPT-SoVITS 9880/tts → bot.sendVoice
```

原则：

- **System Prompt 只放静态内容**。
- **动态内容只放当前 User 消息尾部**：时间、可用表情包列表、权限、日记、公开资料等。
- 历史消息一旦写入，不在运行时改写；历史时间前缀只用于检索/判断。
- TTS 不交给模型“调用工具”，而是由模型输出 `[语音]` 标签，后端物理拦截后生成。

### 1.2 当前模型配置

`cordis.patch.yml`：

```yaml
provider: deepseek-account
model: deepseek-flash
reasoningEffort: high
```

---

## 2. 当前运行服务与端口

### 已确认运行

```text
DSH Web
  http://127.0.0.1:50312
  PID 3052

GPT-SoVITS v2ProPlus（当前语音后端）
  http://127.0.0.1:9880
  整合包：D:\tools\GPT-SoVITS\GPT-SoVITS-V2ProPlus-Windows-main
  conda 环境：D:\tools\miniconda3\envs\GPT（py3.10.20 / torch 2.9.1+cu126 / cuda 可用）
  启动：cd 整合包目录 && D:\tools\miniconda3\envs\GPT\python.exe api_v2.py -a 127.0.0.1 -p 9880
  日志：api-server.log

旧服务（已停用，目录原地保留）
  ChatTTS  9966  ❌ 不再启动
  RVC      4892  ❌ 不再启动
```

### 语音配置（GPT-SoVITS）

```text
配置文件：%USERPROFILE%\.dsh\tts-gsv\settings.json
参考音频：D:\tools\GPT-SoVITS\GPT-SoVITS-V2ProPlus-Windows-main\refs\cyrene_ref.wav
          （4.07s，48k mono，原库「昔涟」目录，音码 223ef624e4c9438d，干声：尾音 40ms / 噪声底 -72dB）
prompt_text：好好的，睡了一觉，现在一定活力满满了吧，伙伴。
采样：speed 1.0 / temp 1.0 / top_p 0.95 / top_k 20 / rep 1.35 / seed -1
说话权重：SoVITS_weights_v2ProPlus\CyreneV3.7_e16_s1392.pth
          GPT_weights_v2ProPlus\CyreneV3.7-e25.ckpt
```

实测（RTX 4060 Laptop，fp16）：

```text
4.36s 音频 ≈ 2.4-3.1s 合成耗时（RTF≈0.6，快于实时）
首次调用约 20-30s（含 sv 模型与 CUDA 预热）
```

### ⚠️ SoVITS 权重文件头不是损坏，是版本标记

`CyreneV3.7_e16_s1392.pth` 前 2 字节为 `b"06"`，对应 `head2version`：

```text
b"06" -> ["v2", "v2ProPlus", False]
```

`load_sovits_new()` 会把它替换回 `b"PK"` 再当 zip 读。
**切勿把前 2 字节改成 "PK"**——那样会被判定为 v2，`sv_emb` 不加载，音色直接错。


---

## 3. 核心文件路径

### 3.1 项目源码

```text
pink-diary-pet/
  src/
    dsh-pet-host/
      index.js          # 主 Host：Prompt、聊天、memory、表情/语音/工具
      client.js         # 本地桌宠前端（含语音播放、状态）
      chattts-start.js  # ChatTTS 静默自动启动
      config.js
      memory-blocks.js
      memory-context.js
      memory-summary.js
      memory-tools.js
      video-storyboard.js
    qqbot/
      gateway/bootstrap.js       # QQ 发送、语音、时间戳清洗
      pet-bridge/server.js       # dsh-pet ↔ QQ bridge
      pet-bridge/memory.js       # QQ 历史（严格累加）
    plugins/
      memory-viewer/client.js    # 记忆查看器 UI（虚拟列表重构）
      pink-diary/
  assets/
    emojis/                      # 101 张原始表情
    emojis_compressed/           # 101 张 WebP
    emojis_meta.json             # 101 条描述
  tools/
    dsh-plugin-tts-index.chattts.mjs # TTS 插件补丁备份
```

### 3.2 Live 运行文件

```text
%USERPROFILE%\.dsh\profiles\desktop\node_modules\
  dsh-xilian-core\           → Junction 指向 packages/core（我们 fork 的插件）
    lib\boot.js               启动探针
    lib\index.js              宿主大脑（真源在 packages/core）
    lib\client.js             浏览器前端
    runtime\electron-helper\ 桌面窗口
  @tencent-connect\dsh-qqbot\dist\gateway\bootstrap.js   （我们改过）
  @tencent-connect\dsh-qqbot\dist\pet-bridge\server.js

已停用（仍在磁盘，仅作回退）
  dsh-pet\                    官方包，已从 bundles 与 dependencies 移除
  @memef1f1y\dsh-plugin-tts\ 第三方 TTS，语音已并入 core
```

### 3.3 数据文件

```text
%USERPROFILE%\.dsh\dsh-pet\memory.json
%USERPROFILE%\.dsh\dsh-pet\user-memory.json
%USERPROFILE%\.dsh\dsh-pet\user-group-memory.json
%USERPROFILE%\.dsh\qqbot\pet-qq-memory.json
%USERPROFILE%\.dsh\tts-rvc\settings.json
%USERPROFILE%\.dsh\tts-rvc\diag-recent.json
%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml
```

当前数据量（快照）：

```text
memory.json          908 条
pet-qq-memory.json   984 条
emojis_meta.json     101 条
```

### 3.4 备份

```text
%USERPROFILE%\.dsh\dsh-pet\memory.json.bak-before-invalid-tags-2026-11-14T18-34-59-270Z
%USERPROFILE%\.dsh\qqbot\pet-qq-memory.json.bak-before-invalid-tags-2026-11-14T18-34-59-270Z
```

更早的时间前缀迁移备份：

```text
memory.json.bak-before-time-2026-11-11T06-43-40-315Z
user-memory.json.bak-before-time-2026-11-11T06-43-40-315Z
user-group-memory.json.bak-before-time-2026-11-11T06-43-40-315Z
```

---

## 4. System Prompt 最终版本

静态常量位置：

```text
src/dsh-pet-host/index.js
const BEHAVIOR_FORMAT_RULES
```

当前完整静态文本：

```text
【行为与格式绝对准则】
1. 你拥有一个专属表情包库。使用表情包时，格式必须严格为 [表情:文件名]，文件名必须严格从【本回合可用表情包列表】中选取，每次最多选 1 个，没有合适的绝对不要强行发。
2. 必须选用标点符号（如 ~、！、？、...... 等）和 [表情:文件名] 中任一或任二来代替括号里的动作和心理描写。
3. 至于可爱的“♪”，絮想用的时候就可以自然用出来哦。
4. 当主人明确要求你使用语音（比如“发语音”、“想听你的声音”等）时，请在句末加上 [语音] 标签。

【时间逻辑与常识推理】
你的历史记录带有绝对时间戳，当前时间已知，但请把这些时间当做你的“潜意识背景常识”，不要刻意去计算或频繁报时。请利用时间差进行常识判断：
1. 如果上一句主人说要去进行某种耗时的事件（如睡觉、洗澡、吃饭），而当前时间距离上一句仅仅过去了几分钟，你应该意识到他只是短暂离开。当根据时间常识意识到不合理时，你必须结合常识拆穿他（例如：才去了几十秒就回来啦，是不是根本没洗~）。
2. 如果对话之间间隔极短，就当做连续聊天自然接话；如果间隔较长，可以视情况自然地顺延话题。
```

拼接位置：

```js
const staticBase =
  petChatStatic(found) +
  identitySuffix() +
  voiceCapability +
  (memoryBlockStore ? "\n\n" + buildMemoryToolPrompt() : "") +
  BEHAVIOR_FORMAT_RULES;
```

要求：

- 这段必须是纯静态字符串；
- 不含 `${}`；
- 不含时间戳；
- 不含表情列表；
- 时间与列表只能出现在 User 末尾。

---

## 5. User 消息尾部

### 5.1 当前顺序

```text
原始 User 文本
→ 日记 / 权限等动态内容
→ [当前系统时间：YYYY-MM-DD HH:MM:SS]
→ 【本回合可用表情包列表】
```

实现：

```text
chatTail(now, emojiText)
emojiInstruction()
timedText = text + chatTail(new Date(), emojiInstruction());
```

`chatTail` 只负责：

```text
[当前系统时间：...]
+ 本回合表情包列表
```

格式/时间/语音规则已全部移到 System Prompt。

### 5.2 表情包列表

- 101 条全量；
- 按分类分组；
- 格式 `文件名: 描述`；
- 不含 Top 10；
- 只做 User 尾部注入，不入 System。

### 5.3 时间前缀

历史消息写入格式：

```text
[MM-DD HH:MM:SS] 原文
```

已对存量数据做过一次全量迁移；迁移后历史只追加，不运行中改写。

---

## 6. 语音管线（GPT-SoVITS v2ProPlus）

### 6.1 调用契约

```text
POST http://127.0.0.1:9880/tts   {json}
→ wav 字节（media_type=wav, streaming_mode=false）
```

请求体（两个调用方一致）：

```json
{
  "text": "纯文本（已剥离标签）",
  "text_lang": "zh",
  "ref_audio_path": "D:\\tools\\GPT-SoVITS\\GPT-SoVITS-V2ProPlus-Windows-main\\refs\\cyrene_ref.wav",
  "prompt_lang": "zh",
  "prompt_text": "好好的，睡了一觉，现在一定活力满满了吧，伙伴。",
  "text_split_method": "cut5",
  "media_type": "wav",
  "streaming_mode": false,
  "speed_factor": 1.0,
  "top_k": 20,
  "top_p": 0.95,
  "temperature": 1.0,
  "repetition_penalty": 1.35,
  "seed": -1
}
```

### 6.2 两个调用方

```text
QQ 语音
  src/qqbot/gateway/bootstrap.js
  synthesizePetVoice()
    → readGsvSettings()           读 ~/.dsh/tts-gsv/settings.json
    → stripSpeechTags()           剥 [表情:xxx] / [语音]
    → resolveGsvBase()            动态探测 /tts 路由并缓存
    → POST /tts                   → 写临时 wav → bot.sendVoice

本地桌宠
  src/dsh-pet-host/client.js
  playReplyVoice()
    → POST /dsh-tts-api/speak { provider: "gptsovits", custom: GSV_VOICE }
    → 插件 provider 'gptsovits' → 同一个 /tts
    → /dsh-tts-audio/<id> 返回给前端播放
```

### 6.3 标签剥离（唯一保留的文本处理）

```js
// gateway
.replace(/\[表情[:：][^\]]*\]/g, " ")
.replace(/\[语音\]/g, " ")
.replace(/\s+/g, " ")
.trim()
```

插件侧 `stripSpeakTags()` 同规则。剥离后为空 → 不合成、回退文字。

### 6.4 版本判定（关键，别踩）

```text
pth 前 2 字节 b"06" → head2version → ["v2", "v2ProPlus", False]
load_sovits_new() 会把它替换成 b"PK" 再按 zip 读
```

- 把前 2 字节改成 `PK` 会判定为 v2 → `sv_emb/ge_to512/prelu` 变 unexpected_keys → **音色错**。
- 校验方法：启动日志里 `_IncompatibleKeys` 的 `unexpected_keys` 必须为空。

### 6.5 已彻底删除的旧逻辑

```text
切句（。！？、\n 二次切分 / 30 字硬切 / 6 字合并）
句子间静音插入、ffmpeg 拼接、dynaudnorm、fade in/out
RVC 转换队列、15s 切片、尾静音裁剪、f0UpKey、rmvpe
ChatTTS 参数（voice/custom_voice/prompt/speed/temperature/top_p/top_k）
ChatTTS 并发队列与临时分片
dsh-pet 的 ChatTTS 自动拉起（ensureChatTtsStarted）
```

### 6.6 服务启动

```powershell
cd 'D:\tools\GPT-SoVITS\GPT-SoVITS-V2ProPlus-Windows-main'
& 'D:\tools\miniconda3\envs\GPT\python.exe' api_v2.py -a 127.0.0.1 -p 9880
```

- 启动时按 `GPT_SoVITS/configs/tts_infer.yaml` 的 `custom` 段加载权重
- 依赖 conda 环境 `GPT`（py3.10.20 / torch 2.9.1+cu126）
- 换权重：改 yaml 的 custom 段，或运行时 `GET /set_sovits_weights?path=` + `GET /set_gpt_weights?path=`

### 6.6.1 调参结论（2026-11-18，实测）

```text
参考音频决定三件事，比重远大于采样参数：
  - 停顿密度（ref3 一句带 2.87s 内部静音，dry2 只有 0.75s）
  - f0 抖动（ref3 1.10，dry2 0.75，caf8c7aa 1.10）
  - 语速观感

temperature 与稳定性是反直觉关系（同参考、speed 1.15）：
  temp 0.7 / top_k 12  → f0_std 2.84 ± 0.59   （很飘，方差大）
  temp 1.0 / top_k 12  → f0_std 2.33 ± 0.13
  temp 1.0 / top_k 20  → f0_std 2.07 ± 0.07   （最稳）
  降温度不会更稳，反而更飘。

speed_factor 控制的是"每个字"而不是停顿：
  speed 1.15 → 4.77s，有声 2.57s，静音 805ms，8.97 字/秒
  speed 1.00 → 5.94s，有声 3.10s，静音 1195ms，7.43 字/秒
  speed 0.90 → 5.94s，有声 3.30s，静音 945ms，6.97 字/秒
  speed 0.80 → 6.60s，有声 3.73s，静音 1005ms，6.17 字/秒
  降 speed 拉长有声时长，静音基本不变 → 真·放慢，不是多停顿。

后处理无法消除韵律抖动（f0 波动只能在重合成层改，会出电音）；
高频倾斜只能压"空气感"，与抖动无关。
```

### 6.7 与旧实现的性能对比

```text
旧（ChatTTS+RVC）：多段切句 → 并发合成 → 拼接 → RVC 逐段转换 → 再拼接
新（GPT-SoVITS）：一次请求内部切句，直接返回整段 wav
实测 23 字短句 ≈ 5.0-5.7s 音频 / 2.1-2.8s 合成；45 字长句 ≈ 11.2-11.5s / 3.9-4.8s 合成
```

### 6.8 废弃服务不会被自动拉起（2026-11-18 已验证）

承诺：**重启电脑 / 重启 DSH 后，ChatTTS(9966) 与 RVC(4892) 绝不会自动启动。**

逐项排查结果：

```text
1. dsh-pet/lib/chattts-start.js         已删除（唯一会 spawn ChatTTS 的文件）
   工作区同名文件                        已删除
2. dsh-pet/lib/index.js                 import 与 ensureChatTtsStarted() 调用均已移除
   全 node_modules 搜索 chattts-start   0 引用
3. TTS 插件 spawn/exec 拉起 RVC/ChatTTS  无（只做 HTTP 请求，从不启动进程）
4. Windows 注册表 Run（HKCU/HKLM）       无相关项
5. 启动文件夹（用户 + 公共）              空
6. 计划任务 schtasks                     无相关任务
7. 旧工具目录启动脚本
   D:\tools\ChatTTS                        无 .bat/.ps1/.cmd/.lnk/.vbs
   D:\tools\RVC20260723Nvidia\...          同上
8. 进程实测                             9966 / 4892 均未监听
```

补充说明：

- RVC 从来就没有自动拉起的代码，只有手动启动脚本（见 §2 历史记录）。
- 插件里仍残留 RVC / ChatTTS 的**调用代码**（provider `rvc`、诊断页检测项），但它们只发 HTTP
  请求，服务不在时直接报错，**不会启动任何进程**。若将来要彻底清掉，属于额外清理，不影响本承诺。
- `~/.dsh/tts-rvc/settings.json` 只是配置残留（默认 baseUrl 指向 4892），不参与启动。

## 7. QQ 发送流程

### 7.1 语音发送

模型输出 `[语音]`：

```text
Host 剥离标签 → voice: true
→ send_to_qq 携带 voice
→ PetBridge
→ gateway sendReply(target, text, emojiPath, voice)
```

`voice === true`：

- 调 GPT-SoVITS `/tts`（见 §6）；
- 成功：群聊只发语音，私聊语音 + 表情图；
- 失败/超时：文字兜底。

`voice === false`：

- 直接文字 + 表情图；
- 不请求 TTS。

### 7.2 时间戳物理清洗

QQ gateway 新增：

```js
function stripQqTimestamp(value) {
    return String(value ?? "")
        .replace(/\[\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]\s*/g, "")
        .trim();
}
```

应用：

- `sendReply` 发送前；
- `onSent` 写 QQ memory 前。

避免模型把历史时间戳当代词念出来。

### 7.3 端口说明（已不再依赖 ttsApiUrl）

旧版 QQ 语音打 DSH 的 `/dsh-tts-api/speak`，需要 `ttsApiUrl` 跟随 DSH 端口变化，是个长期坑。

换心后：

```text
QQ 语音 → GPT-SoVITS 9880/tts（直连，不经过 DSH）
本地桌宠 → DSH 插件 /dsh-tts-api/speak?provider=gptsovits → 同一 9880/tts
```

`cordis.patch.yml` 里的 `ttsApiUrl` 已改成注释说明的提示值，**不参与语音链路**。
`resolveGsvBase()` 会动态探测 `/tts` 路由，端口变了也能自动找到。

---

## 8. 最近修改难点与结论

### 8.1 Prompt 架构拆分

难点：

- `chatTail` 在顶层，`emojiInstruction` 在 `apply` 内部；
- 最初直接调用导致 `emojiInstruction is not defined`；
- 已改成显式传参：

```js
chatTail(new Date(), emojiInstruction())
```

### 8.2 长文本 TTS 防抖误伤

现象：

```text
ChatTTS 全部短句生成失败
chunk 4/4
```

原因：

- 长文本 chunk 路径每个 chunk 调 `synthesizeRvc`；
- 每次调用都 abort 上一个 chunk。

修复：

```js
synthesizeRvc(..., { debounce: false })
```

### 8.3 QQ 只处理单 URL

现象：

```text
长语音返回 jobId + chunks
→ synthesizePetVoice 只接受 data.url
→ 返回 null
→ 文字兜底
```

修复：

```text
QQ 请求 forceSingle: true
```

### 8.4 尾音被吞

原因：

- 每个 RVC 小段都加 fade out；
- 分片 `loudnorm` 可能压低最后一句。

修复：

- RVC 分段只裁尾部静音，不加 fade；
- 最终整段只做一次 50ms fade；
- 分片只统一格式；
- 拼接后 `dynaudnorm`。

### 8.5 错误表情标签

历史里出现过：

```text
[sleep sleepy粉发]
[cry cry粉发]
```

原因：

- 早期模型自己生成错误标签；
- 被写入 memory / QQ history；
- 用户引用后形成自模仿。

已清理存量标签，并保留备份。

---

## 9. 记忆查看器 UI

文件：

```text
src/plugins/memory-viewer/client.js
```

已重构：

- 自研可变高度虚拟列表；
- 只渲染可视区 + overscan；
- 图片/表情 IntersectionObserver 懒加载；
- 左右气泡、头像；
- 跨天分割线；
- 同一天间隔 >2h 小时间戳；
- `[表情:xxx]` 渲染 WebP；
- 历史音频字段存在时渲染 `<audio controls>`；
- 纯图片空文本显示 `[图片]`；
- 非法数字表情标签原样回退。

注意：这是前端插件，需要刷新 DSH 页面或重启 Web 才会加载新 bundle。

---

## 10. 已知问题 / 下一步

### 立即要做

1. **重启 DSH**，让 gateway / 插件 / 桌宠前端三处改动生效（都是 Host 侧加载，必须重启）。
2. QQ 实机测试：
   - 普通文字；
   - `[语音]` 短语音（确认走 9880，音色是昔涟）；
   - 长句语音（10s 以上，确认不会被切成 edge-tts）。
3. 本地桌宠语音测试（聊天里触发语音，确认 `/dsh-tts-api/speak` 的 `provider: gptsovits` 生效）。

### 后续计划

- 听感调参：`speed_factor`、`top_k/top_p/temperature`、`prompt_text` 精修；
- 参考音频可换更多候选（库里「昔涟」有 1740 条，已筛出 3-4.8s 高分样本）；
- 评估 `aux_ref_audio_paths`（多参考音频）提升稳定性；
- 若首句延迟仍高，考虑 `streaming_mode: true` 做边播边合成。

### 不要做

- 不要把动态时间/表情列表放回 System Prompt；
- 不要在运行时改写已写入历史；
- **不要**把 SoVITS 权重前 2 字节改成 `PK`（版本标记，见 §6.4）；
- 不要重新引入 ChatTTS / RVC 到语音链路；
- **不要重新加回 `chattts-start.js` 或 `ensureChatTtsStarted`**（已删除，见 §6.8）；
- 不要重新启用旧的标点替换 `preprocessForChatTTS`；
- 不要在旧目录里创建备份副本（红线：不备份、不移动）。

---

## 11. 新窗口恢复步骤

新窗口第一句话建议直接发：

```text
请先读取 %USERPROFILE%\Documents\deepseek-harness\default-workspace\PROJECT_STATUS.md，
按里面的现状继续项目；先检查 GPT-SoVITS 9880 是否在线，再决定下一步。
```

新窗口应优先确认：

```text
1. GPT-SoVITS 9880 是否在线（GET /tts 返回 405/400 即为活着）
2. 启动日志里 unexpected_keys 是否为空（sv_emb 是否加载）
3. 参考音频 refs\cyrene_ref.wav 是否存在
4. ~/.dsh/tts-gsv/settings.json 是否指向正确路径
5. 旧服务 ChatTTS 9966 / RVC 4892 应当**不在监听**（已废弃）
```

启动 GPT-SoVITS：

```powershell
cd 'D:\tools\GPT-SoVITS\GPT-SoVITS-V2ProPlus-Windows-main'
& 'D:\tools\miniconda3\envs\GPT\python.exe' api_v2.py -a 127.0.0.1 -p 9880
```

---

## 12. 关键 Hash 快照

> 自 2026-11-18 fork 之后，`src/` 不再是部署源，**真源是 `packages/core/`**（profile 通过 junction 指向它）。

```text
core lib/index.js    BF3672745D   宿主大脑（真源 packages/core/lib/index.js）
core lib/boot.js     AF560D0A95   启动探针（日志 ~/.dsh/xilian-boot.log）
core lib/client.js   F41EE5C289   浏览器前端
qqbot gateway        B5312A4555   （源码另存 src/qqbot/gateway）
qqbot pet-bridge     BEE8D3BE50
TTS 插件             已停用（语音并入 core，不再参与链路）
```

校验方式：`packages/core` 与 profile 里的 junction 天然同源，改完即生效；
只需确认 junction 未断：

```powershell
Get-Item "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-xilian-core" | Select-Object LinkType,Target
```

与上游的差异请用 `node scripts/upstream-diff.mjs <版本>`，见 `docs/Upstream-Log.md`。

## 13. 备注

- 本项目已多次进行 Prompt 重构，**System 静态、User 动态** 是硬约束。
- 语音链路是“物理管线”，不要依赖模型决定停顿/音量。
- TTS 现在只有一次 HTTP：`POST 9880/tts`，没有中间 ffmpeg 拼接。
- 所有 TTS 临时中间文件在 `finally` 中清理；最终播放文件保留给 `/dsh-tts-audio`。
- GPT-SoVITS 是本地服务，**重启电脑后需要手动启动**（conda 环境 `GPT`）；没有任何自动拉起。
- 红线：旧工具目录（ChatTTS / RVC / 旧 GPT-SoVITS-beta）原地保留，不删、不移、不备份、不复制。

---

## 14. 2026-11-18 18:20 · 自研内核落地（fork dsh-pet）

```text
包位置      %USERPROFILE%\Documents\deepseek-harness\default-workspace\pink-diary-pet\packages\core
包名        dsh-xilian-core 0.1.0（fork 自 dsh-pet 0.3.8）
部署产物    ~/.dsh/profiles/desktop/node_modules/dsh-xilian-core（79.5MB）
插件 id     dsh-xilian-core（cordis.patch.yml）
路由前缀    仍为 /dsh-pet-7340（刻意不改，降低风险）
数据目录    仍为 ~/.dsh/dsh-pet/（共用，回退零迁移）
profile     bundles 已用 dsh-xilian-core 替换 dsh-pet；dsh-pet 依赖保留可回退
git         分支 refactor/xilian-core，提交 d7bdfde
```

**前端归属**：`lib/client.js` 现在物理位于我们的包内（`exports["./client"]` + `dsh.client.platform=web`）。
官方 dsh-pet 从此不再被加载，官方发版也碰不到我们。

**回退**：profile 的 `dsh.profile.bundles` 把 `dsh-xilian-core` 换回 `dsh-pet` → 重启。

---

## 15. 2026-11-18 18:35 · 自研内核上线成功（含三次失败复盘）

### 15.1 当前形态

```text
插件        dsh-xilian-core 0.1.0（fork 自 dsh-pet 0.3.8）
包源        pink-diary-pet/packages/core
安装形态    profile/node_modules/dsh-xilian-core 是 Junction → packages/core
入口        lib/index.js（自诊断包装器）→ lib/index.impl.js（真实实现）
路由前缀    /dsh-pet-7340（未改）
数据目录    ~/.dsh/dsh-pet/（与官方共用，回退零迁移）
官方包      dsh-pet 已从 profile 依赖移除（回退需重新加回 + pnpm install）
```

验证记录（重启后实测）：

```text
启动日志   services probe: webServer/agentDefaultModel/credentials/llm/
           attachments/commands/connection 全部 ok；apply ok
路由       GET  /dsh-pet-7340/config   → 200（8541 字节）
聊天       POST /dsh-pet-7340/chat?pet=main&surface=desktop
           → ok=true，返回文本 + 表情（表情路径来自 packages/core/assets）
语音       POST /dsh-tts-api/speak（provider=gptsovits）→ 200，返回音频 url
桌宠       electron helper 4 进程，first-frame +23ms
```

### 15.2 三次失败及根因（重要，避免重踩）

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | 启动弹窗 `web boot: 1 entry did not activate` | `lib/client.js` 末尾硬编码 `__ModuleLoader__.load({ id: "dsh-pet" })`，与官方 bundle 撞名 | 改为 `id: "dsh-xilian-core"` |
| 2 | 无弹窗，插件静默不激活 | ① `ws` / `@electron/get` 从未声明为依赖（靠 profile 提升或 dsh-pet 的依赖）；② 包是 Junction，ESM 按 **realpath** 解析，找不到 profile 的 node_modules | 显式声明依赖并在包内 `pnpm install`（`packages/core/node_modules`） |
| 3 | 同上 | pnpm 自动装了 `@deepseek-ai/*` 全套 + cordis，会与**宿主注入**的副本冲突（官方 dsh-pet 就是这个机制，profile 里根本没有 `@deepseek-ai` 目录） | 删本地 peer 副本，`.npmrc` 设 `auto-install-peers=false` |

关键经验：

```text
- DSH 只报 web bundle 的错，宿主侧 import 失败是静默的
  → 已加自诊断入口 lib/index.js，写 ~/.dsh/xilian-boot.log
- 依赖必须落在"真实路径"的可解析范围内（Junction 会按 realpath 解析）
- @deepseek-ai/* 由宿主注入，不要在包内安装
```

### 15.3 顺手修复的两处连带损坏

```text
1. scripts/install.mjs 会整份重写 ~/.dsh/dsh-pet/pink-diary-pet.json
   → 日记目录/图片目录/ownerOpenIds/memoryBlocksEnabled/videoStoryboard* 被抹掉
   已改为「合并写入」（--force-config 才重置）
2. pnpm install 把不在依赖树里的 dsh-video-storyboard 挪进 .ignored
   → 已移回 node_modules/dsh-video-storyboard（视频分镜依赖它）
```

### 15.4 回退方法

```text
1. profile/package.json：
   dependencies 加回 "dsh-pet": "0.3.8"
   dsh.profile.bundles 里把 dsh-xilian-core 换回 dsh-pet
2. 在 profile 目录执行 pnpm install
3. 重启 DSH
```

---

## 16. 2026-11-18 18:43 · F3.5 完成：TTS 并入 core

### 16.1 变更

```text
dsh-xilian-core 新增两条路由（从 @memef1f1y/dsh-plugin-tts 收回）
  POST /dsh-tts-api/speak   { text, provider, custom } -> { url }
  GET  /dsh-tts-audio/<id>  返回 wav（保留最近 80 个）
音频落盘  ~/.dsh/xilian-tts/<id>.wav
配置来源  ~/.dsh/tts-gsv/settings.json（调用方 custom 可覆盖）
标签处理  [表情:xxx] / [语音] 在合成前剥离
容错      路由注册包在 try/catch，失败只降级语音，不影响插件整体
```

`@memef1f1y/dsh-plugin-tts` 已从 profile bundles 移除（ChatTTS / RVC / Edge provider 不再加载）。
回退：把它加回 bundles 即可。

### 16.2 验收（重启后实测）

```text
启动日志      services probe 七项全 ok、apply ok
GET  /dsh-tts-api/speak        -> 405   （core 的处理器；旧插件是 400）
POST /dsh-tts-api/speak        -> 200   {"url":"/dsh-tts-audio/amwlzsm14wfq29o"}
音频           200 / 243.8 KB / 3.90s @ 32kHz，落在 ~/.dsh/xilian-tts/
聊天           POST /dsh-pet-7340/chat -> ok=true，文本+表情正常
桌宠           electron 4 进程
QQ 桥          pet-bridge.json pid=22408（与 DSH 同进程）
```

### 16.3 F3.6 暂缓（有意为之）

记忆/日记的路由仍留在 `dsh-pet-memory-viewer` 与 `xu-pink-diary` 两个 UI 插件里。原因：

```text
- 宿主半边只有 2.5KB + ~200 行，搬进 core 属于"复制逻辑"，运行时零收益
- 日记那半边有写入/重命名/删除/作者校验，搬错的代价是丢日记
- 真正需要"一处读数据"的时刻，是数据目录改名（~/.dsh/dsh-pet -> ~/.dsh/xilian）
  → 与该步合并做，收益才成立
```

### 16.4 桌面启动脚本（本次新增）

```text
pink-diary-pet/tools/gpt-sovits/启动GPT-SoVITS.bat   先探测 9880，未起则启动并轮询就绪
pink-diary-pet/tools/gpt-sovits/停止GPT-SoVITS.bat   按端口找 PID 并 kill
（原在桌面，2026-11-18 挪进仓库，带 README；.gitignore 已对 tools/gpt-sovits/ 放行）
```

**注意：现在插件会自动拉起 GPT-SoVITS，平时不需要这些脚本。**
插件在 `apply()` 里探测 9880，未监听则 `detached + windowsHide` 静默拉起，
日志写 `~/.dsh/xilian-tts/gpt-sovits.log`，状态查 `GET /dsh-tts-api/gsv-status`。
脚本只用于：DSH 未启动时单独跑、想看模型加载过程、释放显存（插件不会停止服务）。


为什么需要：GPT-SoVITS 若由"当前 DSH 会话的后台任务"启动，会随 DSH 重启被杀。
从桌面双击启动的进程挂在 explorer 下，**DSH 重启不受影响**；只有电脑重启才需再点一次。

---

## 17. 2026-11-18 19:00 · 语音服务收尾 + 上游同步制度

### 17.1 新增的语音服务能力（插件内，非外部脚本）

```text
POST /dsh-tts-api/gsv-start            立即返回 { ok, starting }
POST /dsh-tts-api/gsv-start?wait=1     等到端口就绪再返回 { ready, waitedSeconds }
                                       上限 max(30, launcher.waitSeconds)，硬顶 180s
POST /dsh-tts-api/gsv-stop             停掉 9880；先查进程名，不是 python 就拒绝（防误杀）
GET  /dsh-tts-api/gsv-status           返回 listening/childPid/lastStartAt/lastReadyAt/lastError
```

右键菜单：走第三方菜单注册表（`menuRegistry.register` + 15s 长轮询），
出现在「更多 → 语音服务 → 恢复语音 / 释放显存」。**前端零改动。**

以上**均需重启 DSH 才注册生效**（当前运行实例还是旧代码）。

### 17.2 结构修正：保住与上游的文件对应关系

原先 `lib/index.js` 是 80 行启动探针、真实代码在 `lib/index.impl.js`，
导致官方那个 7700 行文件的 diff 变成 `-6038 / +8148`，未来合并等于重写。

改为：

```text
lib/index.js   真实实现（与官方同路径，diff 就是我们的增量 +2226/-32）
lib/boot.js    启动探针（新增文件，不干扰上游）
package.json   main / exports["."].default → ./lib/boot.js
```

diff 从 **13689 插入 / -6022 删除** 收敛到 **7771 / -104**。

### 17.3 上游同步基线（防"半年后无法合并"）

```text
vendor 提交   8b3b075           官方 0.3.8 原样代码（只含代码，不含二进制媒体）
tag           upstream-0.3.8    -> 8b3b075
合并记录      568bcb0           git merge -s ours（只记共同祖先，工作区零改动）
```

配套：

```text
scripts/upstream-diff.mjs <版本>   下载官方 tarball、解包、逐文件比对，
                                   输出「我们改了什么 / 我们新增了什么 / 官方有我们没有的」，
                                   文本文件带 +/- 行数；assets/ 单独计数不刷屏
docs/Upstream-Log.md               基线怎么建、当前快照、发版四步流程、
                                   每个文件的冲突热点与策略、同步登记表
```

当前差异快照（8 个文件被改）：

```text
lib/index.js                          +2226 / -32
lib/client.js                          +216 /  -8
runtime/electron-helper/sprite.js      +160 /  -6
runtime/electron-helper/renderer.js    +101 /   0
runtime/electron-helper/shared-core.js  +94 /  -7
runtime/electron-helper/main.js         +25 /  -1
package.json                            +10 / -47
cordis.patch.yml                         +3 /  -3
```

### 17.4 已废弃目录的标记

`src/dsh-pet-host/` 已与 `packages/core` 分叉，且 `install.mjs` 不再部署它。
已在其 README 顶部加**醒目废弃警告**：改这里不会生效，真源是 `packages/core/lib/*`。
保留原因：对照 fork 之前的实现；确认不需要后可整目录删除（git 历史仍在）。

### 17.5 当前真源与部署方式（重要，替代 §3.2）

```text
真源      pink-diary-pet/packages/core/*
部署      profile/node_modules/dsh-xilian-core 是 Junction → packages/core（改完即时生效）
运行时依赖 packages/core/node_modules/{ws,@electron/get}（包内自带，ESM 按 realpath 解析）
peer 依赖  @deepseek-ai/* 由宿主注入，不要装到包内（.npmrc 已禁 auto-install-peers）
启动探针  lib/boot.js → 日志 ~/.dsh/xilian-boot.log
```

### 17.6 待办（都需要重启验证）

```text
重启后  验证 /gsv-status、/gsv-stop → /gsv-start?wait=1、右键菜单「更多 → 语音服务」
押后    数据目录改名 ~/.dsh/dsh-pet -> ~/.dsh/xilian（与 F3.6 记忆/日记路由收编一起做）
押后    启动探针是否保留（保留则每次启动多 7 行日志，但能防静默失败）
观察    连续运行稳定性（今天动了 fork / 改名 / TTS 接管 / 启动器）
```

---

## 18. 2026-11-18 19:40 · 内存优化（GPT-SoVITS 空闲几乎不占）

### 18.1 先弄清 3.7GB 是什么

```text
首次推理前   工作集 1865 MB / 线程 62
一次合成后   工作集 3853 MB / 私有 6141 MB / 显存 1575 MiB
```

那 +2GB 是 **CUDA 主机侧上下文与缓存**，首次推理才分配，进程活着就一直在。
试过 `OMP_NUM_THREADS=1 / MKL_NUM_THREADS=1 / OPENBLAS=1`：线程 62 → 27，
但稳态内存 3704 → 3853（噪声），**无效，已放弃**。显存也没有变化（1575 → 1579）。

### 18.2 两级处理（已实现）

```text
launcher.trimIdleMinutes   默认 5 分钟（0 = 关闭）
  空闲 5 分钟 → EmptyWorkingSet 把页挤回 pagefile，进程不退出
  实测   770 MB → 3 MB；下次合成 4.24s（平时 3.53s，多 0.7s 换入）

launcher.idleStopMinutes   默认 20 分钟（0 = 关闭）
  空闲 20 分钟 → 停服务：显存 + 提交内存全部归零
```

### 18.3 必须说清的边界

修剪只降低**工作集**（任务管理器显示的数字）。**提交内存仍是约 6.1GB**，
那是模型权重 + CUDA 上下文的真实占用，进程活着就还在。要真正归还只能休眠/退出。

要在"正在使用"时也低于 3.8GB，唯一手段是换更小的模型（当前 v2ProPlus 带
`sv` 说话人验证模型 + LoRA rank 32；换回 v2 会牺牲音色相似度与韵律）——未做。

### 18.4 实现位置与坑

```text
lib/index.js          trimGsvWorkingSet() + 看门狗里 trimIdleMinutes 判断
tools/gpt-sovits/trim-ws.ps1   独立脚本（人工可用）
插件内嵌              同一份脚本 base64 存在 index.js，首次使用时写到
                      ~/.dsh/xilian-tts/trim-ws.ps1（sha256 与仓库文件一致）
```

两个坑：

```text
1. 把 PowerShell 源码写进 JS 字符串 → 转义引号导致提取/维护困难
   → 改 base64 内嵌
2. 参数名用 $Pid → PowerShell 只读自动变量（当前进程 ID），
   直接报 "Cannot overwrite variable Pid" → 改为 TargetPid
```

### 18.5 生效条件

修剪与看门狗都在 `apply()` 里注册，**需下次重启 DSH 生效**。
手动验证方式：

```powershell
powershell -NoProfile -File pink-diary-pet\tools\gpt-sovits\trim-ws.ps1 -TargetPid <pid>
```

---

## 19. 项目完成度（2026-11-18 19:40）

### 19.1 原始目标 vs 现状

```text
目标：DSH 桌宠 + QQ Bot + 本地 TTS，语音管线完全自控
```

| 目标 | 状态 | 证据 |
|---|---|---|
| 桌宠在 DSH 里运行（web + 桌面窗口） | ✅ | electron 4 进程、helper 正常 |
| QQ Bot 与桌宠记忆互通 | ✅ | pet-bridge pid 与 DSH 同进程；QQ 侧收发正常 |
| 本地语音（自训音色，无云端） | ✅ | GPT-SoVITS 9880，3.9s 音频 / 32kHz |
| 语音链路自控（不依赖第三方 TTS 插件） | ✅ | `@memef1f1y/dsh-plugin-tts` 已从 bundles 移除 |
| 语音后端自动起停（无人工干预） | ✅ | 插件 apply 自动 spawn，实测 17s 就绪、窗口句柄 0 |
| 桌面宠物外观/品牌换成自研角色 | ✅ | logo + 6 个通知图标已替换为粉发立绘 |
| 代码归属自控（fork 官方包） | ✅ | `packages/core` = `dsh-xilian-core`，junction 部署 |
| 仍能跟进上游 | ✅ | tag `upstream-0.3.8` + `upstream-diff.mjs` |
| 低占用（不用时几乎不占） | ✅ | 5 分钟修剪到几 MB，20 分钟停服务归零 |
| 旧工具（ChatTTS/RVC）不再自动启动 | ✅ | 已拆掉自动启动，仅手动脚本 |

### 19.2 明确押后（不是遗漏，是有意推迟）

```text
F3.6  记忆/日记路由收进 core
      押后理由：宿主半边仅 2.5KB + ~200 行，搬迁属"复制逻辑"，运行时零收益；
                日记那半边有写/删/改，搬错代价是丢日记。
      触发条件：与"数据目录改名"一起做，那时才真正需要"一处读数据"。

数据目录改名  ~/.dsh/dsh-pet -> ~/.dsh/xilian
      押后理由：牵连记忆、日记、图片、身份、上下文块、QQ 侧路径；
                当前用旧名可零迁移回退，收益仅是命名整洁。

DSH 升级 0.2.1-rc.3 -> 更新版本
      押后理由：升级会改变插件注入契约，需先稳定运行一段时间再评估。

lib/index.js 模块化（7800 行单文件）
      押后理由：拆分改变与上游的文件对应关系，直接损害后续 merge 能力；
                upstream-diff 已能把改动控制在 8 个文件内，拆分的收益不成立。
```

### 19.3 三项决策：已拍板并执行（2026-11-18 19:55）

```text
1. 分支收敛        ✅ 已执行
   refactor/xilian-core 快进合并进 main（21 个提交）
   feature/structured-memory-blocks 的提交已确认在 main 里（git cherry 无输出）→ 删除
   refactor/xilian-core 合并后删除
   现在只剩 main 一个分支

2. src/dsh-pet-host  ✅ 已删除（14 文件 / 825KB，提交 4e240d9）
   理由：与 packages/core 分叉、install.mjs 不再部署 → 编辑它静默无效，是陷阱
   可恢复：git 历史完整保留

3. 启动探针 lib/boot.js  ✅ 保留
   理由：三次启动失败（重复 factory、包未自包含、静默不激活）全靠它的日志定位；
         代价只是每次启动 7 行日志
```

### 19.3.1 推送记录（2026-11-18 19:55）

```text
远端        github.com/libingyou527-sketch/pink-diary-pet
分支        main（origin/main 从 840934f -> c986f4e）
tag         upstream-0.3.8 -> 8b3b075 已推送
项目体积    17.2 MB / 515 文件，无单文件超过 2MB
本地 HEAD   c986f4e3efddd829c732341ee0d8a4d5e7143ec4
远端 HEAD   c986f4e3efddd829c732341ee0d8a4d5e7143ec4   （一致）
ahead/behind  0  0
耗时        250s（上行慢）
```

安全核验：

```text
密钥扫描      已跟踪文件无 ghp_/github_pat_/sk-/AKIA/-----BEGIN 命中
个人路径      3 处命中：官方测试夹具（保留）、已打码的示例（保留）、
              工具 README（已改 %USERPROFILE%，提交 c986f4e）
凭据落盘      .git/config 与 reflog 均无 token 痕迹
不该入库      node_modules / assets/memes / assets/emojis / assets/webm 均为 0
              .env.example 是空模板，安全
```

### 19.4 结论

```text
功能层面：已完成。桌宠、QQ、语音、自动起停、低占用、自有品牌全部跑通并实测。
工程层面：已完成收敛。单一分支 main 与远端一致，废弃目录已清，上游基线可追踪。
待观察：  今天改动密集（fork、改名、TTS 接管、启动器、内存策略），
          建议连续运行 2-3 天，再考虑 DSH 升级或数据目录改名这类大动作。

唯一还没生效的：内存修剪（trimIdleMinutes）需下次重启 DSH 才注册。
```

---

## 20. 剩余押后项（不在本轮范围，均有触发条件）

```text
F3.6 记忆/日记路由收编 + 数据目录改名
      触发条件：需要"一处读数据"时；两者必须一起做

DSH 升级 0.2.1-rc.3 -> 新版
      触发条件：连续稳定运行 2-3 天后评估；升级会改注入契约

lib/index.js 模块化
      结论：不做。拆分破坏与上游的一一对应，upstream-diff 已够用
```
