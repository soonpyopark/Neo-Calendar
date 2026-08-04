import { createReadStream, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename } from 'node:path'
import { AuthService } from '../auth'
import type { EventAttachmentService } from '../calendarStore/eventAttachments'
import {
  contentTypeOf,
  getMultipartBoundary,
  parseMultipart,
  readRawBody
} from './multipart'

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')
  const encoded = encodeURIComponent(filename)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

function streamAttachment(
  res: ServerResponse,
  attachments: EventAttachmentService,
  eventId: string,
  attachmentId: string
): void {
  const { path: filePath, meta } = attachments.resolveFilePath(eventId, attachmentId)
  const size = statSync(filePath).size
  const mime = meta.mime || 'application/octet-stream'
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': size,
    'Content-Disposition': contentDisposition(meta.name || basename(filePath)),
    'Cache-Control': 'no-store'
  })
  createReadStream(filePath).pipe(res)
}

/**
 * Browser attachment API:
 *  POST   /api/events/:id/attachments            multipart `files` (or JSON base64)
 *  POST   /api/events/:id/attachments/copy-from  JSON `{ sourceEventId }` (deep copy files)
 *  DELETE /api/events/:id/attachments/:aid
 *  GET    /api/events/:id/attachments/:aid/file  download
 *  POST   /api/events/:id/attachments/:aid/open  download (browser-friendly)
 */
export async function tryHandleAttachmentRequest(options: {
  req: IncomingMessage
  res: ServerResponse
  path: string
  auth: AuthService
  attachments: EventAttachmentService
  onStoreMutated: () => void
}): Promise<boolean> {
  const { req, res, path, auth, attachments, onStoreMutated } = options
  const method = (req.method ?? 'GET').toUpperCase()

  const postMatch = path.match(/^\/api\/events\/([^/]+)\/attachments\/?$/)
  const copyMatch = path.match(/^\/api\/events\/([^/]+)\/attachments\/copy-from\/?$/)
  const itemMatch = path.match(
    /^\/api\/events\/([^/]+)\/attachments\/([^/]+)(?:\/(file|open))?\/?$/
  )

  if (!postMatch && !copyMatch && !itemMatch) return false

  const token = AuthService.extractToken(
    req.headers.authorization,
    headerValue(req.headers['x-admin-token'])
  )
  const user = auth.getBrowserUser(token)
  if (!user) {
    sendJson(res, 401, { ok: false, error: '로그인이 필요합니다.' })
    return true
  }

  try {
    if (postMatch && method === 'POST') {
      const eventId = decodeURIComponent(postMatch[1])
      const contentType = contentTypeOf(req)
      const boundary = getMultipartBoundary(contentType)
      let uploads: Array<{ name: string; data: Buffer; mime?: string }> = []

      if (boundary) {
        const raw = await readRawBody(req)
        const parts = parseMultipart(raw, boundary)
        uploads = parts
          .filter((p) => p.fieldName === 'files' || p.fieldName === 'file')
          .map((p) => ({ name: p.filename, data: p.data, mime: p.mime }))
      } else {
        const raw = await readRawBody(req)
        const text = raw.toString('utf8').trim()
        if (text) {
          const json = JSON.parse(text) as {
            files?: Array<{ name?: string; dataBase64?: string; mime?: string }>
          }
          uploads = (json.files ?? [])
            .filter((f) => f?.name && f?.dataBase64)
            .map((f) => ({
              name: String(f.name),
              data: Buffer.from(String(f.dataBase64), 'base64'),
              mime: f.mime
            }))
        }
      }

      if (uploads.length === 0) {
        sendJson(res, 400, { ok: false, error: '첨부할 파일이 없습니다.' })
        return true
      }

      const updated = attachments.addFromBuffers(eventId, uploads)
      onStoreMutated()
      sendJson(res, 200, updated)
      return true
    }

    if (copyMatch && method === 'POST') {
      const targetEventId = decodeURIComponent(copyMatch[1])
      const raw = await readRawBody(req)
      const text = raw.toString('utf8').trim()
      const body = text
        ? (JSON.parse(text) as { sourceEventId?: string })
        : ({} as { sourceEventId?: string })
      const sourceEventId = String(body.sourceEventId ?? '').trim()
      if (!sourceEventId) {
        sendJson(res, 400, { ok: false, error: '원본 일정 ID가 필요합니다.' })
        return true
      }
      const updated = attachments.copyBetweenEvents(sourceEventId, targetEventId)
      onStoreMutated()
      sendJson(res, 200, updated)
      return true
    }

    if (itemMatch) {
      const eventId = decodeURIComponent(itemMatch[1])
      const attachmentId = decodeURIComponent(itemMatch[2])
      const action = itemMatch[3] ?? null

      if (method === 'DELETE' && !action) {
        const updated = attachments.remove(eventId, attachmentId)
        onStoreMutated()
        sendJson(res, 200, updated)
        return true
      }

      if (
        (method === 'GET' && action === 'file') ||
        (method === 'GET' && action === 'open') ||
        (method === 'POST' && action === 'open')
      ) {
        streamAttachment(res, attachments, eventId, attachmentId)
        return true
      }
    }

    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : '첨부 처리에 실패했습니다.'
    const status = message.includes('찾을 수 없') ? 404 : 400
    sendJson(res, status, { ok: false, error: message })
    return true
  }
}
