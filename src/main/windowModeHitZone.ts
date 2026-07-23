import { BrowserWindow, screen } from 'electron'
import koffi from 'koffi'
import type { WidgetBounds } from '../shared/ipc'

const VK_LBUTTON = 0x01
const POLL_MS = 16

type ClientRect = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * While WorkerW-embedded, the window cannot receive clicks.
 * This watches only the "창모드" button footprint and calls enterWindow on press.
 */
export class WindowModeHitZone {
  private clientRect: ClientRect | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private prevDown = false
  private lastActivateAt = 0
  private readonly GetAsyncKeyState: (vKey: number) => number

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    /** Stable screen-space window origin while WorkerW-embedded. */
    private readonly getScreenOrigin: () => { x: number; y: number } | null,
    private readonly isArmed: () => boolean,
    private readonly onActivate: () => void
  ) {
    const user32 = koffi.load('user32.dll')
    this.GetAsyncKeyState = user32.func('GetAsyncKeyState', 'int16', ['int']) as (
      vKey: number
    ) => number
  }

  setClientRect(rect: ClientRect | null): void {
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      this.clientRect = null
      return
    }
    // Slight pad so the small icon is easier to hit through the shell layer.
    const pad = 4
    this.clientRect = {
      x: rect.x - pad,
      y: rect.y - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2
    }
  }

  start(): void {
    if (process.platform !== 'win32' || this.timer) return

    this.timer = setInterval(() => {
      try {
        if (!this.isArmed() || !this.clientRect) {
          this.prevDown = false
          return
        }

        const win = this.getWindow()
        if (!win || win.isDestroyed()) return

        const down = (this.GetAsyncKeyState(VK_LBUTTON) & 0x8000) !== 0
        const pressed = down && !this.prevDown
        this.prevDown = down
        if (!pressed) return

        const screenRect = this.toScreenRect(win, this.clientRect)
        if (!screenRect) return

        const pt = screen.getCursorScreenPoint()
        if (contains(screenRect, pt)) {
          const now = Date.now()
          if (now - this.lastActivateAt < 1000) return
          this.lastActivateAt = now
          console.log('[hit-zone] Window-mode button activated')
          this.onActivate()
        }
      } catch (error) {
        console.error('[hit-zone] poll error:', error)
      }
    }, POLL_MS)

    console.log('[hit-zone] Window-mode hit zone armed')
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.prevDown = false
    this.clientRect = null
  }

  private toScreenRect(win: BrowserWindow, client: ClientRect): WidgetBounds | null {
    try {
      // Prefer locked desktop footprint — WorkerW parenting can skew getContentBounds().
      const origin = this.getScreenOrigin() ?? win.getContentBounds()
      return {
        x: Math.round(origin.x + client.x),
        y: Math.round(origin.y + client.y),
        width: Math.round(client.width),
        height: Math.round(client.height)
      }
    } catch {
      return null
    }
  }
}

function contains(bounds: WidgetBounds, pt: { x: number; y: number }): boolean {
  return (
    pt.x >= bounds.x &&
    pt.y >= bounds.y &&
    pt.x < bounds.x + bounds.width &&
    pt.y < bounds.y + bounds.height
  )
}
