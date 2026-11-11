import { randomBytes } from 'node:crypto'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { WebSocketServer } from 'ws'

const PENDING_TTL_MS = 5 * 60 * 1000
const MAX_QUEUE = 200

/**
 * 本地 WebSocket 桥：
 * - dsh-qqbot 把 QQ 消息作为 receive_qq_msg 发给桌宠；
 * - 桌宠用 send_to_qq 回传；
 * - 服务端只按 message_id 查原始 reply target，不信任桌宠传来的地址。
 */
export class PetBridge {
  constructor(options) {
    this.host = options.host || '127.0.0.1'
    this.basePort = Number(options.port) || 9527
    this.portCount = Number(options.portCount) || 10
    this.discoveryPath = options.discoveryPath
    this.logger = options.logger || console
    this.sendReply = options.sendReply
    this.onSent = options.onSent
    this.token = randomBytes(24).toString('hex')
    this.server = null
    this.port = null
    this.client = null
    this.queue = []
    this.pending = new Map()
    this.sweepTimer = null
  }

  async start() {
    for (let i = 0; i < this.portCount; i += 1) {
      const port = this.basePort + i
      try {
        await this.listen(port)
        this.port = port
        break
      } catch (error) {
        if (error?.code !== 'EADDRINUSE') throw error
      }
    }
    if (!this.port) throw new Error('没有可用端口：' + this.basePort + '-' + (this.basePort + this.portCount - 1))
    await mkdir(dirname(this.discoveryPath), { recursive: true })
    const temp = this.discoveryPath + '.tmp'
    await writeFile(temp, JSON.stringify({
      port: this.port,
      token: this.token,
      pid: process.pid,
      startedAt: Date.now()
    }, null, 2), 'utf8')
    await rename(temp, this.discoveryPath)
    this.sweepTimer = setInterval(() => this.sweep(), 30_000)
    this.logger.info?.(`[pet-bridge] listening ws://${this.host}:${this.port}/pet`)
    return this.port
  }

  listen(port) {
    return new Promise((resolve, reject) => {
      const server = new WebSocketServer({
        host: this.host,
        port,
        verifyClient: (info, callback) => {
          try {
            const url = new URL(info.req.url || '/', 'http://127.0.0.1')
            const allowed = url.pathname === '/pet' && url.searchParams.get('token') === this.token
            callback(allowed, allowed ? 200 : 401, allowed ? 'OK' : 'Unauthorized')
          } catch {
            callback(false, 400, 'Bad Request')
          }
        }
      })
      const onError = (error) => {
        server.off('listening', onListening)
        try { server.close() } catch {}
        reject(error)
      }
      const onListening = () => {
        server.off('error', onError)
        this.server = server
        this.bind(server)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
    })
  }

  bind(server) {
    server.on('connection', (ws) => {
      if (this.client && this.client !== ws) {
        try { this.client.close() } catch {}
      }
      this.client = ws
      this.logger.info?.('[pet-bridge] dsh-pet connected')
      this.send(ws, { action: 'hello', bridge: 'dsh-qqbot', ts: Date.now() })
      this.flush()
      ws.on('message', (data) => {
        let packet
        try { packet = JSON.parse(data.toString('utf8')) } catch { return }
        if (!packet || typeof packet !== 'object') return
        if (packet.action === 'send_to_qq') {
          void this.handleSend(ws, packet)
        } else if (packet.action === 'ready') {
          this.logger.info?.('[pet-bridge] dsh-pet ready: ' + String(packet.pet_id ?? packet.petId ?? 'main'))
        }
      })
      ws.on('close', () => {
        if (this.client === ws) this.client = null
        this.logger.warn?.('[pet-bridge] dsh-pet disconnected')
      })
      ws.on('error', (error) => {
        this.logger.warn?.('[pet-bridge] client error: ' + (error instanceof Error ? error.message : String(error)))
      })
    })
    server.on('error', (error) => {
      this.logger.error?.('[pet-bridge] server error: ' + (error instanceof Error ? error.message : String(error)))
    })
  }

  track(messageId, target, context) {
    if (!messageId) return
    this.pending.set(String(messageId), {
      target,
      context,
      expiresAt: Date.now() + PENDING_TTL_MS
    })
  }

  enqueue(packet) {
    if (this.client && this.client.readyState === 1) {
      this.send(this.client, packet)
      return
    }
    this.queue.push(packet)
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE)
    this.logger.warn?.('[pet-bridge] dsh-pet offline; queued ' + packet?.context?.message_id)
  }

  send(ws, packet) {
    try {
      if (ws.readyState === 1) ws.send(JSON.stringify(packet))
    } catch (error) {
      this.logger.warn?.('[pet-bridge] send failed: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  flush() {
    if (!this.client || this.client.readyState !== 1) return
    const pending = this.queue.splice(0)
    for (const packet of pending) this.send(this.client, packet)
  }

  async handleSend(ws, packet) {
    const context = packet.context && typeof packet.context === 'object' ? packet.context : {}
    const messageId = String(context.message_id ?? '')
    const pending = this.pending.get(messageId)
    if (!pending) {
      this.send(ws, { action: 'error', message_id: messageId, error: 'unknown or expired message_id' })
      return
    }
    if (pending.context?.conversation_id && context.conversation_id && pending.context.conversation_id !== context.conversation_id) {
      this.send(ws, { action: 'error', message_id: messageId, error: 'conversation mismatch' })
      return
    }
    if (pending.expiresAt < Date.now()) {
      this.pending.delete(messageId)
      this.send(ws, { action: 'error', message_id: messageId, error: 'message expired' })
      return
    }
    const text = String(packet.text ?? '').trim()
    const emojiPath = String(packet.emojiPath ?? '').trim()
    if (!text && !emojiPath) {
      this.send(ws, { action: 'error', message_id: messageId, error: 'empty text' })
      return
    }
    try {
      await this.sendReply(pending.target, text, emojiPath)
      await this.onSent?.(pending.context, text)
      this.pending.delete(messageId)
      this.send(ws, { action: 'ack', message_id: messageId, ok: true })
      this.logger.info?.('[pet-bridge] QQ reply sent for ' + messageId)
    } catch (error) {
      this.logger.error?.('[pet-bridge] QQ reply failed for ' + messageId + ': ' + (error instanceof Error ? error.message : String(error)))
      this.send(ws, { action: 'error', message_id: messageId, error: error instanceof Error ? error.message : String(error) })
    }
  }

  sweep() {
    const now = Date.now()
    for (const [messageId, pending] of this.pending) {
      if (pending.expiresAt < now) this.pending.delete(messageId)
    }
  }

  async stop() {
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    this.sweepTimer = null
    try { this.client?.close() } catch {}
    this.client = null
    if (this.server) {
      await new Promise((resolve) => {
        try { this.server.close(() => resolve()) } catch { resolve() }
      })
    }
    this.server = null
    try { await unlink(this.discoveryPath) } catch {}
  }
}
