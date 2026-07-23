import { BrowserWindow } from 'electron'
import { DEFAULT_WIDGET_BOUNDS } from '../shared/constants'
import type { LaunchMode, ModeStatus, WidgetBounds } from '../shared/ipc'
import type { SettingsStore } from './settingsStore'
import { centerOnCursorDisplay, normalizeBoundsToDisplay } from './displayGeometry'
import { clearWallpaperPin, isWorkerEmbedded, setAsWallpaper } from './wallpaper'
import { focusWindowForTextInput } from './windowFocus'

type DesktopModeOptions = {
  getWindow: () => BrowserWindow | null
  store: SettingsStore
  onModeChanged?: (status: ModeStatus) => void
}

function normalizeBounds(bounds: WidgetBounds): WidgetBounds {
  return normalizeBoundsToDisplay(bounds)
}

/**
 * Desktop = locked footprint + shell-bottom overlay + Neo click-through.
 * Window = normal movable/resizable app window.
 */
export class DesktopModeController {
  private mode: LaunchMode = 'window'
  private lockedBounds: WidgetBounds | null = null
  private modeSwitchAllowed = true
  private switchGateGeneration = 0
  private switchGateTimer: ReturnType<typeof setTimeout> | null = null
  private switchGatePoll: ReturnType<typeof setInterval> | null = null
  private inputLockedUntil = 0
  private inputUnlockTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * Temporary undock from WorkerW so header / UI can receive mouse.
   * Idle desktop mode always returns to under-icons (principle #1).
   */
  private interactionSuspended = false
  /**
   * After intentional desktop enter (button/tray), stay embedded even if the
   * cursor is still over a wake button — clear once the cursor leaves wake zones.
   */
  private wakeHoldUntilLeave = false
  /**
   * After cold-start window restore, ignore non-forced enterDesktop briefly.
   * Prevents a cursor sitting on the desktop-mode button from burying the UI.
   */
  private blockDesktopEnterUntil = 0
  /** Client-space wake zones (header/period buttons) from renderer. */
  private wakeClientZones: WidgetBounds[] = []
  /** Fallback strip height until renderer publishes wake zones. */
  private headerHitHeight = 120
  private readonly getWindow: () => BrowserWindow | null
  private readonly store: SettingsStore
  private readonly onModeChanged?: (status: ModeStatus) => void

  constructor(options: DesktopModeOptions) {
    this.getWindow = options.getWindow
    this.store = options.store
    this.onModeChanged = options.onModeChanged
  }

  lockInput(ms: number): void {
    this.inputLockedUntil = Math.max(this.inputLockedUntil, Date.now() + ms)
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(true)
    }
    if (this.inputUnlockTimer) clearTimeout(this.inputUnlockTimer)
    this.inputUnlockTimer = setTimeout(() => {
      this.inputUnlockTimer = null
      this.releaseInputWhenSafe()
    }, ms + 20)
  }

  private releaseInputWhenSafe(): void {
    const current = this.getWindow()
    if (!current || current.isDestroyed()) return
    if (Date.now() < this.inputLockedUntil) return

    if (this.mode === 'window') {
      current.setIgnoreMouseEvents(false)
      current.setAlwaysOnTop(false)
      current.show()
      current.focus()
      current.moveTop()
    } else {
      // WorkerW: ignore-mouse has little effect; keep forward for overlay fallback.
      current.setIgnoreMouseEvents(true, { forward: true })
    }
  }

  isInputLocked(): boolean {
    return Date.now() < this.inputLockedUntil
  }

  /**
   * Short fixed debounce only — do not wait for cursor to leave the header
   * (that felt like buttons were "stuck" after hit-zone / mode clicks).
   */
  private armModeSwitchGate(ms = 280): void {
    this.modeSwitchAllowed = false
    this.switchGateGeneration += 1
    const generation = this.switchGateGeneration

    if (this.switchGateTimer) clearTimeout(this.switchGateTimer)
    if (this.switchGatePoll) {
      clearInterval(this.switchGatePoll)
      this.switchGatePoll = null
    }

    this.onModeChanged?.(this.getStatus())

    this.switchGateTimer = setTimeout(() => {
      if (generation !== this.switchGateGeneration) return
      this.modeSwitchAllowed = true
      console.log('[desktop] Mode switch ready')
      this.onModeChanged?.(this.getStatus())
    }, ms)
  }

