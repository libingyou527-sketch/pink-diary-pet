# 静态 System Prompt 地图

> 想改人设、语气、格式规则、语音触发条件，看这里。
> 行号以 2026-11-18 20:35 的 `packages/core/lib/index.js` 为准（编辑后可能位移一两行，用函数名搜索最稳）。

## 0. 怎么亲眼确认她读到了（不用猜）

```text
GET http://127.0.0.1:<DSH端口>/dsh-pet-7340/prompt?pet=main
```

返回 `{ ok, pet, entry, length, system }`，`system` 就是**这一轮真正发给模型的完整静态 prompt**。
（2026-11-18 新增，见 index.js:7177 的 `rest === "prompt"` 分支）

行为侧佐证：问"你叫什么名字"她答"絮"、问"你能发出声音吗"她确认能发声——
这两条都只出现在静态 prompt 里，说明确实读到了。

## 1. 组装链路（按执行顺序）

```text
buildScopeSystem()                      packages/core/lib/index.js:4654
  └─ staticBase =                       index.js:4666
       petChatStatic(found)             index.js:5589   ← 人设 + 名字
       identitySuffix()                 index.js:4509   ← 身份层（主人称呼等）
       voiceCapability                  index.js:4665   ← 【发声能力】
       buildMemoryToolPrompt()          lib/memory-tools.js:37  ← 记忆工具用法
       BEHAVIOR_FORMAT_RULES            index.js:4643   ← 【行为与格式绝对准则】+【时间逻辑】
```

**这个 staticBase 就是完整的静态 System Prompt**，跨场景（本地 / 主人私聊 / 用户私聊 / 群聊）完全一致。

设计约束（index.js:4663-4664 注释）：

```text
// 真正固定的 system：人设 + 身份 + 发声能力 + 工具说明。
// scope 权限、群友资料、日记、时间都不得进入这里；它们统一追加到 user message。
```

## 2. 人设文本本体在哪里

```text
~/.dsh/xilian/pet/main-config.jsonc        →  "whisperPrompt" 字段（当前 1250 字）
packages/core/assets/config.jsonc          →  "whisperPrompt"（默认值，很短）
```

读取顺序（`petPersona`，index.js:3321）：宠物自己的 whisperPrompt → 所属条目的 → 空。

## 3. 语音触发规则

`BEHAVIOR_FORMAT_RULES` 第 4 条（index.js:4647）：

```text
当主人明确要求你使用语音（比如"发语音"、"想听你的声音"等）时，请在句末加上 [语音] 标签。
```

解析在 `finalizeEmojiReply`（index.js:4420 起），`VOICE_TAG_RE = /\[语音\]/g`（index.js:4120）。
标签一致：提示词写 `[语音]`，正则也是 `[语音]`。

## 4. 行为准则全文位置（index.js:4643-4652）

```text
1. 表情包格式 [表情:文件名]，每次最多 1 个
2. 必须选用标点符号（如 ~、！、？、...... 等）和 [表情:文件名] 中任一或任二
   来代替括号里的动作和心理描写                             ← 按用户要求保留原文措辞
3. "♪" 可自然使用
4. 明确要求语音时必须句末加上 [语音] 标签            ← 2026-11-18 "请"→"必须"
5. 绝对不要输出时间戳（[20:28:22] 等形式）                ← 2026-11-18 新增
【时间逻辑与常识推理】
  · 历史带时间戳、当前时间已知，但当背景常识用，不要频繁报时
  · 利用时间差做常识判断（刚说去洗澡就回来 → 拆穿）
```

## 5. user 侧（不是 system，容易混淆）

```text
chatTail(now)                        index.js:3312   → [当前系统时间：YYYY-MM-DD HH:MM:SS] + 表情包指令
scopePolicyText({scope,...})         index.js:4673   → 权限块
appendDiaryToUserText(text, scope)   index.js:4334   → 当天日记摘录
withMessageTime(text, ts)            index.js:3305   → 历史消息的 [MM-DD HH:MM:SS] 前缀（只给 user）
```

## 6. 时间戳的来龙去脉（2026-11-18 处理过）

```text
现象   回复开头出现 [20:28:22] 之类时间戳，还带（）动作旁白
根因①  assistant 历史消息也套了 withMessageTime → 模型模仿自己过去的格式（自我强化）
根因②  【时间逻辑】那段写着"你的历史记录带有绝对时间戳"，模型以为要跟着写
修法   assistant 不再写时间戳（5326/5718/4585/4598 四处）
       输出开头的时间戳循环剥离（finalizeEmojiReply，支持 [HH:MM:SS]/[MM-DD HH:MM:SS]/[YYYY-MM-DD HH:MM:SS]）
       规则第 5 条明令禁止输出时间戳
       规则第 2 条强化为禁止（）动作旁白
保留   user 消息仍带时间戳；user 尾部仍带当前时间 → 她依然知道时间
```

**不要做的事**：批量清洗旧记忆里的时间戳。那会改写历史，让所有会话的 prompt 缓存前缀一次性失效。
旧时间戳会随对话轮转自然淘汰，输出侧已被剥离。

