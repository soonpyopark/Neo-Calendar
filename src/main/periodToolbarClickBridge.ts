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
/** Fallback if GetDoubleClickTime is unavailable. */
const DEFAULT_DBLCLICK_MS = 500
/** Second click may jitter over desktop icons above WorkerW. */
const CLICK_JITTER_PX = 48

/**
 * WorkerW-embedded: single click on period toolbar → run action in renderer (stay embedded).
 * Actions in EMBEDDED_DOUBLE_CLICK_ACTIONS need two left clicks (same as day-cell bridge);
 * WH_MOUSE_LL often never sees WM_LBUTTONDBLCLK.
 */
export class PeriodToolbarClickBridge {
  private unsubscribe: (() => void) | null = null
  private lastZoneCount = -1
  private lastClickAt = 0
  private lastAction: string | null = null
  private lastPress: { action: string; at: number; x: number; y: number } | null = null
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
    this.lastPress = null
  }

  private handleMouseDown(pt: ScreenPoint, button: MouseButton): void {
    if (!this.options.isArmed()) {
      this.lastZoneCount = -1
      this.lastPress = null
      return
    }
    if (this.options.shouldProcessEmbeddedClick && !this.options.shouldProcessEmbeddedClick(pt)) {
      this.lastPress = null
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

    const now = Date.now()
    const dblWindow = DEFAULT_DBLCLICK_MS

    if (button === 'left-dblclick') {
      const hit = this.hitZone(pt, origin, zones, 'left-dblclick')
      if (!hit || !EMBEDDED_DOUBLE_CLICK_ACTIONS.has(hit.action)) {
        this.lastPress = null
        return
      }
      this.confirmAction(hit)
      return
    }

    // Prefer single-click zones when they overlap dbl-click-only titles.
    const singleHit = this.hitZone(pt, origin, zones, 'left')
    if (singleHit && !EMBEDDED_DOUBLE_CLICK_ACTIONS.has(singleHit.action)) {
      this.lastPress = null
      if (singleHit.action === this.lastAction && now - this.lastClickAt < COOLDOWN_MS) return
      this.confirmAction(singleHit)
      return
    }

    let dblHit = this.hitZone(pt, origin, zones, 'left-dblclick')
    const prev = this.lastPress
    if (
      !dblHit &&
      prev &&
      EMBEDDED_DOUBLE_CLICK_ACTIONS.has(prev.action) &&
      now - prev.at <= dblWindow &&
      Math.hypot(pt.x - prev.x, pt.y - prev.y) <= CLICK_JITTER_PX
    ) {
      dblHit = {
        action: prev.action,
        clientX: Math.round(pt.x - origin.x),
        clientY: Math.round(pt.y - origin.y)
      }
    }

    if (!dblHit || !EMBEDDED_DOUBLE_CLICK_ACTIONS.has(dblHit.action)) {
      this.lastPress = null
      return
    }

    if (prev && prev.action === dblHit.action && now - prev.at <= dblWindow) {
      this.confirmAction(dblHit)
      return
    }

    this.lastPress = { action: dblHit.action, at: now, x: pt.x, y: pt.y }
    console.log('[toolbar-click] first click recorded', dblHit.action)
  }

  private confirmAction(hit: { action: string; clientX: number; clientY: number }): void {
    const now = Date.now()
    if (hit.action === this.lastAction && now - this.lastClickAt < COOLDOWN_MS) {
      this.lastPress = null
      return
    }
    this.lastPress = null
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

    // Overlapping chrome: prefer dbl-click actions when pairing / on WM_LBUTTONDBLCLK;
    // on plain left prefer single-click actions so normal toolbar buttons still win.
    const preferred =
      button === 'left-dblclick'
        ? (hits.find((z) => EMBEDDED_DOUBLE_CLICK_ACTIONS.has(z.action)) ??
          hits.find((z) => !EMBEDDED_DOUBLE_CLICK_ACTIONS.has(z.action)) ??
          null)
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
