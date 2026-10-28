# qqbot

基于 **@tencent-connect/dsh-qqbot 0.5.2**（MIT，Copyright © 2026 Tencent Connect）的最终修改版。

## 文件

```text
gateway/bootstrap.js
gateway/middleware-setup.js
config.js
pet-bridge/server.js
pet-bridge/memory.js
pet-bridge/image.js
```

## 修改摘要

- petMode 入站全部交给 dsh-pet；
- 图片/引用图片/引用文字解析；
- 群聊只读公开 profile，不读用户私聊 raw；
- 无 QQ 斜杠命令；
- 引用文本与当前文本分开：
  ```text
  [用户引用了历史消息：...]
  [用户当前说：...]
  ```

## 历史

`petHistoryLimit` 默认 1000，QqMemory 保留 1000 条，不再截 12 条。

## 版权

本目录包含上游 MIT 代码的修改版。完整声明见仓库根目录 `NOTICE`。

