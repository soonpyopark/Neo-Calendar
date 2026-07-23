import { BrowserWindow, screen } from 'electron'
import type { CalendarStore } from './store/calendarStore'
import {
  clearWallpaperPin,
  raiseWindow,
  sendToDesktopBottom,
  setAsWallpaper
} from './wallpaper'

export type LaunchMode = 'desktop' | 'window'

export type WidgetBounds = { x: number; y: number; width: number; height: number }

export type WidgetStatus = {
  available: true
  embedded: boolean
  ready: true
  checks: Array<{ id: string; ok: boolean; label: string; detail?: string }>
  popupStyleEmbed: true
  embedSuspended: boolean
  resumeDesktopPending: boolean
  launchMode: LaunchMode
  pendingCreateDate?: string | null
  pendingEditEvent?: unknown
  pendingUiAction?: string | null
  suspendToken: number
  readiness: { ready: true; checks: unknown[] }
}

type DesktopModeOptions = {
  getWindow: () => BrowserWindow | null
  store: CalendarStore
  onModeChanged?: (mode: LaunchMode) => void
}

const DEFAULT_BOUNDS: WidgetBounds = { x: 700, y: 15, width: 1195, height: 1005 }

function snapDownTo5(value: number): number {
  return Math.floor(value / 5) * 5
}

function normalizeBounds(bounds: WidgetBounds): WidgetBounds {
  const area = screen.getPrimaryDisplay().bounds
  const width = Math.min(Math.max(200, snapDownTo5(bounds.width)), area.width)
  const height = Math.min(Math.max(150, snapDownTo5(bounds.height)), area.height)
  const maxX = area.x + Math.max(0, area.width - width)
  const maxY = area.y + Math.max(0, area.height - height)
  return {
    x: Math.min(Math.max(snapDownTo5(bounds.x), area.x), maxX),
    y: Math.min(Math.max(snapDownTo5(bounds.y), area.y), maxY),
    width,
    height
  }
}

/**
 * Desktop = locked widget bounds + always-on-bottom desktop embed + Neo click-through.
 * Window = movable/resizable app window.
 *
 * Core click-through tech (do not remove):
 *   setIgnoreMouseEvents(true, { forward: true })
 *   + renderer WallpaperContainer hit-test on interactive UI
 */
export class DesktopModeController {
  private mode: LaunchMode = 'window'
  private embedSuspended = false
  private resumeDesktopPending = false
  private suspendToken = 0
  private pendingUiAction: string | null = null
  private pendingCreateDate: string | null = null
  private raised = false
  private lockedBounds: WidgetBounds | null = null
  private readonly getWindow: () => BrowserWindow | null
  private readonly store: CalendarStore
  private readonly onModeChanged?: (mode: LaunchMode) => void

  constructor(options: DesktopModeOptions) {
    this.getWindow = options.getWindow
    this.store = options.store
    this.onModeChanged = options.onModeChanged
  }

  getLaunchMode(): LaunchMode {
    return this.mode
  }

  getStatus(): WidgetStatus {
    return {
      available: true,
      embedded: this.mode === 'desktop' && !this.embedSuspended,
      ready: true,
      checks: [{ id: 'host', ok: true, label: 'Electron 셸' }],
      popupStyleEmbed: true,
      embedSuspended: this.embedSuspended,
      resumeDesktopPending: this.resumeDesktopPending,
      launchMode: this.mode,
      pendingCreateDate: this.pendingCreateDate,
      pendingEditEvent: null,
      pendingUiAction: this.pendingUiAction,
      suspendToken: this.suspendToken,
      readiness: { ready: true, checks: [] }
    }
  }

  getReadiness() {
    return {
      ready: true,
      checks: [
        {
          id: 'host',
          ok: true,
          label: 'Electron 셸',
          detail: '창 크기 유지 바탕화면 임베드 + 클릭스루'
        }
      ]
    }
  }

  restoreFromSettings(): void {
    const settings = this.store.readStore().settings as {
      widget?: { launchMode?: string; bounds?: WidgetBounds }
    }
    if (settings?.widget?.bounds) {
      this.lockedBounds = normalizeBounds(settings.widget.bounds)
    }
    const mode = settings?.widget?.launchMode === 'desktop' ? 'desktop' : 'window'
    if (mode === 'desktop') {
      this.enterDesktop({ persist: false })
    } else {
      this.enterWindow({ persist: false })
    }
  }

