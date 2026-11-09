# 桌宠动画素材与触发接口

本文记录 dsh-pet 桌面端（`runtime/electron-helper/sprite.js`）的动画扩展：素材规格、配置池、
点播接口、镜像翻转与转身。素材本身不进仓库（`.gitignore` 里排除了 `assets/**/*.webm`），
这里只约定名字与接入方式。

## 1. 素材规格

| 项 | 值 |
|---|---|
| 分辨率 | 1000 × 1000 |
| 帧率 | 30 fps |
| 编码 | VP9 + alpha（ffmpeg `-pix_fmt yuva420p -auto-alt-ref 0`） |
| 背景 | 全透明 |
| 构图 | 所有片段共用同一变换，可直接叠放对齐 |

### 动作（5）

| 名字 | 时长 | 循环 | 说明 |
|---|---|---|---|
| `idle_8s` | 8.0s | 是 | 呼吸 + 轻微摇摆 + 4 次眨眼 |
| `wink_3s` | 3.0s | 否 | 眨眼歪头 |
| `cute_4s` | 4.0s | 否 | 我可爱吧~ |
| `smile_3s` | 3.0s | 否 | 笑一笑吧~ |
| `swing_10s` | 10.0s | 是 | 荡秋千循环段 |

### 转身（2）

| 名字 | 时长 | 说明 |
|---|---|---|
| `turn_left` | 2.5s | 正面 → 左顾（保持）→ 回正，首尾中性 |
| `turn_right` | 2.5s | 正面 → 右顾（保持）→ 回正，首尾中性 |

转身由参数驱动渲染：`ParamAngleX`（±30 上限）、`ParamAngleZ`（歪头）、
`ParamBodyAngleZ`（身体侧倾）、`ParamEyeBallX`（视线先到）。

### 表情（12，各 2.0s）

`expr_表情回正` / `expr_墨镜` / `expr_问号` / `expr_闪耀` / `expr_星星眼` /
`expr_圈圈眼` / `expr_开心眼` / `expr_拽秋千1` / `expr_拽秋千2` /
`expr_拽秋千回正` / `expr_开` / `expr_关`

首帧都是"无表情 + 待机姿态"，从第 2 帧起渐变切入，可直接从 idle 硬切。

## 2. 配置池（`~/.dsh/dsh-pet/main-config.jsonc`）

```jsonc
"animations": {
  "idle":      ["idle_8s"],
  "turn":      ["turn_left", "turn_right"],
  "drag":      [],
  "clicks":    ["wink_3s", "cute_4s", "smile_3s", "swing_10s"],
  "moves":     { "default": { ... }, "actions": [] },
  "categories": [
    { "id": "Cyrene 表情", "weight": 20, "actions": ["expr_墨镜", "..."] }
  ],
  "events": { "balance": ["cute_4s"], "whisper": ["smile_3s"], "workStatus": ["expr_圈圈眼"] }
}
```

- `idle` / `turn` / `drag` / `clicks` / `moves.actions` 允许空数组，空池在 `playIdle()` 里有兜底
- `events` 各池**不能为空**（`animationsValid` 硬校验），且 `balance` 必须存在
- 空池不会出现在右键菜单；`events` 池即使有内容也不进菜单（`SHOW_EVENT_ANIMS_IN_MENU = false`）

改完配置后 `PUT /dsh-pet-7340/config` 会触发桌面 Helper 自动重启，无需手动重开 DSH。

## 3. 触发接口

### host 点播（聊天 / 其它插件）

```bash
curl -X POST "http://127.0.0.1:<DSH端口>/dsh-pet-7340/anim?pet=main&surface=desktop" \
  -H "content-type: application/json" -d '{"name":"expr_星星眼"}'
```

- `name` 必须在动画池里，否则 `unknown-animation`
- `surface` 必填：`web` / `desktop` / `both` / `any`
- 返回 `playbackId`，可轮询 `/playback/<id>` 看 `playing / ended / cancelled`

### 渲染端（页面内 UI）

```js
window.dshPetAnim.playExpression('墨镜');   // → expr_墨镜.webm
window.dshPetAnim.playAction('wink_3s');
window.dshPetAnim.playOneShot('turn_left');
window.dshPetAnim.playIdle();
window.dshPetAnim.current();

// 或事件方式
dispatchEvent(new CustomEvent('dsh-pet:anim', { detail: { kind: 'expression', name: '星星眼' } }));
```

`PetSprite` 上对应 `playOneShot` / `playAction` / `playExpression` / `playIdleLoop`，
一次性点播播完由 `handleEnded` 回到 `idle_8s`。

## 4. 镜像翻转

- 右键菜单「镜像翻转」→ `PetSprite.flipMirror()`
- 只给两个 `<video>` 加 `transform: scaleX(-1)`，气泡 / 提示 / 命中区 / 窗口位置都不动
- 状态写入 `localStorage['dsh-pet:facing']`，构造时 `restoreFacing()`，重启保持方向
- 也可以 `flipMirror(true)` / `flipMirror(false)` 强制朝右 / 朝左

## 5. 转身与"回头"的注意点

- `handleEnded()` **不再**因为播了 `turn` 池的动画就翻转 `facing`——真转身素材播完再镜像会转两次
- 要让宠物"左顾右盼"，需要 `turn` 池里是真正的转头素材；纯镜像（`flipMirror`）只改朝向、不改画面内容
- 鼠标跟随需要 Live2D 实时渲染，dsh-pet 桌面端只播 WebM，做不到；只能用预渲染素材替代
