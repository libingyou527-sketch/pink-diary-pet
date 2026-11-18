# Profile patch 恢复（`cordis.patch.yml`）

> 症状：QQ 消息不再由桌宠回复（走了普通 agent）、聊天报
> `llm-deepseek: no API key for provider route "deepseek-official"`。
> 根因往往不是 cookie，而是 **`cordis.patch.yml` 被重写过、配置丢了**。

## 什么时候会被冲掉

DSH 崩溃弹窗里的第三个按钮：

```text
[ Disable third-party plugins, back up profile patch, and restart ]
```

它会**备份并重写** `~/.dsh/profiles/desktop/cordis.patch.yml`，把插件配置恢复成默认值。
2026-11-18 实测丢了三块：

```text
agent-default-model        provider / model / reasoningEffort
agent-preset-registry      default / selectedDefault
im-qqbot                   petMode / petId / sharedC2cIds / ttsApiUrl
```

后果：

```text
默认模型回落到 deepseek-official   → 需要 DEEPSEEK_API_KEY，而凭据库里只有账号登录态 → 报错
petMode 回落到 false              → QQ 消息不再交给 dsh-pet，而是走 DSH agent
```

`petMode` 的默认值就是 `false`（`dist/config.js:15`），所以"没配置"等于"关掉"。

## 怎么判断是这个问题

```text
① 9527 端口是否在监听          netstat / Get-NetTCPConnection -LocalPort 9527
② ~/.dsh/qqbot/pet-bridge.json 是否存在（服务退出会自己删）
③ pet-inbound.log 里最近的消息有没有 dispatch-pet 阶段
   只有 raw-before-middleware → message-listener → after-middleware
   没有 dispatch-pet  =  petMode 没开
④ cordis.patch.yml 里有没有 petMode: true
```

## 完整参考内容（可直接照抄，替换 appSecret）

```yaml
# QQ 机器人凭据（扫码绑定自动生成）
- id: agent-default-model
  name: '@deepseek-ai/dsh-agent-default-model'
  config:
    provider: deepseek-account      # 账号登录态，不需要 API key
    model: deepseek-flash
    reasoningEffort: high
- id: ui-settings-account
  name: '@deepseek-ai/dsh-client-ui-settings-account'
  config:
    version: 1
    step: done
    purpose: null
    process: standard
    completion: skipped
    usage: compact
    developerTools: false
- id: ui-chat
  name: '@deepseek-ai/dsh-client-ui-chat'
  config:
    transcriptView: standard
    performanceUsage: compact
- id: ui-settings
  name: '@deepseek-ai/dsh-client-ui-settings'
  config:
    enabled: false
- id: agent-preset-registry
  name: '@deepseek-ai/dsh-agent-preset-registry'
  config:
    default: standard
    selectedDefault: standard
- id: im-qqbot
  config:
    appId: '<你的 appId>'
    appSecret: <你的 appSecret>
    petMode: true                   # ← 关键：不开就不会走桌宠
    petId: main
    sharedC2cIds:
      - '<你的 openid>'
```

改完**必须重启 DSH**（patch 在启动时加载）。

## 验证清单

```text
1. 9527 在监听、pet-bridge.json 存在
2. pet-inbound.log 出现 dispatch-pet 阶段
3. 本地 GET /dsh-pet-7340/config 返回 200
4. QQ 发一句文字 → 收到桌宠回复（而不是 agent 回复）
```

## 防复发

```text
· 崩溃时优先用 Restart，不要点 Disable third-party plugins
· 万一点了：先看 ~/.dsh/profiles/desktop/cordis.patch.yml.bak-* 备份（按钮自己会备份），
  把丢掉的段落抄回来，appSecret 用当前的（重新扫码后可能会变）
· 桌宠的 chatModel/whisperModel 已钉在 main-config.jsonc，是第二道保险
```