  private blurRendererChrome(): void {
    const win = this.getWindow()
    if (!win || win.isDestroyed()) return
    void win.webContents
      .executeJavaScript(
        `(() => { try { document.activeElement instanceof HTMLElement && document.activeElement.blur(); } catch {} })()`,
        true
      )
      .catch(() => undefined)
  }

  getLaunchMode(): LaunchMode {
    return this.mode
  }

  isWorkerEmbedded(): boolean {
    return this.mode === 'desktop' && isWorkerEmbedded() && !this.interactionSuspended
  }

  isInteractionSuspended(): boolean {
    return this.interactionSuspended
  }

  /** True right after button/tray desktop enter while cursor still on a wake control. */
  shouldHoldWake(): boolean {
    return this.wakeHoldUntilLeave
  }

  /** Clear post-enter wake hold once the cursor is outside wake buttons. */
  noteWakeCursor(overWakeZone: boolean): void {
    if (this.wakeHoldUntilLeave && !overWakeZone) {
      this.wakeHoldUntilLeave = false
    }
  }

  getStatus(): ModeStatus {
    return {
      mode: this.mode,
      embedded: this.isWorkerEmbedded(),
      bounds: this.lockedBounds ?? this.store.getWidgetBounds(),
      switchReady: this.modeSwitchAllowed
    }
  }

  setHeaderHitHeight(height: number): void {
    if (!Number.isFinite(height) || height <= 0) return
    this.headerHitHeight = Math.min(220, Math.max(48, Math.round(height)))
  }

  setWakeClientZones(zones: WidgetBounds[]): void {
    this.wakeClientZones = zones
      .filter((z) => z.width > 0 && z.height > 0)
      .map((z) => ({
        x: Math.round(z.x),
        y: Math.round(z.y),
        width: Math.round(z.width),
        height: Math.round(z.height)
      }))
  }

  /** Screen-space zones that temporarily undock for real mouse input. */
  getWakeScreenZones(): WidgetBounds[] {
    const origin = this.lockedBounds
    if (!origin) return []

    if (this.wakeClientZones.length > 0) {
      return this.wakeClientZones.map((z) => ({
        x: origin.x + z.x,
        y: origin.y + z.y,
        width: z.width,
        height: z.height
      }))
    }

    // Fallback: top chrome + period row strip.
    return [
      {
        x: origin.x,
        y: origin.y,
        width: origin.width,
        height: Math.min(this.headerHitHeight, origin.height)
      }
    ]
  }

  /**
   * Principle #1 stays default: under icons.
   * Hovering a header/period button temporarily undocks for real clicks.
   * Click outside the widget, or 10s idle after work finishes, re-attaches to WorkerW.
   */
  suspendForInteraction(): void {
    if (this.mode !== 'desktop' || this.interactionSuspended) return
    const win = this.getWindow()
    if (!win || win.isDestroyed() || !this.lockedBounds) return

    const footprint = { ...this.lockedBounds }
    this.interactionSuspended = true
    // Detach + force the same screen footprint (prevents WorkerW coord jump).
    clearWallpaperPin(win, footprint)
    win.setSkipTaskbar(true)
    win.setResizable(false)
    win.setMovable(false)
    win.setAlwaysOnTop(false)
    win.setHasShadow(false)
    win.setBounds(footprint)
    // Full mouse + keyboard capture while temporarily undocked.
    // Must activate the HWND — showInactive() alone leaves Hangul IME detached.
    win.setIgnoreMouseEvents(false)
    win.setBounds(footprint)
    focusWindowForTextInput(win)
    win.setBounds(footprint)
    console.log('[desktop] Suspended under-icons for header/UI input', footprint)
    this.onModeChanged?.(this.getStatus())
  }

  /** Re-attach OS/IME focus while an undocked text UI (settings/login/editor) is open. */
  focusForTextInput(): void {
    const win = this.getWindow()
    if (!win || win.isDestroyed()) return
    if (this.mode === 'desktop' && !this.interactionSuspended) {
      this.suspendForInteraction()
      return
    }
    win.setIgnoreMouseEvents(false)
    focusWindowForTextInput(win)
  }

  resumeUnderIcons(): void {
    if (this.mode !== 'desktop' || !this.interactionSuspended) return
    const win = this.getWindow()
    if (!win || win.isDestroyed() || !this.lockedBounds) {
      this.interactionSuspended = false
      return
    }

    const footprint = { ...this.lockedBounds }
    this.interactionSuspended = false
    win.setBounds(footprint)
    setAsWallpaper(win, footprint)
    win.setIgnoreMouseEvents(true, { forward: true })
    win.showInactive()
    console.log('[desktop] Resumed under-icons (principle #1)', footprint)
    this.onModeChanged?.(this.getStatus())
  }

