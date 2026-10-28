# dsh-pet-host

基于 **dsh-pet 0.3.8**（MIT，Copyright © 2026 PC2005-cloud）的最终修改版。

## 文件

```text
index.js
client.js
config.js
runtime/electron-helper/
  main.js
  renderer.js
  shared-core.js
  sprite.js
```

## 修改摘要

- 本地记忆 + 图片存储；
- 身份层缓存与 `buildScopeSystem` ACL；
- 用户级 profile / 私聊 / 群公开记忆；
- 日记图片日志过滤；
- 启动性能检查与 QQ 桥延迟（保持原逻辑）。

## Token 成本\n\n- 本地正则判断屏幕意图，普通消息不再调用识屏模型；\n- 静态前缀：人设 → 身份 → 记忆工具 → ACL；\n- 动态尾：Profile、日记、block、预检索、当前时间；\n- token 日志：`[tokens] prompt_tokens=... completion_tokens=... total_tokens=... cache_hit_tokens=...`。\n\n## 上下文预算

- 默认 1M 窗口，80% 触发；
- 超限取最旧 20% 轮次生成 ≤50 字摘要；
- 摘要 5 秒超时/失败直接丢弃旧 20%；
- 低于阈值加载全部历史。

## 配置

`memory-blocks.js / memory-search.js / memory-summary.js / memory-context.js / memory-tools.js\n\n实验开关默认关闭：`memoryBlocks.enabled`。\n\n`config.js` 读取：

1. `PINK_DIARY_DIR` / `PINK_PICTURE_DIR`；
2. `~/.dsh/dsh-pet/pink-diary-pet.json`；
3. 默认目录。

默认：

```text
~/.dsh/pink-diary
~/.dsh/dsh-pet/pictures
```

## 版权

本目录包含上游 MIT 代码的修改版。完整声明见仓库根目录 `NOTICE`。



