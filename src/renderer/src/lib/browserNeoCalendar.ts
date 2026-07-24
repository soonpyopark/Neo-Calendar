import type { NeoCalendarApi } from '../../../shared/ipc'
import type {
  CalendarEvent,
  CalendarRecord,
  CalendarStoreSnapshot,
  EventInput,
  MemberSaveInput,
  StoreSettings,
  TagRecord
} from '../../../shared/calendarTypes'

const TOKEN_KEY = 'neo-calendar-auth-token'
const TOKEN_KEY_SESSION = 'neo-calendar-auth-token-session'

function getToken(): string | null {
  try {
    return (
      localStorage.getItem(TOKEN_KEY) ??
      sessionStorage.getItem(TOKEN_KEY_SESSION) ??
      null
    )
  } catch {
    return null
  }
}

function setToken(token: string | null, remember: boolean): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY_SESSION)
    if (!token) return
    if (remember) localStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.setItem(TOKEN_KEY_SESSION, token)
  } catch {
    /* ignore */
  }
}

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const err =
      data && typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`
    throw new Error(err)
  }
  return data as T
}

async function httpForm<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  // Do not set Content-Type — browser sets multipart boundary.

  const res = await fetch(path, { method: 'POST', headers, body: form })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const err =
      data && typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`
    throw new Error(err)
  }
  return data as T
}

function pickLocalFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.style.display = 'none'
    const cleanup = (): void => {
      input.remove()
    }
    input.addEventListener('change', () => {
      const list = input.files ? Array.from(input.files) : []
      cleanup()
      resolve(list)
    })
    input.addEventListener('cancel', () => {
      cleanup()
      resolve([])
    })
    document.body.appendChild(input)
    input.click()
  })
}

async function findEventOrThrow(eventId: string): Promise<CalendarEvent> {
  const store = await http<CalendarStoreSnapshot>('GET', '/api/store')
  const found = store.events.find((e) => e.id === eventId)
  if (!found) throw new Error('일정을 찾을 수 없습니다.')
  return found
}

async function downloadAuthenticated(
  method: string,
  path: string,
  body?: BodyInit | null,
  contentType?: string | null
): Promise<{ blob: Blob; filename: string; attachmentFiles: number }> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (contentType) headers['Content-Type'] = contentType
  const res = await fetch(path, { method, headers, body: body ?? undefined })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const data = (await res.json()) as { error?: string }
      if (data?.error) message = data.error
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  const plainMatch = /filename="([^"]+)"/i.exec(disposition)
  const filename = utfMatch
    ? decodeURIComponent(utfMatch[1])
    : plainMatch?.[1] || 'download'
  const attachmentFiles = Number(res.headers.get('X-Attachment-Files') ?? 0) || 0
  return { blob: await res.blob(), filename, attachmentFiles }
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}

function pickSingleFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    const cleanup = (): void => input.remove()
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null
      cleanup()
      resolve(file)
    })
    input.addEventListener('cancel', () => {
      cleanup()
      resolve(null)
    })
    document.body.appendChild(input)
    input.click()
  })
}

let browserHostInstalled = false

/** True when the UI is served over HTTP (not Electron preload). */
export function isBrowserNeoCalendarHost(): boolean {
  return browserHostInstalled
}

/**
 * Install window.neoCalendar backed by HTTP /api when running outside Electron.
 */
