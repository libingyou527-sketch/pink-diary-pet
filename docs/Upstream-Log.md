# 上游同步记录（dsh-pet → dsh-xilian-core）

> 目的：fork 之后**仍然能跟官方走**，而不是半年后无法合并。
> 基线：官方 `dsh-pet@0.3.8`（npm tarball）

---

## 1. 基线是怎么建的（已完成，2026-11-18）

```text
vendor 提交   8b3b075  官方 0.3.8 原样代码，放在 packages/core/ 下（只含代码，不含二进制媒体）
tag           upstream-0.3.8  ->  8b3b075
合并记录      568bcb0  git merge -s ours upstream-0.3.8
              （ours 策略：只记录共同祖先，不改动任何工作区文件）
```

效果：`git diff upstream-0.3.8 -- packages/core` 现在精确等于"我们相对官方改了什么"。

---

## 2. 当前差异快照（0.3.8 → 我们的版本）

```text
改过的文件（8）
  lib/index.js                         +2226 / -32    宿主大脑：prompt、表情、记忆、TTS、菜单
  lib/client.js                         +216 /  -8    语音播放改走 core 路由
  runtime/electron-helper/sprite.js     +160 /  -6    朝向持久化、镜像翻转、HUD 位移
  runtime/electron-helper/renderer.js   +101 /   0    壳侧渲染补充
  runtime/electron-helper/shared-core.js +94 /  -7    共享逻辑补充
  runtime/electron-helper/main.js        +25 /  -1    托盘菜单/自检补充
  package.json                           +10 / -47    改名、缩依赖、加 launcher 配置说明
  cordis.patch.yml                        +3 /  -3    插件 id 改名

我们新增的代码文件（10）
  lib/boot.js            启动探针（日志写 ~/.dsh/xilian-boot.log）
  lib/config.js          配置读写
  lib/memory-blocks.js   记忆块
  lib/memory-context.js  结构化上下文
  lib/memory-search.js   记忆检索
  lib/memory-summary.js  摘要 worker
  lib/memory-tools.js    记忆工具调用
  lib/video-storyboard.js 视频分镜
  pnpm-lock.yaml / .npmrc 依赖锁定与 peer 策略
```

媒体（`assets/`）不参与合并：我们有自己的 101 张表情；官方那 106 个 webm 是同一个占位文件复制，已删除。

---

## 3. 官方发新版时的操作流程

### 步骤 1：先看差异（只读，安全）

```bash
node scripts/upstream-diff.mjs <新版本号>
```

输出会列出：我们改过的文件（带 +/- 行数）、我们新增的代码文件、官方有而我们没有的文件。
**先看这个再决定要不要跟进**——有时候新版只是改文档。

### 步骤 2：把新版代码做成 vendor 提交

```bash
# 1) 下载并解包到临时目录（脚本会缓存 tarball 到系统临时目录）
node scripts/upstream-diff.mjs <版本> --keep
#    解包位置会打印出来，形如 %TEMP%\dsh-pet-upstream-<版本>\package

# 2) 用解包结果覆盖"只有代码"的 vendor 树
#    只复制 lib/ runtime/ src/ scripts/ package.json cordis.patch.yml LICENSE README.md
#    不要复制 assets/（二进制，不合并）
```

### 步骤 3：打 tag 并合并

```bash
git tag upstream-<版本> <vendor 提交>          # 建议在临时仓库里提交后 fetch 过来
git merge upstream-<版本>                       # 普通三方合并，此时会出冲突
```

### 步骤 4：解冲突 + 验证

```bash
node scripts/verify.mjs          # 仓库自带校验
# 重启 DSH，确认：插件加载（~/.dsh/xilian-boot.log 里 apply ok）、
# 桌宠出现、聊天正常、语音正常（GET /dsh-tts-api/gsv-status）
```

---

## 4. 冲突热点与处理策略

| 文件 | 冲突可能性 | 处理方式 |
|---|---|---|
| `lib/index.js` | **高**（我们改了 2200 行） | 官方改动通常是新功能或修 bug，按 hunk 逐段接受官方逻辑，再检查我们的改动是否仍成立。**不要整文件覆盖** |
| `lib/client.js` | 中 | 我们主要改了语音播放（走 `/dsh-tts-api/speak`）。通常可直接接受官方版本，再补回我们那几处 |
| `sprite.js` / `renderer.js` / `shared-core.js` / `main.js` | 中低 | 壳的增量很小（合计 +380）。冲突时通常"官方新版 + 重新贴我们的增量" |
| `package.json` | 中 | 官方会加依赖/改脚本。**保留我们的：name、main=lib/boot.js、dependencies 精简版、.npmrc 的 peer 策略** |
| `cordis.patch.yml` | 低 | 保留 `id/name = dsh-xilian-core` |

**红线**：壳的骨架（物理 / DPI / 指针命中 / 置顶看门狗）只增量、不改实现，否则每次同步必撞。

---

## 5. 同步登记表

| 日期 | 官方版本 | 结果 | 备注 |
|---|---|---|---|
| 2026-11-18 | 0.3.8 | 基线建立 | 含我们 +2226/-32（index.js）等 8 个文件改动 |
| — | — | — | 等官方下一次发版 |

---

## 6. 如果决定不跟进某个版本

也记一笔，写清原因（如"新版只改了余额功能的 UI，我们不需要"）。
这样半年后不会重复评估。
