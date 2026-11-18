# 数据目录布局（~/.dsh）

> 迁移时间：2026-11-18 20:05 · 执行方式：移动 + junction 兜底

## 1. 现在的结构

```text
~/.dsh/
├── xilian/                     ← 本项目唯一的数据根（27.6 MB）
│   ├── pet/                    桌宠数据：配置、3 份记忆、身份、图片、动画缓存、日志
│   │   ├── main-config.jsonc
│   │   ├── pink-diary-pet.json
│   │   ├── memory.json / user-memory.json / user-group-memory.json
│   │   ├── identity.json / token-usage.log / startup.log
│   │   ├── pictures/  media-cache/  main-animation/  video-storyboard/
│   ├── tts/
│   │   ├── settings.json       GPT-SoVITS 参数（apiUrl / 参考音频 / 采样 / launcher）
│   │   └── audio/              合成音频 + gpt-sovits.log
│   └── legacy/                 归档，不参与运行
│       ├── tts-rvc/            旧 RVC 设置（已停用）
│       ├── dafeiyu-screensense/ 旧识屏数据
│       └── backups/            11 个 .bak（原散落在 pet/ 里，584 KB）
├── qqbot/                      ⚠️ 保持不动：第三方 qqbot 插件自己算的路径
│   ├── pet-bridge.json         由本插件写入，插件从同一路径读
│   ├── pet-qq-memory.json
│   └── pet-inbound.log
└── 其他目录一律不要动（electron / profiles / sessions / attachments / storages / cache / skills）
```

## 2. 旧路径还在用 —— 靠 junction

```text
~/.dsh/dsh-pet      ->  ~/.dsh/xilian/pet          (Junction)
~/.dsh/tts-gsv      ->  ~/.dsh/xilian/tts          (Junction)
~/.dsh/xilian-tts   ->  ~/.dsh/xilian/tts/audio    (Junction)
```

**为什么保留**：两个 UI 插件（记忆查看、日记）和部分旧脚本仍按旧路径读取。
junction 让它们零改动继续工作，同时真实数据已经在 `xilian/` 下。

验证命令：

```powershell
Get-Item "$env:USERPROFILE\.dsh\dsh-pet" -Force | Select-Object LinkType,Target
# LinkType=Junction  Target=...\xilian\pet
```

## 3. 迁移做了什么（可复现）

```text
1. New-Item  ~/.dsh/xilian
2. Move-Item ~/.dsh/dsh-pet      -> ~/.dsh/xilian/pet       （同盘，4ms）
3. mklink /J ~/.dsh/dsh-pet      -> ~/.dsh/xilian/pet
4. Move-Item ~/.dsh/tts-gsv/settings.json -> ~/.dsh/xilian/tts/settings.json
   mklink /J ~/.dsh/tts-gsv      -> ~/.dsh/xilian/tts
5. Move-Item ~/.dsh/xilian-tts   -> ~/.dsh/xilian/tts/audio
   mklink /J ~/.dsh/xilian-tts   -> ~/.dsh/xilian/tts/audio
6. 归档 tts-rvc、dafeiyu-screensense、pet/*.bak -> xilian/legacy/
```

## 4. 迁移后实测（当时全部通过）

```text
chat 写记忆           memory.json 288503 -> 289302 字节，落在 xilian/pet/     ✓
记忆插件 GET /dsh-pet-memory    200，size 一致                                ✓
日记插件 GET /xu-diary/entries  200，21 条                                    ✓
语音合成             2.4s，音频落在 xilian/tts/audio/                          ✓
旧路径              三者全部 LinkType=Junction，没有重建实体目录               ✓
```

## 5. 后续：什么时候可以删掉 junction

当代码里的旧路径全部改完、并稳定运行一段时间后：

```text
packages/core/lib/index.js       数据目录解析（dsh-pet -> xilian/pet）
packages/core/lib/index.js       tts-gsv / xilian-tts 路径
src/plugins/memory-viewer        读 ~/.dsh/dsh-pet/memory.json
src/plugins/pink-diary           读 ~/.dsh/dsh-pet/pink-diary-pet.json
scripts/install.mjs              运行时配置合并的默认位置
```

改完并重启验证通过，再删 junction（`cmd /c rmdir` 对 junction 是"只删链接"，不删目标，务必用 `rmdir` 而不是 `rd /s`）。

**注意**：`~/.dsh/qqbot/` 不要动 —— 那是第三方插件的路径，改名会让下次 `npm update` 把它打回原形。
