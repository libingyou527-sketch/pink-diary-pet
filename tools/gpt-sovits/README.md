# GPT-SoVITS 启停脚本

语音后端（`api_v2.py`，默认 `127.0.0.1:9880`）的手动控制脚本。

## 平时不需要用

`dsh-xilian-core` 插件在 `apply()` 阶段会**自动探测并静默拉起**（无窗口）：

```text
DSH 启动 → 插件加载 → 探测 9880
  ├─ 已在监听 → 日志 "already listening, skip spawn"
  └─ 没起来   → detached + windowsHide 拉起，日志 "spawned pid=..."
```

日志：`C:\Users\lby16\.dsh\xilian-tts\gpt-sovits.log`
状态：`GET http://127.0.0.1:<DSH端口>/dsh-tts-api/gsv-status`

## 空闲会自动休眠（2026-11-18 新增）

GPT-SoVITS 空闲也占 **约 1.5GB 显存 + 1.7–3.4GB 内存**，所以加了看门狗：

```text
settings.json → launcher.idleStopMinutes   默认 20 分钟（0 = 不休眠）
超过该时间没有 /dsh-tts-api/speak 请求 → 自动停掉服务
下次要用时：synthesizeGsv 先唤醒并最多等 launcher.startWaitSeconds（默认 75s）
            等不到就把这条语音降级成文字（不会卡死聊天）
另外：模型判定要发语音时，chat 路由会先悄悄唤醒服务（不阻塞回复）
```

**代价**：休眠后第一条语音大约要等 30–60 秒（模型冷启动），期间可能回退文字。
嫌慢就把 `idleStopMinutes` 调大（例如 120），或设 0 完全关掉休眠。

## 脚本

| 文件 | 作用 |
|---|---|
| `start.ps1` | 真正逻辑：端口探测 → 无窗口启动 → 轮询就绪 |
| `stop.ps1` | 按端口找 PID → 确认是 python → 杀 → 确认端口关闭 |
| `启动GPT-SoVITS.bat` | 壳，调用 `start.ps1`（失败时暂停便于看错误） |
| `停止GPT-SoVITS.bat` | 壳，调用 `stop.ps1` |

**为什么逻辑放在 .ps1**：批处理里写中文注释会被 cmd 按 GBK 解析成乱码，
其中的全角括号/逗号会被当成命令分隔符，直接把脚本搞崩。
所以 `.bat` 只有三行，`.ps1` 全部纯 ASCII。

**为什么不用 `pythonw.exe`**：pythonw 没有 stdout，uvicorn 写日志时会因为
`sys.stdout is None` 直接失败。无窗口是靠 `Start-Process -WindowStyle Hidden`
实现的（实测 `MainWindowHandle = 0`）。

## 什么时候需要手动用

| 场景 | 用哪个 |
|---|---|
| DSH 没开，但想单独跑语音服务 | `启动GPT-SoVITS.bat` |
| 想立刻释放显存（不等 20 分钟） | `停止GPT-SoVITS.bat` 或 `POST /dsh-tts-api/gsv-stop` |
| 右键菜单 | 「更多 → 语音服务 → 恢复语音 / 释放显存」 |

`start.ps1` 幂等：已在运行就只提示并退出，不会起第二份。

## 路径依赖

```text
python   D:\tools\miniconda3\envs\GPT\python.exe     （start.ps1 顶部）
仓库     D:\tools\GPT-SoVITS\GPT-SoVITS-V2ProPlus-Windows-main
```

插件的自动启动读的是另一份配置（两者要一起改）：

```text
C:\Users\lby16\.dsh\tts-gsv\settings.json → launcher.{python,repo,port,idleStopMinutes,startWaitSeconds}
```

环境变量可覆盖：`DSH_GSV_PYTHON` / `DSH_GSV_REPO` / `DSH_GSV_AUTOSTART`。
