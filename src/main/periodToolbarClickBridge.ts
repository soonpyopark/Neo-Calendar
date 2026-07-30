import type { WidgetBounds } from '../shared/ipc'
import { EMBEDDED_DOUBLE_CLICK_ACTIONS } from '../shared/ipc'
import { subscribeGlobalMouseDown, type MouseButton, type ScreenPoint } from './globalMouseHook'

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
 * WorkerW-embedded: single click on period toolbar → run action in renderer (stay embedded).
 * Actions in EMBEDDED_DOUBLE_CLICK_ACTIONS require OS double-click instead.
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
      if (button === 'left' || button === 'left-dblclick') this.handleMouseDown(pt, button)
    })
    console.log('[toolbar-click] period toolbar click → embedded armed')
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.lastZoneCount = -1
  }

  private handleMouseDown(pt: ScreenPoint, button: MouseButton): void {
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

    const hit = this.hitZone(pt, origin, zones, button)
    if (!hit) return

    const needsDbl = EMBEDDED_DOUBLE_CLICK_ACTIONS.has(hit.action)
    if (needsDbl && button !== 'left-dblclick') return
    if (!needsDbl && button === 'left-dblclick') return

    const now = Date.now()
    if (hit.action === this.lastAction && now - this.lastClickAt < COOLDOWN_MS) return
    this.lastClickAt = now
    this.lastAction = hit.action

    console.log('[toolbar-click] confirmed → embedded action', hit.action)
    this.options.onToolbarClick({
      action: hit.action,
      clientX: hit.clientX,
      clientY: hit.clientY
    })
  }

  private hitZone(
    pt: ScreenPoint,
    origin: { x: number; y: number },
    zones: ClickForwardClientZone[],
    button: MouseButton
  ): { action: string; clientX: number; clientY: number } | null {
    const hits: ClickForwardClientZone[] = []
    for (const zone of zones) {
      const screenZone: WidgetBounds = {
        x: origin.x + zone.x,
        y: origin.y + zone.y,
        width: zone.width,
        height: zone.height
      }
      if (contains(screenZone, pt)) hits.push(zone)
    }
    if (hits.length === 0) return null

    // Overlapping chrome (e.g. centered title vs search): prefer dbl-click actions on
    // WM_LBUTTONDBLCLK, and skip them on single click so the real button still works.
    const preferred =
      button === 'left-dblclick'
        ? (hits.find((z) => EMBEDDED_DOUBLE_CLICK_ACTIONS.has(z.action)) ?? null)
        : (hits.find((z) => !EMBEDDED_DOUBLE_CLICK_ACTIONS.has(z.action)) ?? hits[0] ?? null)
    if (!preferred) return null

    return {
      action: preferred.action,
      clientX: Math.round(pt.x - origin.x),
      clientY: Math.round(pt.y - origin.y)
    }
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