export function installBrowserNeoCalendar(): void {
  if (typeof window === 'undefined') return
  if (window.neoCalendar) return

  browserHostInstalled = true

  const browserApi: NeoCalendarApi = {
    setIgnoreMouse: () => undefined,
    getModeStatus: async () => ({
      mode: 'window',
      embedded: false,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      switchReady: true
    }),
    enterDesktop: async () => browserApi.getModeStatus(),
    enterWindow: async () => browserApi.getModeStatus(),
    getWindowBounds: async () => ({ x: 0, y: 0, width: 0, height: 0 }),
    setWindowBounds: async () => ({ x: 0, y: 0, width: 0, height: 0 }),
    setWindowModeHitZone: () => undefined,
    setHeaderHitZone: () => undefined,
    setWakeHitZones: () => undefined,
    setClickForwardHitZones: () => undefined,
    setDayCellHitZones: () => undefined,
    setInteractionBusy: () => undefined,
    focusForTextInput: () => undefined,
    onModeChanged: () => () => undefined,
    onOpenDayQuickEdit: () => () => undefined,
    // Browser already refreshes via WebSocket → neo-store-changed.
    onStoreChanged: () => () => undefined,

    getAuth: async () => {
      const result = await http<{ user: { loginId: string; role: 'admin' } | null }>(
        'GET',
        '/api/auth/session'
      )
      return result.user
    },
    getSyncInfo: () => http('GET', '/api/sync-info'),
    login: async (loginId, password, remember) => {
      const result = await http<{
        ok: boolean
        user?: { loginId: string; role: 'admin' }
        token?: string
        error?: string
      }>('POST', '/api/auth/login', {
        loginId,
        password,
        remember: Boolean(remember)
      })
      if (!result.ok || !result.user || !result.token) {
        return { ok: false, error: result.error ?? '로그인에 실패했습니다.' }
      }
      setToken(result.token, Boolean(remember))
      return { ok: true, user: result.user }
    },
    logout: async () => {
      try {
        await http('POST', '/api/auth/logout')
      } finally {
        setToken(null, false)
      }
    },

    getSettings: async () => {
      const store = await http<CalendarStoreSnapshot>('GET', '/api/store')
      const s = store.settings
      return {
        widget: {
          launchMode: s.widget.launchMode === 'desktop' ? 'desktop' : 'window',
          bounds: { ...s.widget.bounds }
        },
        weekStartsOn: s.viewOptions.weekStartsOnSunday ? 0 : 1,
        headerOpacity: s.headerOpacity,
        shellOpacity: s.shellOpacity
      }
    },
    patchSettings: async (patch) => {
      await http('PATCH', '/api/settings', {
        headerOpacity: patch.headerOpacity,
        shellOpacity: patch.shellOpacity,
        viewOptions:
          patch.weekStartsOn === undefined
            ? undefined
            : { weekStartsOnSunday: patch.weekStartsOn === 0 },
        widget: patch.widget
      })
      return browserApi.getSettings()
    },

    getCalendarStore: () => http<CalendarStoreSnapshot>('GET', '/api/store'),
    patchStoreSettings: (patch: Partial<StoreSettings>) =>
      http<CalendarStoreSnapshot>('PATCH', '/api/settings', patch),
    replaceCalendarStore: (store) =>
      http<CalendarStoreSnapshot>('POST', '/api/store/import', store),
    importCalendarStore: (payload) =>
      http<CalendarStoreSnapshot>('POST', '/api/store/import', payload),

    exportBackupZip: async () => {
      const { blob, filename, attachmentFiles } = await downloadAuthenticated(
        'GET',
        '/api/backup/export'
      )
      triggerBrowserDownload(blob, filename)
      return { ok: true, cancelled: false, attachmentFiles }
    },
    importBackupZip: async () => {
      const file = await pickSingleFile('.zip,application/zip')
      if (!file) return { ok: true, cancelled: true }
      const form = new FormData()
      form.append('file', file, file.name)
      const result = await httpForm<{
        ok: boolean
        cancelled?: boolean
        attachmentFiles?: number
        store?: CalendarStoreSnapshot
      }>('/api/backup/import', form)
      window.dispatchEvent(new CustomEvent('neo-store-changed'))
      return {
        ok: true,
        cancelled: false,
        attachmentFiles: result.attachmentFiles ?? 0,
        store: result.store
      }
    },

    addEvent: (input: EventInput) => http<CalendarEvent>('POST', '/api/events', input),
    editEvent: (id, patch) =>
      http<CalendarEvent>('PUT', `/api/events/${encodeURIComponent(id)}`, patch),
    removeEvent: async (id) => {
      await http('DELETE', `/api/events/${encodeURIComponent(id)}`)
    },
    addEventAttachments: async (eventId) => {
      const files = await pickLocalFiles()
      if (files.length === 0) return findEventOrThrow(eventId)
      const form = new FormData()
      for (const file of files) form.append('files', file, file.name)
      return httpForm<CalendarEvent>(
        `/api/events/${encodeURIComponent(eventId)}/attachments`,
        form
      )
    },
    removeEventAttachment: (eventId, attachmentId) =>
      http<CalendarEvent>(
        'DELETE',
        `/api/events/${encodeURIComponent(eventId)}/attachments/${encodeURIComponent(attachmentId)}`
      ),
    openEventAttachment: async (eventId, attachmentId) => {
      const token = getToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/attachments/${encodeURIComponent(attachmentId)}/file`,
        { headers }
      )
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const data = (await res.json()) as { error?: string }
          if (data?.error) message = data.error
        } catch {
          /* ignore */
        }
        throw new Error(message)
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
      const plainMatch = /filename="([^"]+)"/i.exec(disposition)
      const filename = utfMatch
        ? decodeURIComponent(utfMatch[1])
        : plainMatch?.[1] || 'attachment'
      const url = URL.createObjectURL(blob)
      try {
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.rel = 'noopener'
        a.target = '_blank'
        document.body.appendChild(a)
        a.click()
        a.remove()
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      }
    },

    createCalendar: (input) => http<CalendarRecord>('POST', '/api/calendars', input),
    patchCalendar: (id, patch) =>
      http<CalendarRecord>('PATCH', `/api/calendars/${encodeURIComponent(id)}`, patch),
    reorderCalendars: async (orderedIds) => {
      const result = await http<{ ok: true; calendars: CalendarRecord[] }>(
        'PUT',
        '/api/calendars/reorder',
        { orderedIds }
      )
      return result.calendars
    },
    deleteCalendar: async (id) => {
      await http('DELETE', `/api/calendars/${encodeURIComponent(id)}`)
    },
    clearCalendarEvents: async (id) => {
      await http('DELETE', `/api/calendars/${encodeURIComponent(id)}/events`)
    },
    importEventsIntoCalendar: (id, events) =>
      http('POST', `/api/calendars/${encodeURIComponent(id)}/import`, { events }),

    setTags: (tags: TagRecord[]) => http('PUT', '/api/tags', tags),
    createTag: (input) => http('POST', '/api/tags', input),
    patchTag: (id, patch) => http('PATCH', `/api/tags/${encodeURIComponent(id)}`, patch),
    deleteTag: async (id) => {
      await http('DELETE', `/api/tags/${encodeURIComponent(id)}`)
    },

    listMembers: () => http('GET', '/api/members'),
    saveMembers: (members: MemberSaveInput[]) => http('PUT', '/api/members', members),
    syncHolidays: (input) => http('POST', '/api/holidays/sync', input ?? {}),

    exportCalendar: async (input) => {
      const { blob, filename } = await downloadAuthenticated(
        'POST',
        '/api/export',
        JSON.stringify({
          format: input.format,
          year: input.year,
          month: input.month,
          asAdmin: input.asAdmin !== false
        }),
        'application/json'
      )
      triggerBrowserDownload(blob, filename)
      return { ok: true, path: filename }
    },
    getDataRoot: async () => '',
    openExternal: async (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  window.neoCalendar = browserApi

  // Live refresh when desktop or another tab mutates the store.
  try {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as { type?: string }
        if (msg.type === 'store-changed') {
          window.dispatchEvent(new CustomEvent('neo-store-changed'))
        }
      } catch {
        /* ignore */
      }
    })
  } catch {
    /* ignore */
  }
}