## 7. 编码约定（避免乱码）

```text
给模型/给用户看的文件    UTF-8（无 BOM）：jsonc / json / log / md / js
命令行脚本               .bat 与 .ps1 只用 ASCII（cmd/PowerShell 5.1 按 GBK 读没有 BOM 的脚本）
读日志                   一律显式 UTF-8：Get-Content -Encoding UTF8
```

当前体检结果（2026-11-18 20:29）：`memory.json`、`pink-diary-pet.json`、`settings.json`、
`gpt-sovits.log`、`pet-qq-memory.json`、两份 `config.jsonc` 全部是合法 UTF-8，U+FFFD 均为 0。

## 8. 括号旁白与语音触发：代码层兜底（2026-11-18）

规则是"偏好"，模型不一定遵守，所以两处都在代码里兜：

```text
括号旁白      **不再由代码剥离**（2026-11-18 回滚）：交给规则第 2 条，让模型自己用标点/表情代替
语音触发      VOICE_REQUEST_RE 命中"发语音/想听你的声音/用语音"等关键词时
              直接判定 voice=true，不等模型打 [语音] 标签（index.js:4123）
时间戳        开头三种格式循环剥离（index.js:4446-4452）
```

三者的共同前提：**规则管大部分，代码兜剩下的**。

## 9. 「重载配置」到底重载了什么（2026-11-18 修好）

以前 `POST /dsh-pet-7340/reload` 只做一件事：重启桌面宠物窗口（`syncDesktop`），
**配置一个都没重读**。现在它会：

```text
① pink-diary-pet.json   → reloadRuntimeConfig()：diaryDir / 图片目录 / 视频路径 / 上下文参数
② identity.json         → 丢弃 identityCache，下次用到时重新读
③ emoji 元数据          → 强制失效缓存
④ main-config.jsonc     → 本来就是每次现读（人设、宠物列表、模型、表情池）
⑤ 桌面窗口              → syncDesktop() 重建（原有行为）
```

返回体会告诉你各段是否成功：

```json
{ "reloading": true,
  "reloaded": { "runtimeConfig": true, "identity": true, "emojiMeta": true, "desktop": true },
  "pets": 1,
  "behaviorRules": "builtin" }
```

### 9.1 行为规则可以直接写进配置（改规则不用重启）

`~/.dsh/xilian/pet/main-config.jsonc` 顶层新增可选字段 `behaviorRules`（字符串）：

```jsonc
"behaviorRules": "\n\n【行为与格式绝对准则】\n1. ……"
```

- 配了 → **整体替换**内置的 `BEHAVIOR_FORMAT_RULES`（`behaviorRulesText()`，index.js:4688）
- 没配 → 用内置文本
- 返回体里的 `behaviorRules` 字段会说明当前用的是 `"config"` 还是 `"builtin"`

这样调规则文字 → 保存 → 右键「重载配置」→ 下一条回复就生效。

### 9.2 仍然需要重启的

```text
memoryBlocksEnabled（记忆块开关）    apply 时创建 store
上下文预算 / 压缩比例                 apply 时算成常量
第三方插件代码（qqbot 补丁等）        由 DSH 启动时加载
```

## 10. 2026-11-18 20:56 · 认知与人设合并，静态 prompt 精简

按用户决定：**去掉关键词兜底，语音交给模型判断；认知（时间/发声）搬进人设，静态 prompt 只留机器契约。**

### 10.1 现在各层有什么

```text
认知（人设 whisperPrompt，~/.dsh/xilian/pet/main-config.jsonc → pets[0].whisperPrompt，1517 字）
  ├ 原本的性格/语气/示例
  ├ 时间与感知        ← 新增（原【时间逻辑与常识推理】搬来）
  └ 关于声音          ← 新增（原【发声能力】搬来，讲清"没标签=没声音"）

静态 prompt（buildScopeSystem，index.js:4704）
  ├ petChatStatic(found)      人设 + 名字
  ├ identitySuffix()          身份层
  ├ buildMemoryToolPrompt()   记忆工具
  └ BEHAVIOR_FORMAT_RULES     只剩 5 条机器契约（index.js:4666-4671）
       1 表情包格式  2 标点替代括号  3 ♪  4 [语音] 触发条件  5 禁写时间戳
```

### 10.2 删掉的东西

```text
BEHAVIOR_FORMAT_RULES 里的【时间逻辑与常识推理】整段   → 已进人设
代码里的 voiceCapability（【发声能力】整段）           → 已进人设
VOICE_REQUEST_RE 关键词兜底                            → 已删，改由模型判断
```

保留的兜底（与判断无关，纯输出清洗）：仅开头时间戳循环剥离。括号旁白不再由代码处理。

### 10.3 为什么这样分

```text
认知放人设   她"怎么想"：时间感、能不能发声、性格 → 属于角色，改起来不用碰代码
静态放契约   机器格式：标签写法、禁止项 → 模型必须逐字遵守的硬格式
```
