import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import { networkInterfaces } from 'node:os'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { WebSocketServer, type WebSocket } from 'ws'
import { getEnvValue } from '../dotEnv'
import { AuthService } from '../auth'
import type { CalendarStore } from '../calendarStore/CalendarStore'
import type { MembersStore } from '../calendarStore/membersStore'
import { handleApiRequest } from './apiRouter'
import {
  isClientIpAllowed,
  isHostAllowed,
  isLoopbackOnlyHosts,
  normalizeClientIp,
  parseAllowedHosts
} from './ipAccess'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
}

export type WebServerSyncInfo = {
  running: boolean
  port: number | null
  hostname: string | null
  lanMode: boolean
  addresses: string[]
}

export type CalendarWebServerOptions = {
  auth: AuthService
  calendarStore: CalendarStore
  membersStore: MembersStore
  /** Production static root (`out/renderer`). */
  getWwwroot: () => string
  /** Dev Vite origin, e.g. http://localhost:5173 */
  getViteOrigin: () => string | null
}

export class CalendarWebServer {
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private readonly sockets = new Set<WebSocket>()
  port = 0
  hostname = '127.0.0.1'
  lanMode = false
  addresses: string[] = []
  private allowedHosts: string[] = ['127.0.0.1', 'localhost']

  constructor(private readonly options: CalendarWebServerOptions) {}

  get isRunning(): boolean {
    return this.server !== null && this.server.listening
  }

  getSyncInfo(): WebServerSyncInfo {
    return {
      running: this.isRunning,
      port: this.isRunning ? this.port : null,
      hostname: this.isRunning ? this.hostname : null,
      lanMode: this.isRunning ? this.lanMode : false,
      addresses: this.isRunning ? [...this.addresses] : []
    }
  }

  /**
   * MDC StartWebServerOnLaunch / tray Start Server.
   * @param mode local = loopback hosts; lan = 0.0.0.0 + ALLOWED_HOSTS=*
   */
  async tryStart(options?: {
    mode?: 'local' | 'lan' | 'env'
    requirePortInEnv?: boolean
  }): Promise<{ ok: boolean; message: string }> {
    if (this.isRunning) {
      return { ok: false, message: 'HTTP server is already running.' }
    }

    const requirePort = options?.requirePortInEnv === true
    const portRaw = getEnvValue('PORT', 'MYCALENDAR_PORT', 'NEOCALENDAR_PORT')
    let port = portRaw ? Number.parseInt(portRaw, 10) : NaN
    if (!Number.isFinite(port) || port <= 0) {
      if (requirePort) {
        return { ok: false, message: 'PORT not set — HTTP server skipped.' }
      }
      port = 3010
    }

    const mode = options?.mode ?? 'env'
    let hostname =
      getEnvValue('HOSTNAME', 'MYCALENDAR_HOSTNAME', 'NEOCALENDAR_HOSTNAME') ?? '127.0.0.1'
    hostname = hostname.trim()
    if (!hostname || hostname === 'localhost') hostname = '127.0.0.1'

    let allowedHosts = parseAllowedHosts(
      getEnvValue('ALLOWED_HOSTS', 'MYCALENDAR_ALLOWED_HOSTS', 'NEOCALENDAR_ALLOWED_HOSTS')
    )

    if (mode === 'local') {
      hostname = '127.0.0.1'
      allowedHosts = ['127.0.0.1', 'localhost']
    } else if (mode === 'lan') {
      hostname = '0.0.0.0'
      allowedHosts = ['*']
    } else {
      // env launch: MDC ResolveLaunchServerMode
      if (hostname === '0.0.0.0' || hostname === '*' || hostname === '+') {
        allowedHosts = ['*']
      } else {
        allowedHosts = ['127.0.0.1', 'localhost']
      }
    }

    const loopbackOnly = isLoopbackOnlyHosts(allowedHosts)
    this.port = port
    this.hostname = hostname
    this.lanMode = (hostname === '0.0.0.0' || hostname === '*' || hostname === '+') && !loopbackOnly
    this.allowedHosts = allowedHosts
    this.addresses = loopbackOnly
      ? [`http://127.0.0.1:${port}/`]
      : buildAddressList(hostname, port)

    const server = createServer((req, res) => {
      void this.handleRequest(req, res)
    })

    // Bind wildcard for LAN; loopback-only for local mode.
    const listenHost = this.lanMode ? '0.0.0.0' : '127.0.0.1'
    this.server = server
    this.wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (req, socket, head) => {
      const url = req.url ?? ''
      if (!url.startsWith('/ws')) {
        socket.destroy()
        return
      }
      if (!this.gateRequest(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      this.wss?.handleUpgrade(req, socket, head, (ws) => {
        this.sockets.add(ws)
        ws.on('close', () => this.sockets.delete(ws))
      })
    })

    const modeLabel = this.lanMode ? 'LAN' : 'local'
    const aclHint = this.lanMode
      ? `관리자 PowerShell에서 URL ACL이 필요할 수 있습니다:\nnetsh http add urlacl url=http://+:${port}/ user=Everyone`
      : '다른 프로그램이 포트를 사용 중이거나 권한이 없습니다.'

    return await new Promise((resolve) => {
      const onError = (err: Error): void => {
        console.warn('[web-server] listen failed', err)
        this.server = null
        this.wss = null
        this.port = 0
        this.addresses = []
        resolve({
          ok: false,
          message: `HTTP listen failed (${err.message}). ${aclHint}`
        })
      }
      const onListening = (): void => {
        server.off('error', onError)
        console.log(
          `[web-server] Started (${modeLabel}) on port ${port}: ${this.addresses.join(', ')}`
        )
        resolve({
          ok: true,
          message: `HTTP server started (${modeLabel}) — ${this.addresses[0] ?? `port ${port}`}`
        })
      }
      server.once('error', onError)
      server.once('listening', onListening)
      try {
        server.listen(port, listenHost)
      } catch (err) {
        server.off('error', onError)
        server.off('listening', onListening)
        this.server = null
        this.wss = null
        const message = err instanceof Error ? err.message : String(err)
        resolve({
          ok: false,
          message: `HTTP listen failed (${message}). ${aclHint}`
        })
      }
    })
  }

  stop(): { ok: boolean; message: string } {
    if (!this.isRunning) {
      return { ok: false, message: 'HTTP server is not running.' }
    }
    for (const ws of this.sockets) {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
    this.sockets.clear()
    this.wss?.close()
    this.wss = null
    const server = this.server
    this.server = null
    server?.close()
    this.port = 0
    this.addresses = []
    console.log('[web-server] Stopped')
    return { ok: true, message: 'HTTP server stopped.' }
  }

  broadcastStoreChanged(): void {
    const payload = JSON.stringify({ type: 'store-changed' })
    for (const ws of this.sockets) {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(payload)
        } catch {
          /* ignore */
        }
      }
    }
  }

