import { screen } from 'electron'
import koffi from 'koffi'
import type { WidgetBounds } from '../shared/ipc'

const VK_LBUTTON = 0x01
const POLL_MS = 16
const DBLCLICK_MS = 450
/** Ignore repeat opens of the same day; switching to another day is always allowed. */
const COOLDOWN_MS = 250

export type DayCellClientZone = {
  x: number
  y: number
  width: number
  height: number
  dateKey: string
}

type Point = { x: number; y: number }

type BridgeOptions = {
  isArmed: () => boolean
  getScreenOrigin: () => { x: number; y: number } | null
  getZones: () => DayCellClientZone[]
  onDoubleClick: (payload: { dateKey: string; clientX: number; clientY: number }) => void
}

/**
 * While WorkerW-embedded, date cells cannot receive real mouse input.
 * Detect a left-button double-press over a published day-cell zone and
 * ask the app to undock + open the quick editor (no hover wake).
 */
export class DayCellDblClickBridge {
  private timer: ReturnType<typeof setInterval> | null = null
  private prevDown = false
  private lastPress: { dateKey: string; at: number } | null = null
  private lastOpenAt = 0
  private lastOpenedKey: string | null = null
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
          this.prevDown = false
          this.lastPress = null
          return
        }

        const zones = this.options.getZones()
        if (zones.length === 0) {
          this.prevDown = false
          return
        }

        const origin = this.options.getScreenOrigin()
        if (!origin) return

        const down = (this.GetAsyncKeyState(VK_LBUTTON) & 0x8000) !== 0
        const pressed = down && !this.prevDown
        this.prevDown = down
        if (!pressed) return

        const pt = screen.getCursorScreenPoint()
        const hit = zones.find((z) =>
          contains(
            {
              x: origin.x + z.x,
              y: origin.y + z.y,
              width: z.width,
              height: z.height
            },
            pt
          )
        )
        if (!hit) {
          this.lastPress = null
          return
        }

        const now = Date.now()
        if (
          hit.dateKey === this.lastOpenedKey &&
          now - this.lastOpenAt < COOLDOWN_MS
        ) {
          return
        }

        const prev = this.lastPress
        if (prev && prev.dateKey === hit.dateKey && now - prev.at <= DBLCLICK_MS) {
          this.lastPress = null
          this.lastOpenAt = now
          this.lastOpenedKey = hit.dateKey
          const clientX = Math.round(pt.x - origin.x)
          const clientY = Math.round(pt.y - origin.y)
          console.log('[day-dblclick] Open / retarget quick edit', hit.dateKey)
          this.options.onDoubleClick({
            dateKey: hit.dateKey,
            clientX,
            clientY
          })
          return
        }

        this.lastPress = { dateKey: hit.dateKey, at: now }
      } catch (error) {
        console.error('[day-dblclick] poll error:', error)
      }
    }, POLL_MS)

    console.log('[day-dblclick] Day-cell double-click bridge armed')
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.prevDown = false
    this.lastPress = null
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