  enterDesktop(options: { persist?: boolean; bounds?: WidgetBounds } = {}): WidgetStatus {
    const win = this.getWindow()
    if (!win) return this.getStatus()

    // Keep the current window footprint (MDC behavior) — never expand to full screen.
    const sourceBounds =
      options.bounds ??
      (this.mode === 'window' ? win.getBounds() : null) ??
      this.lockedBounds ??
      this.readSavedBounds() ??
      win.getBounds()

    this.lockedBounds = normalizeBounds(sourceBounds)
    this.mode = 'desktop'
    this.embedSuspended = false
    this.resumeDesktopPending = false
    this.raised = false

    win.setSkipTaskbar(true)
    win.setResizable(false)
    win.setMovable(false)
    win.setMinimizable(false)
    win.setMaximizable(false)
    win.setAlwaysOnTop(false)
    win.setHasShadow(false)
    win.setBounds(this.lockedBounds)

    // Neo core: click-through with mouse-move forwarding
    win.setIgnoreMouseEvents(true, { forward: true })

    // MDC-style desktop embed (above shell, under other apps) — not WorkerW child
    setAsWallpaper(win)
    if (!win.isVisible()) win.showInactive()
    else win.showInactive()

    if (options.persist !== false) {
      this.persistWidget({ launchMode: 'desktop', bounds: this.lockedBounds })
    }
    this.onModeChanged?.('desktop')
    return this.getStatus()
  }

  enterWindow(options: { persist?: boolean } = {}): WidgetStatus {
    const win = this.getWindow()
    if (!win) return this.getStatus()

    this.mode = 'window'
    this.embedSuspended = false
    this.resumeDesktopPending = false
    this.raised = false
    clearWallpaperPin()

    const bounds = normalizeBounds(
      this.lockedBounds ?? this.readSavedBounds() ?? win.getBounds() ?? DEFAULT_BOUNDS
    )
    this.lockedBounds = bounds

    win.setIgnoreMouseEvents(false)
    win.setSkipTaskbar(false)
    win.setResizable(true)
    win.setMovable(true)
    win.setMinimizable(true)
    win.setMaximizable(true)
    win.setAlwaysOnTop(false)
    win.setHasShadow(true)
    win.setBounds(bounds)
    if (!win.isVisible()) win.show()
    win.focus()

    if (options.persist !== false) {
      this.persistWidget({ launchMode: 'window', bounds })
    }
    this.onModeChanged?.('window')
    return this.getStatus()
  }

  suspendForUi(action?: string): WidgetStatus {
    this.suspendToken += 1
    this.pendingUiAction = action ?? null
    if (this.mode === 'desktop') {
      this.embedSuspended = true
      this.resumeDesktopPending = true
      const win = this.getWindow()
      win?.setIgnoreMouseEvents(false)
      this.bringToFront()
    }
    return this.getStatus()
  }

  resume(): WidgetStatus {
    this.embedSuspended = false
    this.resumeDesktopPending = false
    this.pendingUiAction = null
    if (this.mode === 'desktop') {
      return this.enterDesktop({
        persist: false,
        bounds: this.lockedBounds ?? undefined
      })
    }
    return this.getStatus()
  }

  claimBootSuspend(): { claimed: boolean } {
    if (this.mode === 'desktop') {
      this.suspendForUi('auth')
      return { claimed: true }
    }
    return { claimed: false }
  }

  ackPendingCreate(): { ok: true } {
    this.pendingCreateDate = null
    return { ok: true }
  }

  ackPendingUi(): { ok: true } {
    this.pendingUiAction = null
    return { ok: true }
  }

  bringToFront(): { ok: true } {
    const win = this.getWindow()
    if (!win) return { ok: true }
    this.raised = true
    clearWallpaperPin()
    raiseWindow(win)
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setIgnoreMouseEvents(false)
    win.show()
    win.focus()
    return { ok: true }
  }

  releaseForeground(): { ok: true } {
    const win = this.getWindow()
    if (!win) return { ok: true }
    this.raised = false
    win.setAlwaysOnTop(false)
    if (this.mode === 'desktop' && !this.embedSuspended) {
      if (this.lockedBounds) win.setBounds(this.lockedBounds)
      win.setIgnoreMouseEvents(true, { forward: true })
      setAsWallpaper(win)
      sendToDesktopBottom(win)
      win.showInactive()
    }
    return { ok: true }
  }

  persistWindowBounds(): void {
    const win = this.getWindow()
    if (!win) return
    const bounds = normalizeBounds(win.getBounds())
    this.lockedBounds = bounds
    // Persist in both modes so desktop↔window keeps the same footprint
    this.persistWidget({
      launchMode: this.mode,
      bounds
    })
  }

  private readSavedBounds(): WidgetBounds | null {
    const settings = this.store.readStore().settings as {
      widget?: { bounds?: WidgetBounds }
    }
    return settings?.widget?.bounds ? normalizeBounds(settings.widget.bounds) : null
  }

  private persistWidget(patch: { launchMode: LaunchMode; bounds: WidgetBounds }): void {
    const current = this.store.readStore().settings as { widget?: Record<string, unknown> }
    this.store.patchSettings({
      widget: {
        ...(current.widget ?? {}),
        ...patch,
        enabled: patch.launchMode === 'desktop'
      }
    })
  }
}
