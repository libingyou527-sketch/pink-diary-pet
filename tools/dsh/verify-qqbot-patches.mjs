#!/usr/bin/env node
/**
 * 校验 qqbot 的本地补丁是否还在。
 *
 * 背景：`@tencent-connect/dsh-qqbot` 被本地改过三处（petMode 路由 / GSV 语音管线 /
 * pet-bridge 转发服务），这些改动靠 profile 的 patchedDependencies 重放
 * （patches/@tencent-connect__dsh-qqbot@0.5.2.patch）。
 *
 * 任何一次 pnpm install、插件更新或手动重装都可能让补丁丢失，且不会报错——
 * 表现是「QQ 消息突然不走桌宠了」或「QQ 没语音了」。本脚本用标记字符串确认。
 *
 * 用法：
 *   node tools/dsh/verify-qqbot-patches.mjs            # 详细
 *   node tools/dsh/verify-qqbot-patches.mjs --quiet     # 只在失败时输出
 *   node tools/dsh/verify-qqbot-patches.mjs --dir <path> # 指定包目录（默认读 profile）
 *
 * 退出码：0 = 补丁完整；1 = 有缺失（会打印修复提示）。
 */
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_DIR = join(
  homedir(),
  '.dsh',
  'profiles',
  'desktop',
  'node_modules',
  '@tencent-connect',
  'dsh-qqbot',
)

/** 每个文件里必须出现的标记；缺失任意一个就说明补丁没打上。 */
const CHECKS = [
  {
    file: 'dist/config.js',
    markers: ['petMode', 'petId', 'petWsPort'],
    why: 'petMode 配置项（决定 QQ 消息是否交给桌宠）',
  },
  {
    file: 'dist/gateway/middleware-setup.js',
    markers: ['petMode'],
    why: 'petMode 的中间件接管',
  },
  {
    file: 'dist/gateway/bootstrap.js',
    markers: ['petMode', 'readGsvSettings', 'synthesizePetVoice', 'maybeSendPetVoice', 'readPetHostOrigin'],
    why: 'petMode 分支 + GPT-SoVITS 语音管线 + 宿主优先路由',
  },
  {
    file: 'dist/pet-bridge/server.js',
    markers: ['token'],
    why: 'pet-bridge WebSocket 服务',
  },
  {
    file: 'dist/pet-bridge/memory.js',
    markers: ['export'],
    why: 'pet-bridge 记忆读写',
  },
  {
    file: 'dist/pet-bridge/image.js',
    markers: ['export'],
    why: 'pet-bridge 图片处理',
  },
]

function parseArgs(argv) {
  const out = { quiet: false, dir: DEFAULT_DIR }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--quiet') out.quiet = true
    else if (arg === '--dir' && argv[i + 1]) {
      out.dir = argv[i + 1]
      i += 1
    } else if (arg === '--help' || arg === '-h') {
      console.log('用法: node tools/dsh/verify-qqbot-patches.mjs [--quiet] [--dir <包目录>]')
      process.exit(0)
    }
  }
  return out
}

const { quiet, dir } = parseArgs(process.argv.slice(2))

if (!existsSync(dir)) {
  console.error(`✗ 找不到 qqbot 包目录：${dir}`)
  console.error('  如果插件没装，先安装；如果路径不同，用 --dir 指定。')
  process.exit(1)
}

const failures = []

for (const check of CHECKS) {
  const file = join(dir, check.file)
  if (!existsSync(file)) {
    failures.push({ ...check, missing: ['<文件不存在>'] })
    continue
  }
  const text = readFileSync(file, 'utf8')
  const missing = check.markers.filter((marker) => !text.includes(marker))
  if (missing.length > 0) failures.push({ ...check, missing })
}

if (failures.length === 0) {
  if (!quiet) {
    console.log(`✓ qqbot 补丁完整（${CHECKS.length} 个文件全部命中）`)
    console.log(`  包目录：${dir}`)
  }
  process.exit(0)
}

console.error('✗ qqbot 补丁缺失——QQ 桌宠接管或语音会失效')
console.error(`  包目录：${dir}`)
for (const failure of failures) {
  console.error(`  · ${failure.file}`)
  console.error(`      缺失标记：${failure.missing.join(', ')}`)
  console.error(`      作用：${failure.why}`)
}
console.error('')
console.error('修复方式（任选）：')
console.error('  1) 在 profile 目录执行 pnpm install —— patchedDependencies 会自动重放补丁')
console.error('  2) 手动重打：git apply patches/@tencent-connect__dsh-qqbot@0.5.2.patch')
console.error('  3) 若版本已变（不是 0.5.2），先按 docs/Qqbot-Patches.md 重新生成补丁')
process.exit(1)
