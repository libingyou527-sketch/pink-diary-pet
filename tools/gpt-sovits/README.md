# GPT-SoVITS 启停脚本

语音后端（`127.0.0.1` 上的 `api_v2.py`，默认端口 9880）的手动控制脚本。

## 平时不需要用

`dsh-xilian-core` 插件在 `apply()` 阶段会**自动探测 9880 并静默拉起**：

```text
DSH 启动 → 插件加载 → 探测 9880
  ├─ 已在监听 → 日志写 "already listening, skip spawn"
  └─ 没起来   → detached + windowsHide 拉起，日志写 "spawned pid=..."
```

日志：`C:\Users\lby16\.dsh\xilian-tts\gpt-sovits.log`
状态：`GET http://127.0.0.1:<DSH端口>/dsh-tts-api/gsv-status`

## 什么时候需要手动用

| 场景 | 用哪个 |
|---|---|
| DSH 没开，但想单独跑语音服务 | `启动GPT-SoVITS.bat` |
| 想看模型加载过程（插件是写日志，不给窗口） | `启动GPT-SoVITS.bat` |
| 想释放显存（插件只会拉起，不会停止） | `停止GPT-SoVITS.bat` |
| 插件自动拉起失败，需要应急 | 两个都可能用到 |

`启动GPT-SoVITS.bat` 会先探测端口，已在运行就只提示并退出，不会起第二份。

## 路径依赖

两个脚本里写死了：

```text
python  D:\tools\miniconda3\envs\GPT\python.exe
仓库    D:\tools\GPT-SoVITS\GPT-SoVITS-V2ProPlus-Windows-main
```

换机器 / 换路径时，除了这两个脚本，还要同步改插件读取的配置：

```text
C:\Users\lby16\.dsh\tts-gsv\settings.json  →  launcher.python / launcher.repo / launcher.port
```

插件优先读配置文件，环境变量 `DSH_GSV_PYTHON` / `DSH_GSV_REPO` / `DSH_GSV_AUTOSTART` 可覆盖。

## 为什么脚本从桌面挪到这里

放仓库里可以跟着 git 走（改动了有记录、换机可恢复），桌面也干净。
`.gitignore` 里对 `tools/` 做了例外：只放行 `tools/gpt-sovits/`，ffmpeg 等二进制仍然不入库。
