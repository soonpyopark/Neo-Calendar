import { BrowserWindow, dialog, shell } from 'electron'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AuthService } from '../auth'
import type { DesktopModeController } from '../desktopMode'
import type { CalendarStore } from '../store/calendarStore'
import { APP_NAME, APP_VERSION } from '../appMeta'

export type NativeRequest = {
  id?: string
  method: string
  path: string
  body?: unknown
  token?: string | null
}

type RouterDeps = {
  getWindow: () => BrowserWindow | null
  store: CalendarStore
  auth: AuthService
  desktopMode: DesktopModeController
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export async function handleNativeRequest(
  deps: RouterDeps,
  request: NativeRequest
): Promise<unknown> {
  const method = (request.method || 'GET').toUpperCase()
  const path = request.path || '/'
  const body = asRecord(request.body)
  const token = request.token ?? null
  const session = token ? deps.auth.getSession(token) : null
  const win = deps.getWindow()

  // ---- health / sync ----
  if (path === '/api/health' && method === 'GET') {
    return { ok: true, name: APP_NAME, app: APP_NAME, version: APP_VERSION, platform: process.platform }
  }
  if (path === '/api/sync-info' && method === 'GET') {
    return {
      running: false,
      serverRunning: false,
      lanMode: false,
      port: null,
      addresses: [],
      platform: process.platform
    }
  }

  // ---- auth ----
  if (path === '/api/auth/session' && method === 'GET') {
    if (!session) return { authenticated: false, user: null, token: null }
    return {
      authenticated: true,
      token,
      loginId: session.loginId,
      username: session.loginId,
      role: session.role,
      isSuperAdmin: session.role === 'super_admin',
      isBootstrapAdmin: session.isBootstrapAdmin,
      user: {
        loginId: session.loginId,
        role: session.role,
        isBootstrapAdmin: session.isBootstrapAdmin
      }
    }
  }
  if (path === '/api/auth/login' && method === 'POST') {
    const identity = deps.auth.tryAuthenticate(String(body.id ?? ''), String(body.password ?? ''))
    if (!identity) {
      const err = new Error('아이디 또는 비밀번호가 올바르지 않습니다.') as Error & { status?: number }
      err.status = 401
      throw err
    }
    const newToken = deps.auth.createSession(
      Boolean(body.persistent ?? body.remember ?? body.rememberMe),
      identity
    )
    return {
      token: newToken,
      loginId: identity.loginId,
      username: identity.loginId,
      role: identity.role,
      isSuperAdmin: identity.role === 'super_admin',
      isBootstrapAdmin: identity.isBootstrapAdmin,
      authenticated: true,
      user: {
        loginId: identity.loginId,
        role: identity.role,
        isBootstrapAdmin: identity.isBootstrapAdmin
      }
    }
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    if (token) deps.auth.destroySession(token)
    return { ok: true }
  }

  // ---- members ----
  if (path === '/api/members' && method === 'GET') {
    return { members: deps.auth.listMembers() }
  }
  if (path === '/api/members' && method === 'PUT') {
    return { members: deps.auth.saveMembers(body) }
  }

  // ---- store ----
  if (path === '/api/store' && method === 'GET') {
    return deps.store.readStore()
  }
  if (path === '/api/events' && method === 'POST') {
    return deps.store.createEvent(body)
  }
  if (path.startsWith('/api/events/') && method === 'PUT') {
    const id = decodeURIComponent(path.slice('/api/events/'.length).split('/')[0])
    return deps.store.updateEvent(id, body)
  }
  if (path.startsWith('/api/events/') && path.endsWith('/attachments') && method === 'POST') {
    const id = decodeURIComponent(path.slice('/api/events/'.length, -'/attachments'.length))
    if (!win) throw new Error('Window unavailable')
    const picked = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      title: '첨부 파일 선택'
    })
    if (picked.canceled || picked.filePaths.length === 0) {
      return deps.store.readStore().events.find((e) => e.id === id) ?? null
    }
    return deps.store.addAttachments(id, picked.filePaths)
  }
  if (path.includes('/attachments/') && path.endsWith('/open') && method === 'POST') {
    const rest = path.slice('/api/events/'.length, -'/open'.length)
    const [eventId, , attachmentId] = rest.split('/')
    const filePath = deps.store.getAttachmentPath(
      decodeURIComponent(eventId),
      decodeURIComponent(attachmentId)
    )
    if (filePath) await shell.openPath(filePath)
    return { ok: true }
  }
  if (path.includes('/attachments/') && method === 'DELETE') {
    const rest = path.slice('/api/events/'.length)
    const parts = rest.split('/')
    const eventId = decodeURIComponent(parts[0])
    const attachmentId = decodeURIComponent(parts[2])
    return deps.store.removeAttachment(eventId, attachmentId)
  }
  if (path.startsWith('/api/events/') && method === 'DELETE') {
    const id = decodeURIComponent(path.slice('/api/events/'.length))
    return deps.store.deleteEvent(id)
  }

  if (path === '/api/calendars' && method === 'POST') {
    return deps.store.createCalendar(body)
  }
  if (path.startsWith('/api/calendars/') && method === 'PATCH') {
    const id = decodeURIComponent(path.slice('/api/calendars/'.length).split('/')[0])
    return deps.store.patchCalendar(id, body)
  }
  if (path.startsWith('/api/calendars/') && path.endsWith('/import') && method === 'POST') {
    const id = decodeURIComponent(
      path.slice('/api/calendars/'.length, -'/import'.length).split('/')[0]
    )
    // Merge events into target calendar via store import helper
    const events = Array.isArray(body.events) ? body.events : []
    for (const event of events) {
      const payload: Record<string, unknown> = {
        ...(event as Record<string, unknown>),
        calendarId: id
      }
      delete payload.id
      deps.store.createEvent(payload)
    }
    return deps.store.readStore()
  }
  if (path.startsWith('/api/calendars/') && path.endsWith('/events') && method === 'DELETE') {
    const id = decodeURIComponent(path.slice('/api/calendars/'.length, -'/events'.length))
    return deps.store.clearCalendarEvents(id)
  }
  if (path.startsWith('/api/calendars/') && method === 'DELETE') {
    const id = decodeURIComponent(path.slice('/api/calendars/'.length))
    return deps.store.deleteCalendar(id)
  }

  if (path === '/api/tags' && method === 'POST') {
    return deps.store.createTag(body)
  }
  if (path.startsWith('/api/tags/') && method === 'PATCH') {
    const id = decodeURIComponent(path.slice('/api/tags/'.length).split('/')[0])
    return deps.store.patchTag(id, body)
  }
  if (path.startsWith('/api/tags/') && method === 'DELETE') {
    const id = decodeURIComponent(path.slice('/api/tags/'.length))
    return deps.store.deleteTag(id)
  }

  if (path === '/api/settings' && method === 'PATCH') {
    return deps.store.patchSettings(body)
  }
  if (path === '/api/store/import' && method === 'POST') {
    return deps.store.importStore(body)
  }
  if (path === '/api/store/export-backup-zip' && method === 'POST') {
    const result = await deps.store.exportBackupZip()
    if (!win) return result
    const save = await dialog.showSaveDialog(win, {
      title: '백업 저장',
      defaultPath: result.filename,
      filters: [{ name: 'Backup', extensions: [result.type === 'zip' ? 'zip' : 'json'] }]
    })
    if (!save.canceled && save.filePath) {
      writeFileSync(save.filePath, result.buffer)
    }
    return { ok: true, path: save.filePath ?? null }
  }
  if (path === '/api/store/import-backup-zip' && method === 'POST') {
    if (!win) throw new Error('Window unavailable')
    const picked = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Backup', extensions: ['zip', 'json'] }]
    })
    if (picked.canceled || !picked.filePaths[0]) return deps.store.readStore()
    const { readFileSync } = await import('node:fs')
    return deps.store.importBackupZip(readFileSync(picked.filePaths[0]))
  }
  if (path === '/api/holidays/sync' && method === 'POST') {
    return deps.store.syncKoreanHolidays(body)
  }

  // ---- app ----
  if (path === '/api/app/open-external' && method === 'POST') {
    const url = String(body.url ?? '')
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
    return { ok: true }
  }
  if (path === '/api/app/shutdown' && method === 'POST') {
    const { app } = await import('electron')
    setTimeout(() => app.quit(), 50)
    return { ok: true }
  }

  // ---- desktop widget ----
  if (path === '/api/desktop/widget/status' && method === 'GET') {
    return deps.desktopMode.getStatus()
  }
  if (path === '/api/desktop/widget/readiness' && method === 'GET') {
    return deps.desktopMode.getReadiness()
  }
  if (path === '/api/desktop/widget/diagnostics' && method === 'GET') {
    return { ...deps.desktopMode.getStatus(), diagnostics: true }
  }
  if (
    (path === '/api/desktop/widget/apply' || path === '/api/desktop/widget/resume') &&
    method === 'POST'
  ) {
    return path.endsWith('/resume')
      ? deps.desktopMode.resume()
      : deps.desktopMode.enterDesktop()
  }
  if (
    (path === '/api/desktop/widget/edit' || path === '/api/desktop/window/show') &&
    method === 'POST'
  ) {
    return deps.desktopMode.enterWindow()
  }
  if (path === '/api/desktop/widget/suspend-ui' && method === 'POST') {
    return deps.desktopMode.suspendForUi(String(body.action ?? ''))
  }
  if (path === '/api/desktop/widget/claim-boot-suspend' && method === 'POST') {
    return deps.desktopMode.claimBootSuspend()
  }
  if (path === '/api/desktop/widget/ack-create' && method === 'POST') {
    return deps.desktopMode.ackPendingCreate()
  }
  if (path === '/api/desktop/widget/ack-ui' && method === 'POST') {
    return deps.desktopMode.ackPendingUi()
  }
  // Zones obsolete with click-through
  if (
    path.startsWith('/api/desktop/widget/') &&
    (path.includes('zone') || path.includes('ui-zones') || path.includes('create-zones') || path.includes('edit-zones'))
  ) {
    return { ok: true }
  }
  if (path === '/api/desktop/fonts/korean' && method === 'GET') {
    return { fonts: [] }
  }
  if (path === '/api/desktop/window/frame-theme' && method === 'POST') {
    return { ok: true }
  }
  if (path === '/api/desktop/window/ensure-resizable' && method === 'POST') {
    if (deps.desktopMode.getLaunchMode() === 'window') {
      win?.setResizable(true)
    }
    return { ok: true }
  }

  // ---- window chrome ----
  if (path === '/api/window/drag' && method === 'POST') {
    // Electron: -webkit-app-region handles drag in renderer; no-op here
    return { ok: true }
  }
  if (path === '/api/window/minimize' && method === 'POST') {
    win?.minimize()
    return { ok: true }
  }
  if (path === '/api/window/maximize' && method === 'POST') {
    if (!win) return { ok: true }
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return { ok: true, maximized: win.isMaximized() }
  }
  if (path === '/api/window/is-maximized' && method === 'GET') {
    return { maximized: Boolean(win?.isMaximized()) }
  }
  if (path === '/api/window/bring-to-front' && method === 'POST') {
    return deps.desktopMode.bringToFront()
  }
  if (path === '/api/window/release-foreground' && method === 'POST') {
    return deps.desktopMode.releaseForeground()
  }
  if (path === '/api/window/close' && method === 'POST') {
    win?.hide()
    return { ok: true }
  }

  // Export endpoints used by api.js fetchExport — return empty stub or store slice
  if (path.startsWith('/api/export') && method === 'GET') {
    const tmp = join(tmpdir(), `mdc-export-${Date.now()}.json`)
    writeFileSync(tmp, JSON.stringify(deps.store.readStore(), null, 2), 'utf-8')
    return { ok: true, path: tmp }
  }

  throw new Error(`Unhandled native route: ${method} ${path}`)
}
