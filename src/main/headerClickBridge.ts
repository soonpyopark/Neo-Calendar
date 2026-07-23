import { BrowserWindow, screen } from 'electron'
import koffi from 'koffi'
import type { ClientHitRect, WidgetBounds } from '../shared/ipc'

const VK_LBUTTON = 0x01
const POLL_MS = 16
const CLICK_DEBOUNCE_MS = 180
const ZONE_PAD = 3

type Point = { x: number; y: number }

/**
 * While WorkerW-embedded, the HWND cannot receive mouse input.
 * Injects clicks into published period/toolbar zones without undocking —
 * so 연/주/월/nav/오늘/internet/eye/check keep the calendar under icons.
 */
export class HeaderClickBridge {
  private timer: ReturnType<typeof setInterval> | null = null
  private prevDown = false
  private lastClickAt = 0
  private clientZones: ClientHitRect[] = []
  private readonly GetAsyncKeyState: (vKey: number) => number

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    /** Stable screen-space window origin while WorkerW-embedded. */
    private readonly getScreenOrigin: () => { x: number; y: number } | null,
    private readonly isArmed: () => boolean
  ) {
    const user32 = koffi.load('user32.dll')
    this.GetAsyncKeyState = user32.func('GetAsyncKeyState', 'int16', ['int']) as (
      vKey: number
    ) => number
  }

  setClientZones(zones: ClientHitRect[] | null | undefined): void {
    if (!Array.isArray(zones)) {
      this.clientZones = []
      return
    }
    this.clientZones = zones
      .filter((z) => z && z.width > 0 && z.height > 0)
      .map((z) => ({
        x: Math.round(z.x),
        y: Math.round(z.y),
        width: Math.round(z.width),
        height: Math.round(z.height)
      }))
  }

  start(): void {
    if (process.platform !== 'win32' || this.timer) return

    this.timer = setInterval(() => {
      try {
        if (!this.isArmed() || this.clientZones.length === 0) {
          this.prevDown = false
          return
        }

        const win = this.getWindow()
        if (!win || win.isDestroyed()) return

        const down = (this.GetAsyncKeyState(VK_LBUTTON) & 0x8000) !== 0
        const pressed = down && !this.prevDown
        this.prevDown = down
        if (!pressed) return

        const origin = this.getScreenOrigin() ?? win.getContentBounds()
        const pt = screen.getCursorScreenPoint()
        const clientX = Math.round(pt.x - origin.x)
        const clientY = Math.round(pt.y - origin.y)

        const hit = this.clientZones.some((zone) =>
          contains(
            {
              x: zone.x - ZONE_PAD,
              y: zone.y - ZONE_PAD,
              width: zone.width + ZONE_PAD * 2,
              height: zone.height + ZONE_PAD * 2
            },
            { x: clientX, y: clientY }
          )
        )
        if (!hit) return

        const now = Date.now()
        if (now - this.lastClickAt < CLICK_DEBOUNCE_MS) return
        this.lastClickAt = now

        void this.injectClick(win, clientX, clientY)
      } catch (error) {
        console.error('[header-bridge] poll error:', error)
      }
    }, POLL_MS)

    console.log('[header-bridge] Stay-embedded click inject armed')
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.prevDown = false
    this.clientZones = []
  }

  private async injectClick(win: BrowserWindow, clientX: number, clientY: number): Promise<void> {
    try {
      const ok = await win.webContents.executeJavaScript(
        `(() => {
          const x = ${clientX};
          const y = ${clientY};
          const el = document.elementFromPoint(x, y);
          if (!el) return false;
          const root = el.closest('[data-shell-chrome="period-header"]') || document.body;
          const target = el.closest('button, a, [role="button"]');
          if (!(target instanceof HTMLElement) || !root.contains(target)) return false;
          if (target instanceof HTMLButtonElement && target.disabled) return false;
          if (target.getAttribute('aria-disabled') === 'true') return false;
          const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
          target.dispatchEvent(new PointerEvent('pointerdown', opts));
          target.dispatchEvent(new MouseEvent('mousedown', opts));
          target.dispatchEvent(new MouseEvent('mouseup', opts));
          target.dispatchEvent(new MouseEvent('click', opts));
          return true;
        })()`,
        true
      )
      if (ok) {
        console.log('[header-bridge] Injected embed click', { clientX, clientY })
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