  /**
   * Next launch: restore last quit mode + footprint.
   * First run uses DEFAULT_SETTINGS (window + DEFAULT_WIDGET_BOUNDS).
   */
  restoreFromSettings(): void {
    const settings = this.store.getSettings()
    const saved = settings.widget.bounds
    this.lockedBounds = saved
      ? normalizeBounds(saved)
      : centerOnCursorDisplay(DEFAULT_WIDGET_BOUNDS.width, DEFAULT_WIDGET_BOUNDS.height)

    const mode = settings.widget.launchMode === 'desktop' ? 'desktop' : 'window'
    console.log('[desktop] Restoring session', { mode, bounds: this.lockedBounds })

    if (mode === 'desktop') {
      this.enterDesktop({
        intentional: true,
        force: true,
        fromTray: true,
        persist: true,
        bounds: this.lockedBounds
      })
      return
    }

    this.enterWindow({ persist: true, fromRestore: true, force: true })
    // Re-assert focus after chrome finishes painting (keeps window on top).
    setTimeout(() => {
      if (this.mode !== 'window') return
      const w = this.getWindow()
      if (!w || w.isDestroyed()) return
      w.setAlwaysOnTop(true, 'floating')
      w.show()
      w.focus()
      w.moveTop()
      setTimeout(() => {
        if (this.mode === 'window' && !w.isDestroyed()) w.setAlwaysOnTop(false)
      }, 1500)
    }, 200)
  }

  /** Save mode + size/position for the next cold start (call on quit). */
  persistSession(): void {
    const win = this.getWindow()
    let bounds: WidgetBounds
    if (this.mode === 'desktop') {
      bounds = normalizeBounds(
        this.lockedBounds ?? this.store.getWidgetBounds() ?? DEFAULT_WIDGET_BOUNDS
      )
    } else if (win && !win.isDestroyed()) {
      bounds = normalizeBounds(win.getBounds())
    } else {
      bounds = normalizeBounds(
        this.lockedBounds ?? this.store.getWidgetBounds() ?? DEFAULT_WIDGET_BOUNDS
      )
    }
    this.lockedBounds = bounds
    this.store.setWidget({ launchMode: this.mode, bounds })
    console.log('[desktop] Persisted session on quit', { mode: this.mode, bounds })
  }

  /** Re-clamp / re-pin after monitor plug/unplug or DPI change. */
  onDisplayTopologyChanged(): void {
    if (!this.lockedBounds) return
    const next = normalizeBounds(this.lockedBounds)
    this.lockedBounds = next
    const win = this.getWindow()
    if (!win || win.isDestroyed()) return

    if (this.mode === 'desktop') {
      win.setBounds(next)
      if (!this.interactionSuspended) {
        setAsWallpaper(win, next)
      }
      this.store.setWidget({ launchMode: 'desktop', bounds: next })
      console.log('[desktop] Re-applied desktop footprint after display change', next)
    } else {
      win.setBounds(next)
      this.store.setWidget({ launchMode: 'window', bounds: next })
      console.log('[desktop] Re-clamped window footprint after display change', next)
    }
    this.onModeChanged?.(this.getStatus())
  }

