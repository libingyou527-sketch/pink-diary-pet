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

## 补丁 4（已撤销）：语音链路纯文本诊断日志（2026-11-18 加、同日删）

**背景**：QQ 语音长期不出声。宿主路由与直连两条路都验证过"用正确构造的请求能 200"，
但 GPT-SoVITS 服务端日志里出现 10 次 `POST /tts 400`，报错是 `text_lang` 为 None、
且"实际输入的目标文本"为空——说明某个调用方发了空 text。光看服务端日志无法确定是谁。

**改法**（只记录，不做任何匹配判断）：

```text
logVoice(msg) 追加写 ~/.dsh/qqbot/voice.log，ISO 时间戳 + 一行描述

记录点：
  synth begin textLen=<n> hostOrigin=<url|(none)>
  host route ok url=… bytes=…
  host speak http=<status>
  host speak no url body=…
  host audio fetch failed http=<status>
  host route threw: <error>
  direct fallback base=<url> textLen=<n>
  direct fallback response=<status>
```

**用法**：在 QQ 里发一句"发个语音"，然后看 `~/.dsh/qqbot/voice.log`：

```text
只有 synth begin + host route ok        → 宿主路由成功，问题在发送端（bot.sendVoice）
有 host … failed/threw + direct …       → 宿主路由挂了，看具体原因
direct fallback textLen=0               → 调用方传了空文本（就是那 10 次 400）
没有 synth begin                        → voice 没到 true，模型没打标签
```

**已撤销**：2026-11-18 21:27 定位完成后按要求删除（`logVoice` 函数与 8 处调用、`~/.dsh/qqbot/voice.log` 全部移除）。
保留此节仅为记录：万一将来语音又出问题，可以照此重新加回。

## 补丁工程化（2026-11-19）

历史做法是手改 `node_modules`，升级或重装就丢。现在改为**可重放 + 可自检**。

### 版本钉死

```yaml
# ~/.dsh/profiles/desktop/package.json
"@tencent-connect/dsh-qqbot": "0.5.2"    # 原来是 ^0.5.2
```

`^` 会让任何一次 `pnpm install` 拉到 0.5.5，把补丁连同 petMode 一起冲掉。

### 补丁文件

```text
~/.dsh/profiles/desktop/patches/@tencent-connect__dsh-qqbot@0.5.2.patch
repo: tools/dsh/patches/同名文件（版本管理用，可 diff 复查）

~/.dsh/profiles/desktop/package.json
  "pnpm": { "patchedDependencies": {
    "@tencent-connect/dsh-qqbot@0.5.2": "patches/@tencent-connect__dsh-qqbot@0.5.2.patch"
  }}
```

补丁内容只有 6 个文件：

```text
新增  dist/pet-bridge/{server,memory,image}.js
修改  dist/config.js                     +petMode/petId/petWsPort
      dist/gateway/middleware-setup.js   +petMode 中间件
      dist/gateway/bootstrap.js          +petMode 分支 + GSV 语音管线 + 宿主优先路由
```

生成方式（已验证）：以 npm 原包为 baseline 建临时 git 仓库 → 覆盖为已安装版本 →
`git diff --cached`。**必须关掉 autocrlf**，否则行尾被归一化，打出来的包和原文件字节不同：

```powershell
git -c core.autocrlf=false -c core.eol=lf -c core.safecrlf=false diff --cached --no-color
```

验证可重放：把补丁打到干净的 npm 原包上，与已安装目录**逐字节比对**，必须完全一致。

### 校验脚本

```powershell
node tools/dsh/verify-qqbot-patches.mjs          # 详细
node tools/dsh/verify-qqbot-patches.mjs --quiet  # 只在失败时输出
```

检查 6 个文件的标记；任一缺失退出码 1，并打印修复方式。
DSH 升级、插件更新、任何 install 之后跑一次（30 秒）。

### 升级 qqbot 时怎么做

```text
1. 下载新版本 tarball，解包到临时目录
2. 以新原包为 baseline，把 petMode/语音/pet-bridge 移植过去（0.5.5 是 dist→lib 重构，需重写路径）
3. 生成新补丁：patches/@tencent-connect__dsh-qqbot@<新版本>.patch
4. package.json 同时改两处：依赖版本号 + patchedDependencies 的 key
5. pnpm install → 跑校验脚本 → 重启验 QQ 文字与语音
```

注意：`patchedDependencies` 的 key 必须带版本号，升级后旧的 patch 不会自动生效。
