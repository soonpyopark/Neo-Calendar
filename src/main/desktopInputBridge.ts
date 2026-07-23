import { screen } from 'electron'
import koffi from 'koffi'
import type { WidgetBounds } from '../shared/ipc'

type Point = { x: number; y: number }

type BridgeOptions = {
  isArmed: () => boolean
  isSuspended: () => boolean
  /** True while a modal/popover interaction is open (quick edit, login, etc.). */
  isBusy: () => boolean
  /**
   * After intentional desktop enter, hold wake until the cursor leaves buttons
   * so the mode switch embeds immediately without an idle wait.
   */
  shouldHoldWake: () => boolean
  noteWakeCursor: (overWakeZone: boolean) => void
  /** Screen-space zones that wake (temporarily undock) under-icons mode. */
  getEnterZones: () => WidgetBounds[]
  /** Widget footprint — click outside this while undocked → immediate re-embed. */
  getWidgetBounds: () => WidgetBounds | null
  onEnter: (pt: Point) => void
  onLeave: (pt: Point) => void
}

const POLL_MS = 20
const SUSPEND_HOLD_MS = 40
/** After undock: re-embed once mouse is idle and work is done for this long. */
const RESUME_IDLE_MS = 10_000

const VK_LBUTTON = 0x01
const VK_RBUTTON = 0x02
const VK_MBUTTON = 0x04

function contains(bounds: WidgetBounds, pt: Point): boolean {
  return (
    pt.x >= bounds.x &&
    pt.y >= bounds.y &&
    pt.x < bounds.x + bounds.width &&
    pt.y < bounds.y + bounds.height
  )
}

function overAny(zones: WidgetBounds[], pt: Point): boolean {
  return zones.some((z) => contains(z, pt))
}

/**
 * WorkerW hover bridge:
 * - Cursor over a wake button → temporary undock for real mouse input
 * - While undocked: click outside the widget → re-embed immediately
 * - While undocked: 10s idle (no mouse / no busy UI) → re-embed
 * - Date cells use a separate double-click bridge (no hover wake)
 */
export class DesktopInputBridge {
  private timer: ReturnType<typeof setInterval> | null = null
  private enterHoldMs = 0
  private idleMs = 0
  private lastPt: Point | null = null
  private prevButtonsDown = false
  private readonly GetAsyncKeyState: (vKey: number) => number
  private readonly options: BridgeOptions

  constructor(options: BridgeOptions) {
    this.options = options
    const user32 = koffi.load('user32.dll')
    this.GetAsyncKeyState = user32.func('GetAsyncKeyState', 'int16', ['int']) as (
      vKey: number
    ) => number
  }

  start(): void {
    if (process.platform !== 'win32' || this.timer) return

    this.timer = setInterval(() => {
      try {
        if (!this.options.isArmed()) {
          this.enterHoldMs = 0
          this.idleMs = 0
          this.lastPt = null
          this.prevButtonsDown = false
          return
        }

        const pt = screen.getCursorScreenPoint()
        const suspended = this.options.isSuspended()
        const zones = this.options.getEnterZones()

        const buttonsDown =
          (this.GetAsyncKeyState(VK_LBUTTON) & 0x8000) !== 0 ||
          (this.GetAsyncKeyState(VK_RBUTTON) & 0x8000) !== 0 ||
          (this.GetAsyncKeyState(VK_MBUTTON) & 0x8000) !== 0
        const pressed = buttonsDown && !this.prevButtonsDown
        this.prevButtonsDown = buttonsDown

        if (!suspended) {
          this.idleMs = 0
          this.lastPt = pt
          const overWake = zones.length > 0 && overAny(zones, pt)
          this.options.noteWakeCursor(overWake)

          // Just entered desktop via button/tray: stay embedded until cursor leaves.
          if (this.options.shouldHoldWake()) {
            this.enterHoldMs = 0
            return
          }

          if (overWake) {
            this.enterHoldMs += POLL_MS
            if (this.enterHoldMs >= SUSPEND_HOLD_MS) {
              this.enterHoldMs = 0
              this.options.onEnter(pt)
            }
          } else {
            this.enterHoldMs = 0
          }
          return
        }

        this.enterHoldMs = 0

        const widget = this.options.getWidgetBounds()
        const outside = Boolean(widget && !contains(widget, pt))

        // Click outside the program footprint → re-embed immediately.
        if (pressed && outside) {
          this.idleMs = 0
          this.options.onLeave(pt)
          return
        }

        const moved =
          !this.lastPt || this.lastPt.x !== pt.x || this.lastPt.y !== pt.y
        this.lastPt = pt

        const busy = this.options.isBusy()

        // Stay undocked while the user is moving/clicking inside or a UI task is open.
        if (busy || moved || buttonsDown) {
          this.idleMs = 0
          return
        }

        this.idleMs += POLL_MS
        if (this.idleMs >= RESUME_IDLE_MS) {
          this.idleMs = 0
          this.options.onLeave(pt)
        }
      } catch (error) {
        console.error('[input-bridge] poll error:', error)
      }
    }, POLL_MS)

    console.log('[input-bridge] Wake undock / outside-click + 10s idle resume armed')
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.enterHoldMs = 0
    this.idleMs = 0
    this.lastPt = null
    this.prevButtonsDown = false
  }
}
