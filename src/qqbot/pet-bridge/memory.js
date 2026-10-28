import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * QQ 专用记忆：与 dsh-pet 的 memory.json 完全隔离。
 * 结构：
 * { version: 1, conversations: { "c2c:xxx": { scope, targetId, updatedAt, messages: [...] } } }
 */
export class QqMemory {
  constructor(filePath, options = {}) {
    this.filePath = filePath
    this.limit = Number(options.limit) || 1000
    this.logger = options.logger
    this.data = null
    this.writeQueue = Promise.resolve()
  }

  async load() {
    if (this.data) return this.data
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || !parsed.conversations) throw new Error('bad memory shape')
      this.data = parsed
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.logger?.warn?.('[pet-bridge] qq memory unreadable, starting empty: ' + (error instanceof Error ? error.message : String(error)))
      }
      this.data = { version: 1, conversations: {} }
    }
    return this.data
  }

  async getHistory(conversationId, limit = 1000) {
    await this.load()
    const conversation = this.data.conversations[conversationId]
    const messages = Array.isArray(conversation?.messages) ? conversation.messages : []
    return messages.slice(-Math.max(0, Number(limit) || 1000)).map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.text ?? ''),
    })).filter((message) => message.content.trim() !== '')
  }

  async append(conversationId, entry, meta) {
    await this.load()
    const current = this.data.conversations[conversationId] || (this.data.conversations[conversationId] = {
      scope: meta?.scope ?? '',
      targetId: meta?.targetId ?? '',
      updatedAt: 0,
      messages: [],
    })
    current.scope = meta?.scope ?? current.scope
    current.targetId = meta?.targetId ?? current.targetId
    current.updatedAt = Date.now()
    current.messages.push(entry)
    if (current.messages.length > this.limit) current.messages.splice(0, current.messages.length - this.limit)
    await this.save()
  }

  save() {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      const temp = this.filePath + '.tmp'
      await writeFile(temp, JSON.stringify(this.data, null, 2), 'utf8')
      await rename(temp, this.filePath)
    }).catch((error) => {
      this.logger?.warn?.('[pet-bridge] qq memory save failed: ' + (error instanceof Error ? error.message : String(error)))
    })
    return this.writeQueue
  }
}
