# 静态 System Prompt 地图

> 想改人设、语气、格式规则、语音触发条件，看这里。

## 1. 组装链路（按执行顺序）

```text
buildScopeSystem()                      packages/core/lib/index.js:4646
  └─ staticBase =                       index.js:4658
       petChatStatic(found)             index.js:5581   ← 人设 + 名字
       identitySuffix()                 index.js:4502   ← 身份层（主人称呼等）
       voiceCapability                  index.js:4657   ← 【发声能力】说明
       buildMemoryToolPrompt()          lib/memory-tools.js:37  ← 记忆工具用法
       BEHAVIOR_FORMAT_RULES            index.js:4636   ← 【行为与格式绝对准则】（含语音标签规则）
```

**这个 staticBase 就是完整的静态 System Prompt**，跨场景（本地 / 主人私聊 / 用户私聊 / 群聊）完全一致。

设计约束写在 `index.js:4655-4656` 的注释里：

```text
// 真正固定的 system：人设 + 身份 + 发声能力 + 工具说明。
// scope 权限、群友资料、日记、时间都不得进入这里；它们统一追加到 user message。
```

## 2. 人设文本本体在哪里

人设不是硬编码在代码里，而是配置：

```text
~/.dsh/xilian/pet/main-config.jsonc        →  "whisperPrompt" 字段
packages/core/assets/config.jsonc          →  "whisperPrompt"（默认值）
```

读取顺序（`petPersona`，index.js:3321 附近）：

```text
1. 该宠物自己的 whisperPrompt
2. 所属条目的 whisperPrompt
3. 空字符串
```

## 3. 语音触发规则（你关心的那条）

`BEHAVIOR_FORMAT_RULES` 里第 4 条（index.js:4640）：

```text
当主人明确要求你使用语音（比如"发语音"、"想听你的声音"等）时，请在句末加上 [语音] 标签。
```

对应的解析在 `finalizeEmojiReply`（index.js:4420 起）：

```text
VOICE_TAG_RE = /\[语音\]/g          index.js:4120
  命中 → 剥离标签 → voiceRequested = true
  返回 { text（已去标签）, voice: true }
```

标签一致：提示词写 `[语音]`，正则也是 `[语音]`。

## 4. user 侧（不是 system，容易混淆）

```text
chatTail(now)                        index.js:3312   → [当前系统时间：YYYY-MM-DD HH:MM:SS] + 表情包指令
scopePolicyText({scope,...})         index.js:4665   → 权限块（私聊/群聊能读什么）
appendDiaryToUserText(text, scope)   index.js:4334   → 当天日记摘录
withMessageTime(text, ts)            index.js:3305   → 历史消息的 [MM-DD HH:MM:SS] 前缀
```

**2026-11-18 改动**：`assistant` 消息不再套 `withMessageTime`
（index.js:5326、5718、4585、4598 四处），避免模型模仿出时间戳前缀；
`user` 消息仍保留，模型据此知道"上次对话是什么时候"。

## 5. 想改什么 → 改哪里

| 想改的 | 位置 |
|---|---|
| 人设 / 说话风格 | `~/.dsh/xilian/pet/main-config.jsonc` 的 `whisperPrompt` |
| 身份层（主人称呼） | `identitySuffix()`，index.js:4502 |
| 发声能力描述 | `voiceCapability`，index.js:4657 |
| 语音触发条件 | `BEHAVIOR_FORMAT_RULES` 第 4 条，index.js:4640 |
| 表情/格式规则 | `BEHAVIOR_FORMAT_RULES`，index.js:4636 |
| 记忆工具说明 | `lib/memory-tools.js:37` |
| 时间格式 | `chatTail`，index.js:3312 |
| 权限边界 | `scopePolicyText`，index.js:4665 |

改完要重启 DSH 才生效（prompt 在 `apply()` 时组装）。
