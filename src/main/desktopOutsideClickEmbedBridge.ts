import type { WidgetBounds } from '../shared/ipc'
import { subscribeGlobalMouseDown, type ScreenPoint } from './globalMouseHook'

/** Ignore outside clicks briefly after unlock (mode-switch / dblclick grace). */
const ARM_GRACE_MS = 450
const REEMBED_COOLDOWN_MS = 600

type Point = { x: number; y: number }

type BridgeOptions = {
  /** Desktop mode unlocked (WorkerW detached, interactionSuspended). */
  isArmed: () => boolean
  /** App content footprint in screen DIP. */
  getAppBounds: () => WidgetBounds | null
  onEmbed: () => void
  /** True when another app's window is topmost at the click point. */
  isForeignAppAtPoint?: (pt: ScreenPoint) => boolean
}

/**
 * Unlocked desktop: click outside the calendar footprint → re-embed under icons.
 */
export class DesktopOutsideClickEmbedBridge {
  private unsubscribe: (() => void) | null = null
  private wasArmed = false
  private blockedUntil = 0
  private lastEmbedAt = 0
  private readonly options: BridgeOptions

  constructor(options: BridgeOptions) {
    this.options = options
  }

  start(): void {
    if (process.platform !== 'win32' || this.unsubscribe) return
    this.unsubscribe = subscribeGlobalMouseDown((pt, _button) => {
      this.handleMouseDown(pt)
    })
    console.log('[outside-click] outside-app click → re-embed armed')
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.wasArmed = false
    this.blockedUntil = 0
  }

  private handleMouseDown(pt: ScreenPoint): void {
    const armed = this.options.isArmed()
    if (!armed) {
      this.wasArmed = false
      return
    }

    const now = Date.now()
    if (!this.wasArmed) {
      this.wasArmed = true
      this.blockedUntil = now + ARM_GRACE_MS
    }
    if (now < this.blockedUntil) return
    if (now - this.lastEmbedAt < REEMBED_COOLDOWN_MS) return

    const bounds = this.options.getAppBounds()
    if (!bounds) return

    if (this.options.isForeignAppAtPoint?.(pt)) {
      this.lastEmbedAt = now
      console.log('[outside-click] foreign app click → re-embed', { x: pt.x, y: pt.y })
      this.options.onEmbed()
      return
    }

    if (contains(bounds, pt)) return

    this.lastEmbedAt = now
    console.log('[outside-click] click outside app → re-embed', { x: pt.x, y: pt.y, bounds })
    this.options.onEmbed()
  }
}

function contains(bounds: WidgetBounds, pt: Point, pad = 2): boolean {
  return (
    pt.x >= bounds.x - pad &&
    pt.y >= bounds.y - pad &&
    pt.x < bounds.x + bounds.width + pad &&
    pt.y < bounds.y + bounds.height + pad
  )
}
