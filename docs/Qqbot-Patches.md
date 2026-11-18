# QQ 插件（@tencent-connect/dsh-qqbot）的本地补丁

> 这些改动直接改在 `node_modules` 的 `dist/` 里。
> **`pnpm install` / 升级插件会把它们冲掉**，冲掉后需要按本文重新打。

路径：

```text
~/.dsh/profiles/desktop/node_modules/@tencent-connect/dsh-qqbot/dist/gateway/bootstrap.js
```

## 补丁 1：语音管线切到 GPT-SoVITS（2026-11-15）

ChatTTS + RVC 已废弃，语音改为直接调用 GPT-SoVITS 的 `/tts`。

```text
readGsvSettings()        读 ~/.dsh/tts-gsv/settings.json
resolveGsvBase()         探测 9880-9883 等端口，缓存结果；失败清缓存重探
synthesizePetVoice()     剥 [表情:xxx] / [语音] 标签 → POST /tts → 写临时 wav
maybeSendPetVoice()      voice-first：语音发成功就不发文字；失败回落文字
```

## 补丁 2：优先走宿主统一入口（2026-11-18）

**背景**：宿主侧（dsh-xilian-core）给 GPT-SoVITS 加了空闲休眠（20 分钟无请求直接停）。
QQ 侧原本直连 `127.0.0.1:9880`，服务睡着时合成失败、静默回落文字。

**改法**：宿主把 origin 写进 `~/.dsh/qqbot/pet-host.json`：

```json
{ "origin": "http://127.0.0.1:<DSH端口>", "updatedAt": 1795004451804 }
```

QQ 侧新增 `readPetHostOrigin()`，`synthesizePetVoice()` 里先：

```text
POST {origin}/dsh-tts-api/speak   { text, provider:"gptsovits", voice:"gsv", custom: settings }
  → 200 { url }
  → GET {origin}{url} 拿 wav → 写临时文件 → 发送
```

失败（宿主没起来 / 老版本没这个文件）才退回直连 GSV，行为与之前一致。

好处：QQ 语音也会**自动唤醒**休眠中的服务，且过程写进
`~/.dsh/xilian/tts/audio/gpt-sovits.log`，失败可查。

## 补丁 3：语音失败不再静默（2026-11-18）

原来合成失败只走 `logger.debug`，默认级别看不到，导致"QQ 里没声音但日志干净"。
现在改成：

```text
voice synth failed: ...          warn
gsv synth http <status>          warn
voice too long (>60s) skipped    warn   ← 原来直接 return null，没有任何痕迹
host speak http <status>         warn
host voice route failed ..., falling back to direct gsv   warn
```

## 重新打补丁的方法

1. 打开 `bootstrap.js`，搜索 `readGsvSettings`：
   - 若不存在 → 需要重做补丁 1（整段语音实现）
   - 若存在但没有 `readPetHostOrigin` → 补补丁 2
2. 搜索 `synthesizePetVoice`，确认里面先尝试 `hostOrigin + "/dsh-tts-api/speak"`。
3. 搜索 `voice synth skipped`，若命中说明补丁 3 丢了。
4. 校验：`node --check bootstrap.js`（会报 ESM 语法警告可忽略，只看是否有 SyntaxError）。

## 为什么会走到这一步

`dsh-qqbot` 没有暴露 pet 语音的扩展点，所以只能在 `dist` 里改。
长期方案有两条（都还没做）：

```text
A. 向上游提 PR，让 pet 模式的语音走可配置的 HTTP endpoint
B. 不用它的 pet 模式，我们自己维护一个 gateway（工作量大）
```
