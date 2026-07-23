import { BrowserWindow, screen } from 'electron'
import koffi from 'koffi'
import type { WidgetBounds } from '../shared/ipc'

const VK_LBUTTON = 0x01
const POLL_MS = 16

type Point = { x: number; y: number }

/**
 * While WorkerW-embedded, the HWND cannot receive mouse input.
 * This injects clicks into the renderer for the header chrome footprint
 * without detaching from WorkerW — so the window never jumps.
 */
export class HeaderClickBridge {
  private timer: ReturnType<typeof setInterval> | null = null
  private prevDown = false
  private lastClickAt = 0
  private headerHeight = 88
  private readonly GetAsyncKeyState: (vKey: number) => number

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly getFootprint: () => WidgetBounds | null,
    private readonly isArmed: () => boolean
  ) {
    const user32 = koffi.load('user32.dll')
    this.GetAsyncKeyState = user32.func('GetAsyncKeyState', 'int16', ['int']) as (
      vKey: number
    ) => number
  }

  setHeaderHeight(height: number): void {
    if (!Number.isFinite(height) || height <= 0) return
    this.headerHeight = Math.min(160, Math.max(48, Math.round(height)))
  }

  start(): void {
    if (process.platform !== 'win32' || this.timer) return

    this.timer = setInterval(() => {
      try {
        if (!this.isArmed()) {
          this.prevDown = false
          return
        }

        const win = this.getWindow()
        const footprint = this.getFootprint()
        if (!win || win.isDestroyed() || !footprint) return

        const down = (this.GetAsyncKeyState(VK_LBUTTON) & 0x8000) !== 0
        const pressed = down && !this.prevDown
        this.prevDown = down
        if (!pressed) return

        const pt = screen.getCursorScreenPoint()
        const header: WidgetBounds = {
          x: footprint.x,
          y: footprint.y,
          width: footprint.width,
          height: Math.min(this.headerHeight, footprint.height)
        }
        if (!contains(header, pt)) return

        const now = Date.now()
        if (now - this.lastClickAt < 180) return
        this.lastClickAt = now

        const clientX = Math.round(pt.x - footprint.x)
        const clientY = Math.round(pt.y - footprint.y)
        void this.injectClick(win, clientX, clientY)
      } catch (error) {
        console.error('[header-bridge] poll error:', error)
      }
    }, POLL_MS)

    console.log('[header-bridge] Header click inject armed (stay under icons)')
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.prevDown = false
  }

  private async injectClick(win: BrowserWindow, clientX: number, clientY: number): Promise<void> {
    try {
      const ok = await win.webContents.executeJavaScript(
        `(() => {
          const x = ${clientX};
          const y = ${clientY};
          const el = document.elementFromPoint(x, y);
          if (!el) return false;
          const target = el.closest('button, a, [role="button"], .interaction-ui');
          if (!(target instanceof HTMLElement)) return false;
          target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
          target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
          target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
          return true;
        })()`,
        true
      )
      if (ok) {
        console.log('[header-bridge] Injected header click', { clientX, clientY })
      }
    } catch (error) {
      console.error('[header-bridge] inject failed:', error)
    }
  }
}

function contains(bounds: WidgetBounds, pt: Point): boolean {
  return (
    pt.x >= bounds.x &&
    pt.y >= bounds.y &&
    pt.x < bounds.x + bounds.width &&
    pt.y < bounds.y + bounds.height
  )
}
