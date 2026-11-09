import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { readFileSync } from 'node:fs'

/** Package name doubles as the plugin row name and the client module id. */
export const name = 'xu-pink-diary'

const ROUTE = '/xu-diary'

function resolveDiaryDir() {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  const configFile = join(dshHome, 'dsh-pet', 'pink-diary-pet.json')
  try {
    const parsed = JSON.parse(readFileSync(configFile, 'utf8'))
    if (typeof parsed.diaryDir === 'string' && parsed.diaryDir.trim()) return parsed.diaryDir.trim()
  } catch {}
  return process.env.PINK_DIARY_DIR || join(dshHome, 'pink-diary')
}

const DIARY_DIR = resolveDiaryDir()

const MAX_BODY_BYTES = 512 * 1024
const MAX_CONTENT_CHARS = 20000
const AUTHORS = new Set(['絮', '你'])
const ID_PATTERN = /^(?:\d{8}-\d{6}(?:-\d+)?|\d{4}-\d{2}-\d{2})\.md$/

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  if (res.req?.method === 'HEAD') res.end()
  else res.end(JSON.stringify(body))
}

async function readBody(req) {
  let total = 0
  const chunks = []
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function localIso(date = new Date()) {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

function fileStamp(date = new Date()) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

function parseFront(raw) {
  const text = String(raw ?? '').replace(/^\uFEFF/, '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(text)
  if (!match) return { meta: {}, content: text.replace(/^\s+/, '').trimEnd() }
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(':')
    if (at <= 0) continue
    const key = line.slice(0, at).trim()
    const value = line.slice(at + 1).trim()
    if (key) meta[key] = value
  }
  return { meta, content: text.slice(match[0].length).replace(/^\s+/, '').trimEnd() }
}

async function ensureDir() {
  await mkdir(DIARY_DIR, { recursive: true })
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function listEntries() {
  await ensureDir()
  const names = await readdir(DIARY_DIR)
  const entries = []
  for (const id of names) {
    if (!id.toLowerCase().endsWith('.md')) continue
    const file = join(DIARY_DIR, id)
    let raw
    let info
    try {
      ;[raw, info] = await Promise.all([readFile(file, 'utf8'), stat(file)])
    } catch {
      continue
    }
    const { meta, content } = parseFront(raw)
    const parsed = Date.parse(meta.date ?? '')
    entries.push({
      id,
      date: Number.isNaN(parsed) ? info.mtime.toISOString() : new Date(parsed).toISOString(),
      author: AUTHORS.has(meta.author) ? meta.author : '絮',
      content,
      bytes: info.size,
    })
  }
  entries.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || b.id.localeCompare(a.id))
  return entries
}

async function createEntry({ content, author }) {
  const text = String(content ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (text === '') throw new Error('日记内容为空')
  if (text.length > MAX_CONTENT_CHARS) throw new Error(`日记内容过长（最多 ${MAX_CONTENT_CHARS} 字）`)
  const who = AUTHORS.has(author) ? author : '你'
  const now = new Date()
  const iso = localIso(now)
  await ensureDir()
  const base = fileStamp(now)
  let id = `${base}.md`
  let attempt = 2
  while (await exists(join(DIARY_DIR, id))) {
    id = `${base}-${attempt++}.md`
    if (attempt > 99) throw new Error('无法生成日记文件名')
  }
  const body = `---\ndate: ${iso}\nauthor: ${who}\n---\n\n${text}\n`
  const file = join(DIARY_DIR, id)
  const temp = join(DIARY_DIR, `.${id}.tmp`)
  await writeFile(temp, body, 'utf8')
  await rename(temp, file)
  return { id, date: iso, author: who, content: text, bytes: Buffer.byteLength(body, 'utf8') }
}

async function deleteEntry(id) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error('无效的日记 id')
  await ensureDir()
  try {
    await unlink(join(DIARY_DIR, id))
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('这篇日记不存在')
    throw error
  }
  return id
}

/** Host half: read and write the diary folder, and expose it over HTTP. */
export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'prefix',
          path: ROUTE,
          handler: async (req, res) => {
            try {
              const url = new URL(req.url ?? '/', 'http://localhost')
              const path = url.pathname

              if (path === `${ROUTE}/entries` && req.method === 'GET') {
                const entries = await listEntries()
                return sendJson(res, 200, { ok: true, dir: DIARY_DIR, entries })
              }

              if (path === `${ROUTE}/entries` && req.method === 'POST') {
                const body = JSON.parse((await readBody(req)) || 'null') ?? {}
                const entry = await createEntry({ content: body.content, author: body.author })
                return sendJson(res, 200, { ok: true, dir: DIARY_DIR, entry })
              }

              if (path === `${ROUTE}/delete` && req.method === 'POST') {
                const body = JSON.parse((await readBody(req)) || 'null') ?? {}
                const id = await deleteEntry(body.id)
                return sendJson(res, 200, { ok: true, id })
              }

              if (path === `${ROUTE}/health` && req.method === 'GET') {
                await ensureDir()
                return sendJson(res, 200, { ok: true, dir: DIARY_DIR })
              }

              return sendJson(res, 404, { ok: false, error: 'not-found' })
            } catch (error) {
              return sendJson(res, 200, { ok: false, error: String(error?.message ?? error) })
            }
          },
        }),
      'xu-pink-diary: diary route',
    )
  })
}
