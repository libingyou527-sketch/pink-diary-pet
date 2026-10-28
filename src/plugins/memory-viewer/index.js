import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Package name doubles as the plugin row name and the client module id. */
export const name = 'dsh-pet-memory-viewer'

/** The route is served by the Host web server and read by the browser panel. */
const ROUTE = '/dsh-pet-memory'

/** The file the dsh-pet plugin writes its long-term chat memory to. */
const MEMORY_FILE = join(homedir(), '.dsh', 'dsh-pet', 'memory.json')

/**
 * Answer one JSON response. The panel treats `ok: false` as data, not as a
 * transport failure, so a missing file renders as a readable card.
 */
function reply(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  if (res.req?.method === 'HEAD') res.end()
  else res.end(JSON.stringify(body))
}

/** Host half: publish the memory file as read-only JSON on the local server. */
export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: ROUTE,
          handler: async (req, res) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
              reply(res, 405, { ok: false, error: 'method-not-allowed' })
              return
            }
            try {
              const [raw, info] = await Promise.all([readFile(MEMORY_FILE, 'utf8'), stat(MEMORY_FILE)])
              let data
              try {
                data = JSON.parse(raw)
              } catch (error) {
                reply(res, 200, {
                  ok: false,
                  path: MEMORY_FILE,
                  mtime: info.mtimeMs,
                  error: 'invalid-json',
                  detail: String(error?.message ?? error),
                })
                return
              }
              reply(res, 200, {
                ok: true,
                path: MEMORY_FILE,
                mtime: info.mtimeMs,
                size: info.size,
                data,
              })
            } catch (error) {
              reply(res, 200, {
                ok: false,
                path: MEMORY_FILE,
                error: error?.code === 'ENOENT' ? 'missing' : 'read-failed',
                detail: String(error?.message ?? error),
              })
            }
          },
        }),
      'dsh-pet-memory: memory route',
    )
  })
}
