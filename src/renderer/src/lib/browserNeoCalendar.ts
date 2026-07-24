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

/**
 * Install window.neoCalendar backed by HTTP /api when running outside Electron.
 */
export function installBrowserNeoCalendar(): void {
  if (typeof window === 'undefined') return
  if (window.neoCalendar) return

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

    exportBackupZip: async () => ({ ok: false, cancelled: true }),
    importBackupZip: async () => ({ ok: false, cancelled: true }),

    addEvent: (input: EventInput) => http<CalendarEvent>('POST', '/api/events', input),
    editEvent: (id, patch) =>
      http<CalendarEvent>('PUT', `/api/events/${encodeURIComponent(id)}`, patch),
    removeEvent: async (id) => {
      await http('DELETE', `/api/events/${encodeURIComponent(id)}`)
    },
    addEventAttachments: async () => {
      throw new Error('브라우저에서는 파일 첨부를 지원하지 않습니다.')
    },
    removeEventAttachment: async () => {
      throw new Error('브라우저에서는 첨부 삭제를 지원하지 않습니다.')
    },
    openEventAttachment: async () => {
      throw new Error('브라우저에서는 첨부 파일 열기를 지원하지 않습니다.')
    },

    createCalendar: (input) => http<CalendarRecord>('POST', '/api/calendars', input),
    patchCalendar: (id, patch) =>
      http<CalendarRecord>('PATCH', `/api/calendars/${encodeURIComponent(id)}`, patch),
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

    exportCalendar: async () => ({ ok: false, canceled: true }),
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
