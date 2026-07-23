import { BrowserWindow, screen } from 'electron'
import type { WidgetBounds } from '../shared/ipc'

/**
 * Cursor poll bridge for WorkerW (under-icon) desktop mode.
 * Uses stable locked bounds (not live getBounds) to avoid attach/detach flicker
 * when SetParent changes reported window coordinates.
 */

type Point = { x: number; y: number }

type BridgeOptions = {
  getWindow: () => BrowserWindow | null
  /** Hit-test rect in screen coordinates. */
  getHitBounds: () => WidgetBounds | null
  isArmed: () => boolean
  onEnterBounds: (pt: Point) => void
  onLeaveBounds: () => void
}

const POLL_MS = 50

function contains(bounds: WidgetBounds, pt: Point): boolean {
  return (
    pt.x >= bounds.x &&
    pt.y >= bounds.y &&
    pt.x < bounds.x + bounds.width &&
    pt.y < bounds.y + bounds.height
  )
}

export class DesktopInputBridge {
  private timer: ReturnType<typeof setInterval> | null = null
  private inside = false
  private readonly options: BridgeOptions

  constructor(options: BridgeOptions) {
    this.options = options
  }

  start(): void {
    if (process.platform !== 'win32' || this.timer) return

    this.timer = setInterval(() => {
      try {
        if (!this.options.isArmed()) {
          if (this.inside) {
            this.inside = false
          }
          return
        }

        const win = this.options.getWindow()
        if (!win || win.isDestroyed()) return

        const bounds = this.options.getHitBounds()
        if (!bounds) return

        const pt = screen.getCursorScreenPoint()
        const inBounds = contains(bounds, pt)

        if (inBounds && !this.inside) {
          this.inside = true
          this.options.onEnterBounds(pt)
        } else if (!inBounds && this.inside) {
          this.inside = false
          this.options.onLeaveBounds()
        }
      } catch (error) {
        console.error('[input-bridge] poll error:', error)
      }
    }, POLL_MS)

    console.log('[input-bridge] Cursor poll armed for WorkerW input')
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.inside = false
  }

  isInside(): boolean {
    return this.inside
  }
}
