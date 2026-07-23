import { contextBridge, ipcRenderer } from 'electron'
import type { SetIgnoreMouseOptions } from '../shared/ipc'

type NativePayload = {
  id?: string
  method: string
  path: string
  body?: unknown
  token?: string | null
}

const webviewListeners = new Set<(data: unknown) => void>()

function getAuthToken(): string | null {
  try {
    return (
      localStorage.getItem('my-calendar-auth-token') ??
      sessionStorage.getItem('my-calendar-auth-token') ??
      null
    )
  } catch {
    return null
  }
}

async function nativeApi(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await ipcRenderer.invoke('native-request', {
    method,
    path,
    body: body ?? null,
    token: getAuthToken()
  } satisfies NativePayload)

  if (!response?.ok) {
    throw new Error(response?.error || 'Native bridge error')
  }
  return response.result ?? null
}

function getPageWindow(): Window & typeof globalThis {
  return globalThis as unknown as Window & typeof globalThis
}

function dispatchWidgetStatus(detail: Record<string, unknown> | null | undefined): void {
  try {
    const page = getPageWindow()
    page.__myCalDesktopEmbedded = Boolean(detail?.embedded)
    page.document?.documentElement?.classList.toggle('desktop-embedded', Boolean(detail?.embedded))
    page.dispatchEvent(new CustomEvent('mycalendar:widgetStatusChanged', { detail }))
  } catch {
    /* ignore */
  }
}

const myCalendar = {
  __source: 'electron',
  getSyncInfo: async () => nativeApi('GET', '/api/sync-info'),
  getWidgetStatus: async () => {
    const data = (await nativeApi('GET', '/api/desktop/widget/status')) as Record<string, unknown>
    dispatchWidgetStatus(data)
    return data
  },
  getDesktopReadiness: async () => nativeApi('GET', '/api/desktop/widget/readiness'),
  enterWidgetEditMode: async () => {
    const result = (await nativeApi('POST', '/api/desktop/widget/edit')) as Record<string, unknown>
    dispatchWidgetStatus(result)
    return result
  },
  showWindow: async () => {
    const result = (await nativeApi(
      'POST',
      '/api/desktop/window/show'
    )) as Record<string, unknown>
    dispatchWidgetStatus(result)
    return result
  },
  applyWidgetToDesktop: async () => {
    const result = (await nativeApi(
      'POST',
      '/api/desktop/widget/apply'
    )) as Record<string, unknown>
    dispatchWidgetStatus(result)
    return result
  },
  resumeDesktopEmbed: async () => {
    const result = (await nativeApi(
      'POST',
      '/api/desktop/widget/resume'
    )) as Record<string, unknown>
    dispatchWidgetStatus(result)
    return result
  },
  ackPendingCreate: async () => nativeApi('POST', '/api/desktop/widget/ack-create'),
  ackPendingUiAction: async () => nativeApi('POST', '/api/desktop/widget/ack-ui'),
  suspendDesktopEmbedForUi: async (action?: string) => {
    const result = (await nativeApi('POST', '/api/desktop/widget/suspend-ui', {
      action,
      surface: 'app'
    })) as Record<string, unknown>
    dispatchWidgetStatus(result)
    return result
  },
  claimBootSuspendForAuth: async () =>
    nativeApi('POST', '/api/desktop/widget/claim-boot-suspend'),
  setUiActionZones: async () => null,
  clearUiActionZones: async () => null,
  setCreateEventZones: async () => null,
  clearCreateEventZones: async () => null,
  setEditEventZones: async () => null,
  clearEditEventZones: async () => null,
  setUndockZone: async () => null,
  clearUndockZone: async () => null,
  requestAppShutdown: async () => {
    await nativeApi('POST', '/api/app/shutdown')
  },
  beginWindowDrag: () => {
    void nativeApi('POST', '/api/window/drag')
  },
  minimizeWindow: () => {
    void nativeApi('POST', '/api/window/minimize')
  },
  toggleWindowMaximize: () => {
    void nativeApi('POST', '/api/window/maximize')
  },
  closeWindow: () => {
    void nativeApi('POST', '/api/window/close')
  },
  bringWindowToFront: () => nativeApi('POST', '/api/window/bring-to-front'),
  releaseWindowForeground: () => nativeApi('POST', '/api/window/release-foreground'),
  isWindowMaximized: async () => {
    const data = (await nativeApi('GET', '/api/window/is-maximized')) as { maximized?: boolean }
    return Boolean(data?.maximized)
  },
  setWindowFrameTheme: async () => true,
  ensureWindowResizable: async () => {
    const data = (await nativeApi('POST', '/api/desktop/window/ensure-resizable')) as {
      ok?: boolean
    }
    return Boolean(data?.ok)
  },
  publishViewNav: () => false,
  openExternal: async (url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return
    await nativeApi('POST', '/api/app/open-external', { url })
  },
  showAbout: async () => {
    let appTitle = 'My Desktop Calendar v1.1.9'
    try {
      const data = (await nativeApi('GET', '/api/health')) as {
        name?: string
        version?: string
        app?: string
      }
      if (data?.name && data?.version) appTitle = `${data.name} v${data.version}`
      else if (data?.app && data?.version) appTitle = `${data.app} v${data.version}`
    } catch {
      /* default */
    }
    getPageWindow().alert(`${appTitle}\nhttps://note4all.tistory.com`)
  }
}