  enterDesktop(
    options: {
      persist?: boolean
      bounds?: WidgetBounds
      intentional?: boolean
      force?: boolean
      /** Tray / explicit restore only — bypasses startup window lock. */
      fromTray?: boolean
    } = {}
  ): ModeStatus {
    const win = this.getWindow()
    if (!win) return this.getStatus()

    if (!options.intentional) {
      console.log('[desktop] Ignoring non-intentional enterDesktop')
      return this.getStatus()
    }

    if (this.mode === 'desktop') {
      return this.getStatus()
    }

    // Startup lock applies even to force:true from the renderer IPC path.
    if (!options.fromTray && Date.now() < this.blockDesktopEnterUntil) {
      console.log('[desktop] Ignoring enterDesktop — startup window lock', {
        force: Boolean(options.force),
        remainingMs: this.blockDesktopEnterUntil - Date.now()
      })
      return this.getStatus()
    }

    if (!options.force && !this.modeSwitchAllowed) {
      console.log('[desktop] Ignoring enterDesktop — waiting for cursor to leave header')
      return this.getStatus()
    }

    const sourceBounds =
      options.bounds ??
      (this.mode === 'window' ? win.getBounds() : null) ??
      this.lockedBounds ??
      this.store.getWidgetBounds() ??
      win.getBounds()

    this.lockedBounds = normalizeBounds(sourceBounds)
    this.mode = 'desktop'
    this.interactionSuspended = false
    // Embed under icons immediately; don't undock again just because the
    // cursor is still on the desktop-mode / tray-triggered wake button.
    this.wakeHoldUntilLeave = true
    this.armModeSwitchGate(250)
    this.lockInput(200)

    win.setSkipTaskbar(true)
    win.setResizable(false)
    win.setMovable(false)
    win.setMinimizable(false)
    win.setMaximizable(false)
    win.setAlwaysOnTop(false)
    win.setHasShadow(false)
    win.setBounds(this.lockedBounds)
    setAsWallpaper(win, this.lockedBounds)
    win.setIgnoreMouseEvents(true, { forward: true })
    if (!win.isVisible()) win.showInactive()
    else win.showInactive()
    this.blurRendererChrome()

    if (options.persist !== false) {
      this.store.setWidget({ launchMode: 'desktop', bounds: this.lockedBounds })
    }
    console.log('[desktop] Desktop mode (under-icons immediately)', {
      bounds: this.lockedBounds,
      workerEmbedded: isWorkerEmbedded()
    })
    const status = this.getStatus()
    this.onModeChanged?.(status)
    return status
  }

  enterWindow(
    options: { persist?: boolean; fromRestore?: boolean; force?: boolean } = {}
  ): ModeStatus {
    const win = this.getWindow()
    if (!win) return this.getStatus()

    if (!options.fromRestore && this.mode === 'window') {
      win.show()
      win.focus()
      win.moveTop()
      return this.getStatus()
    }

    if (!options.fromRestore && !options.force && !this.modeSwitchAllowed) {
      console.log('[desktop] Ignoring enterWindow — waiting for cursor to leave header')
      return this.getStatus()
    }

    this.mode = 'window'
    this.interactionSuspended = false
    this.wakeHoldUntilLeave = false
    if (options.fromRestore) {
      this.blockDesktopEnterUntil = Date.now() + 4000
    }
    // Longer gate on cold-start restore so the window stays visible.
    this.armModeSwitchGate(options.fromRestore ? 1500 : 250)
    this.lockInput(options.fromRestore ? 250 : 200)

    // Restore exact saved footprint (do not nudge away from cursor).
    const bounds = normalizeBounds(
      this.lockedBounds ?? this.store.getWidgetBounds() ?? win.getBounds() ?? DEFAULT_WIDGET_BOUNDS
    )
    this.lockedBounds = bounds

    clearWallpaperPin(win, bounds)
    win.setSkipTaskbar(false)
    win.setMinimumSize(400, 300)
    win.setResizable(true)
    win.setMovable(true)
    win.setMinimizable(true)
    win.setMaximizable(true)
    win.setFullScreenable(false)
    win.setHasShadow(true)
    win.setOpacity(1)
    win.setBounds(bounds)
    win.setAlwaysOnTop(true, 'floating')
    win.show()
    win.focus()
    win.moveTop()
    this.blurRendererChrome()

    console.log('[desktop] Window mode bounds', bounds)

    if (options.persist !== false) {
      this.store.setWidget({ launchMode: 'window', bounds })
    }
    const status = this.getStatus()
    this.onModeChanged?.(status)
    return status
  }

  persistWindowBounds(): void {
    const win = this.getWindow()
    if (!win) return
    const bounds = normalizeBounds(win.getBounds())
    this.lockedBounds = bounds
    this.store.setWidget({ launchMode: this.mode, bounds })
  }

  getWindowBounds(): WidgetBounds {
    const win = this.getWindow()
    if (!win) return this.lockedBounds ?? this.store.getWidgetBounds()
    return normalizeBounds(win.getBounds())
  }

  getLockedBounds(): WidgetBounds | null {
    return this.lockedBounds ? { ...this.lockedBounds } : null
  }

  setWindowBounds(bounds: WidgetBounds): WidgetBounds {
    const win = this.getWindow()
    if (!win || this.mode !== 'window') {
      return this.getWindowBounds()
    }
    const next = normalizeBounds(bounds)
    this.lockedBounds = next
    win.setBounds(next)
    this.store.setWidget({ launchMode: 'window', bounds: next })
    return next
  }
}
