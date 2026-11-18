# 旧语音工具状态（ChatTTS / RVC）

> 结论：**已停用，目录保留**。不删、不启动、不被任何运行路径引用。

## 现状核验（2026-11-18 22:45）

| 检查项 | 结果 |
|---|---|
| ChatTTS 进程 | 无 |
| RVC 进程 | 无 |
| 端口 9966（ChatTTS） | 未监听 |
| 端口 4892（RVC） | 未监听 |
| 启动项（Startup 文件夹） | 无相关项 |
| 注册表 Run | 无相关项（只有输入法、Epic、KOOK 等无关程序） |
| 计划任务 | 无相关项 |
| 运行代码引用 | 仅剩历史注释；UI 文案的 "RVC" 已改为 "GPT-SoVITS" |

磁盘占用（保留，未删）：

```text
D:\tools\ChatTTS            5.94 GB
D:\tools\RVC20260723Nvidia 14.37 GB
D:\tools\GPT-SoVITS         5.52 GB   ← 当前在用（V2ProPlus）
```

## 语音链路现状

```text
客户端 / QQ
   → dsh-xilian-core  POST /dsh-tts-api/speak
      → GPT-SoVITS 127.0.0.1:9880（自动拉起 / 空闲休眠 / UTF-8 环境）
         → /dsh-tts-audio/<id>
```

ChatTTS 与 RVC **完全不在链路上**：`@memef1f1y/dsh-plugin-tts` 已从 profile bundles 移除，
插件源码副本留在 `tools/dsh-plugin-tts-index.chattts.mjs`（未入库，仅作参考）。

## 如果将来要彻底清理

```text
1. 删 D:\tools\ChatTTS 与 D:\tools\RVC20260723Nvidia（共 20.3 GB）
2. 删 tools/dsh-plugin-tts-index.chattts.mjs（第三方插件源码副本）
3. ~/.dsh/xilian/legacy/tts-rvc/ 里还有旧的 RVC 设置（已归档，不在运行路径）
```

删之前建议再跑一遍上面的核验表，确认没有进程/自启依赖。
