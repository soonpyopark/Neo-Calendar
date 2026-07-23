import type { SetIgnoreMouseOptions } from '../shared/ipc'

declare global {
  interface Window {
    neoCalendar: {
      setIgnoreMouse: (ignore: boolean, options?: SetIgnoreMouseOptions) => void
    }
    myCalendar: Record<string, unknown>
    __myCalDesktopEmbedded?: boolean
    chrome?: {
      webview?: {
        postMessage: (message: unknown) => void
        addEventListener: (type: string, listener: (event: { data: unknown }) => void) => void
        removeEventListener: (type: string, listener: (event: { data: unknown }) => void) => void
      }
    }
  }
}

export {}