const neoCalendar = {
  setIgnoreMouse: (ignore: boolean, options: SetIgnoreMouseOptions = { forwardToOverlay: true }) => {
    ipcRenderer.send('set-ignore-mouse', ignore, options)
  }
}

/** WebView2-compatible shim so existing nativeHost.js keeps working. */
const chromeWebview = {
  postMessage: (message: unknown) => {
    const data = message as NativePayload & { type?: string }
    if (data?.type === 'view-nav') return

    if (data?.method && data?.path) {
      const id = data.id || `bridge-${Date.now()}`
      void ipcRenderer
        .invoke('native-request', {
          id,
          method: data.method,
          path: data.path,
          body: data.body ?? null,
          token: data.token ?? getAuthToken()
        })
        .then((response) => {
          const payload = response?.ok
            ? { type: 'response', id, ok: true, result: response.result ?? null }
            : { type: 'response', id, ok: false, error: response?.error || 'Native bridge error' }
          for (const listener of webviewListeners) {
            try {
              listener(payload)
            } catch {
              /* ignore */
            }
          }
        })
    }
  },
  addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => {
    const wrapped = (data: unknown): void => {
      listener({ data })
    }
    ;(listener as unknown as { __wrapped?: (data: unknown) => void }).__wrapped = wrapped
    webviewListeners.add(wrapped)
  },
  removeEventListener: (_type: string, listener: (event: { data: unknown }) => void) => {
    const wrapped = (listener as unknown as { __wrapped?: (data: unknown) => void }).__wrapped
    if (wrapped) webviewListeners.delete(wrapped)
  }
}

const nativeEventListeners = new Set<(data: unknown) => void>()

ipcRenderer.on('widget-status', (_event, status) => {
  dispatchWidgetStatus(status)
  const event = { type: 'widget-status', status }
  for (const listener of webviewListeners) {
    listener(event)
  }
  for (const listener of nativeEventListeners) {
    try {
      listener(event)
    } catch {
      /* ignore */
    }
  }
})

ipcRenderer.on('native-event', (_event, data) => {
  for (const listener of nativeEventListeners) {
    try {
      listener(data)
    } catch {
      /* ignore */
    }
  }
})

/** Reliable Electron IPC bridge used by renderer nativeHost.js */
const neoNative = {
  request: async (
    method: string,
    path: string,
    body?: unknown,
    token?: string | null
  ): Promise<unknown> => {
    const response = await ipcRenderer.invoke('native-request', {
      method,
      path,
      body: body ?? null,
      token: token ?? null
    } satisfies NativePayload)

    if (!response?.ok) {
      throw new Error(response?.error || 'Native bridge error')
    }
    return response.result ?? null
  },
  onEvent: (listener: (data: unknown) => void): (() => void) => {
    nativeEventListeners.add(listener)
    return () => {
      nativeEventListeners.delete(listener)
    }
  }
}

contextBridge.exposeInMainWorld('myCalendar', myCalendar)
contextBridge.exposeInMainWorld('neoCalendar', neoCalendar)
contextBridge.exposeInMainWorld('neoNative', neoNative)
// Best-effort WebView2-compatible shim (may be ignored if `chrome` is reserved)
try {
  contextBridge.exposeInMainWorld('chrome', { webview: chromeWebview })
} catch {
  /* Chromium may reserve window.chrome — neoNative covers the API path */
}

declare global {
  interface Window {
    myCalendar: typeof myCalendar
    neoCalendar: typeof neoCalendar
    neoNative: typeof neoNative
    __myCalDesktopEmbedded?: boolean
    chrome?: { webview: typeof chromeWebview }
  }
}

export {}
