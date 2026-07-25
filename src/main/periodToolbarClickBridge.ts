import type { WidgetBounds } from '../shared/ipc'
import { subscribeGlobalMouseDown, type ScreenPoint } from './globalMouseHook'

export type ClickForwardClientZone = {
  x: number
  y: number
  width: number
  height: number
  action: string
}

type BridgeOptions = {
  isArmed: () => boolean
  getScreenOrigin: () => { x: number; y: number } | null
  getZones: () => ClickForwardClientZone[]
  onToolbarClick: (payload: { action: string; clientX: number; clientY: number }) => void
  /** Skip when click should not reach the embedded calendar. */
  shouldProcessEmbeddedClick?: (pt: ScreenPoint) => boolean
}

const COOLDOWN_MS = 350

/**
 * WorkerW-embedded: single click on period toolbar → unlock + run action in renderer.
 */
export class PeriodToolbarClickBridge {
  private unsubscribe: (() => void) | null = null
  private lastZoneCount = -1
  private lastClickAt = 0
  private lastAction: string | null = null
  private readonly options: BridgeOptions

  constructor(options: BridgeOptions) {
    this.options = options
  }

  start(): void {
    if (process.platform !== 'win32' || this.unsubscribe) return
    this.unsubscribe = subscribeGlobalMouseDown((pt, button) => {
      if (button === 'left') this.handleMouseDown(pt)
    })
    console.log('[toolbar-click] period toolbar click → unlock armed')
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.lastZoneCount = -1
  }

  private handleMouseDown(pt: ScreenPoint): void {
    if (!this.options.isArmed()) {
      this.lastZoneCount = -1
      return
    }
    if (this.options.shouldProcessEmbeddedClick && !this.options.shouldProcessEmbeddedClick(pt)) {
      return
    }

    const zones = this.options.getZones()
    if (zones.length === 0) return
    if (zones.length !== this.lastZoneCount) {
      this.lastZoneCount = zones.length
      console.log('[toolbar-click] tracking', zones.length, 'toolbar zones')
    }

    const origin = this.options.getScreenOrigin()
    if (!origin) return

    const hit = this.hitZone(pt, origin, zones)
    if (!hit) return

    const now = Date.now()
    if (hit.action === this.lastAction && now - this.lastClickAt < COOLDOWN_MS) return
    this.lastClickAt = now
    this.lastAction = hit.action

    console.log('[toolbar-click] confirmed → unlock + action', hit.action)
    this.options.onToolbarClick({
      action: hit.action,
      clientX: hit.clientX,
      clientY: hit.clientY
    })
  }

  private hitZone(
    pt: ScreenPoint,
    origin: { x: number; y: number },
    zones: ClickForwardClientZone[]
  ): { action: string; clientX: number; clientY: number } | null {
    for (const zone of zones) {
      const screenZone: WidgetBounds = {
        x: origin.x + zone.x,
        y: origin.y + zone.y,
        width: zone.width,
        height: zone.height
      }
      if (contains(screenZone, pt)) {
        return {
          action: zone.action,
          clientX: Math.round(pt.x - origin.x),
          clientY: Math.round(pt.y - origin.y)
        }
      }
    }
    return null
  }
}

function contains(bounds: WidgetBounds, pt: ScreenPoint, pad = 2): boolean {
  return (
    pt.x >= bounds.x - pad &&
    pt.y >= bounds.y - pad &&
    pt.x < bounds.x + bounds.width + pad &&
    pt.y < bounds.y + bounds.height + pad
  )
}
