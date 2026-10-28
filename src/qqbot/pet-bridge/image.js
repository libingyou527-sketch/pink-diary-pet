import { randomBytes } from 'node:crypto'
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const MAX_CONCURRENCY = 3
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000
const FILE_TTL_MS = 6 * 60 * 60 * 1000

let active = 0
const waiters = []
let lastCleanup = 0

const acquire = () => new Promise((resolve) => {
  if (active < MAX_CONCURRENCY) {
    active += 1
    resolve()
    return
  }
  waiters.push(resolve)
})

const release = () => {
  const next = waiters.shift()
  if (next) next()
  else active = Math.max(0, active - 1)
}

const isImageType = (contentType) => {
  if (typeof contentType !== 'string') return false
  const type = contentType.toLowerCase()
  return type === 'image' || type.startsWith('image/') || type === 'sticker' || type === 'mface'
}

async function cleanupOldImages(dir, logger) {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  try {
    const names = await readdir(dir)
    for (const name of names) {
      const path = join(dir, name)
      try {
        const info = await stat(path)
        if (info.isFile() && now - info.mtimeMs > FILE_TTL_MS) await unlink(path)
      } catch {}
    }
  } catch {}
}

async function compressWithSharp(buffer, outPath, maxWidth, format, quality) {
  const mod = await import('sharp')
  const sharp = mod.default ?? mod
  let pipeline = sharp(buffer, { failOn: 'none' }).rotate().resize({
    width: maxWidth,
    withoutEnlargement: true,
    fit: 'inside',
  })
  if (format === 'jpeg') await pipeline.jpeg({ quality }).toFile(outPath)
  else await pipeline.webp({ quality }).toFile(outPath)
  const meta = await sharp(outPath).metadata()
  return { width: meta.width ?? null, height: meta.height ?? null, format: format === 'jpeg' ? 'jpeg' : 'webp' }
}

async function compressWithJimp(buffer, outPath, maxWidth) {
  const mod = await import('jimp')
  const Jimp = mod.Jimp ?? mod.default
  if (!Jimp || typeof Jimp.read !== 'function') throw new Error('jimp unavailable')
  const image = await Jimp.read(buffer)
  if (typeof image.resize === 'function') {
    if (image.bitmap) {
      const width = Math.min(maxWidth, image.bitmap.width)
      image.resize(width, Jimp.AUTO ?? -1)
    } else {
      image.resize({ w: maxWidth })
    }
  }
  if (typeof image.writeAsync === 'function') await image.writeAsync(outPath)
  else if (typeof image.write === 'function') await image.write(outPath)
  else throw new Error('jimp write unavailable')
  return { width: image.bitmap?.width ?? null, height: image.bitmap?.height ?? null, format: 'jpeg' }
}

/**
 * 下载 + 压缩一张 QQ 入站图片。
 * 失败会抛出；调用方负责降级成文本占位符。
 */
export async function processInboundImage(options) {
  const {
    url,
    contentType,
    filename,
    mediaDir,
    maxWidth = 800,
    timeoutMs = 5000,
    maxBytes = DEFAULT_MAX_BYTES,
    format = 'webp',
    quality = 80,
    logger,
  } = options
  if (!url || typeof url !== 'string') throw new Error('图片缺少 url')
  if (!/^https?:\/\//i.test(url)) throw new Error('不支持的图片协议')
  if (!isImageType(contentType) && !/^image\//i.test(contentType ?? '')) {
    const ext = String(filename ?? '').toLowerCase()
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(extname(ext))) throw new Error('不是图片附件')
  }
  await acquire()
  try {
    await mkdir(mediaDir, { recursive: true })
    await cleanupOldImages(mediaDir, logger)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('图片处理超时')), timeoutMs)
    const started = Date.now()
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'dsh-qqbot/0.5.2' },
        redirect: 'follow',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('图片下载失败：HTTP ' + response.status)
      const length = Number(response.headers.get('content-length') || 0)
      if (length > maxBytes) throw new Error('图片超过大小上限')
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength === 0) throw new Error('图片为空')
      if (buffer.byteLength > maxBytes) throw new Error('图片超过大小上限')

      const useJpeg = format === 'jpeg'
      const ext = useJpeg ? 'jpg' : 'webp'
      let outPath = join(mediaDir, 'inbound-' + Date.now() + '-' + randomBytes(4).toString('hex') + '.' + ext)
      let meta
      try {
        meta = await compressWithSharp(buffer, outPath, maxWidth, useJpeg ? 'jpeg' : 'webp', quality)
      } catch (sharpError) {
        logger?.warn?.('[pet-bridge] sharp failed, falling back to jimp: ' + (sharpError instanceof Error ? sharpError.message : String(sharpError)))
        const jimpPath = outPath.replace(/\.webp$/i, '.jpg')
        try { await unlink(outPath) } catch {}
        try {
          meta = await compressWithJimp(buffer, jimpPath, maxWidth)
          outPath = jimpPath
        } catch (jimpError) {
          try { await unlink(jimpPath) } catch {}
          throw new Error('图片压缩失败：' + (jimpError instanceof Error ? jimpError.message : String(jimpError)))
        }
      }
      if (Date.now() - started > timeoutMs) throw new Error('图片处理超时')
      const info = await stat(outPath)
      return {
        path: outPath,
        width: meta?.width ?? null,
        height: meta?.height ?? null,
        format: meta?.format ?? (useJpeg ? 'jpeg' : 'webp'),
        bytes: info.size,
      }
    } finally {
      clearTimeout(timer)
    }
  } finally {
    release()
  }
}