  private gateRequest(req: IncomingMessage): boolean {
    if (!isHostAllowed(req.headers.host, this.allowedHosts)) return false
    const ip = normalizeClientIp(req.socket.remoteAddress)
    const allowed = this.options.calendarStore.getSnapshot().settings.allowedIpCidrs
    return isClientIpAllowed(ip, allowed)
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      applyCors(res)
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (!this.gateRequest(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: 'Forbidden' }))
        return
      }

      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      const path = url.pathname

      if (path.startsWith('/api/')) {
        const body = await readJsonBody(req)
        const token = AuthService.extractToken(
          req.headers.authorization,
          headerValue(req.headers['x-admin-token'])
        )
        const result = await handleApiRequest(
          {
            auth: this.options.auth,
            calendarStore: this.options.calendarStore,
            membersStore: this.options.membersStore,
            getSyncInfo: () => this.getSyncInfo(),
            onStoreMutated: () => this.broadcastStoreChanged()
          },
          req.method ?? 'GET',
          path,
          body,
          token,
          req
        )
        res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(result.body))
        return
      }

      const vite = this.options.getViteOrigin()
      if (vite) {
        await proxyToVite(req, res, vite)
        return
      }

      await serveStatic(req, res, this.options.getWwwroot(), path)
    } catch (err) {
      console.warn('[web-server] request failed', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(
          JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : 'Internal error'
          })
        )
      }
    }
  }
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function applyCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Token'
  )
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const method = (req.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'DELETE') return null
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return null
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function proxyToVite(
  req: IncomingMessage,
  res: ServerResponse,
  viteOrigin: string
): Promise<void> {
  const target = new URL(req.url ?? '/', viteOrigin)
  const lib = target.protocol === 'https:' ? httpsRequest : httpRequest
  await new Promise<void>((resolve) => {
    const proxyReq = lib(
      target,
      {
        method: req.method,
        headers: {
          ...req.headers,
          host: target.host
        }
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
        proxyRes.pipe(res)
        proxyRes.on('end', () => resolve())
      }
    )
    proxyReq.on('error', (err) => {
      console.warn('[web-server] vite proxy failed', err)
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Vite proxy failed')
      }
      resolve()
    })
    req.pipe(proxyReq)
  })
}

async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  wwwroot: string,
  pathname: string
): Promise<void> {
  const root = normalize(wwwroot)
  let rel = decodeURIComponent(pathname)
  if (rel === '/' || rel === '') rel = '/index.html'
  const candidate = normalize(join(root, rel.replace(/^\//, '')))
  if (!candidate.startsWith(root + sep) && candidate !== root) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  let filePath = candidate
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA fallback
    filePath = join(root, 'index.html')
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const ext = extname(filePath).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
  createReadStream(filePath).pipe(res)
}

function buildAddressList(hostname: string, port: number): string[] {
  const urls = new Set<string>()
  urls.add(`http://127.0.0.1:${port}/`)
  if (hostname === '0.0.0.0' || hostname === '*' || hostname === '+') {
    for (const nets of Object.values(networkInterfaces())) {
      for (const net of nets ?? []) {
        if (net.family !== 'IPv4' || net.internal) continue
        urls.add(`http://${net.address}:${port}/`)
      }
    }
  } else if (hostname !== '127.0.0.1') {
    urls.add(`http://${hostname}:${port}/`)
  }
  return [...urls]
}

/** Resolve launch mode from .env (MDC ResolveLaunchServerMode). */
export function resolveLaunchServerMode(): 'local' | 'lan' {
  const hostname = (
    getEnvValue('HOSTNAME', 'MYCALENDAR_HOSTNAME', 'NEOCALENDAR_HOSTNAME') ?? '127.0.0.1'
  ).trim()
  if (hostname === '0.0.0.0' || hostname === '*' || hostname === '+') return 'lan'
  return 'local'
}
