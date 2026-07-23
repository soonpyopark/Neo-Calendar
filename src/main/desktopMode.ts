import { BrowserWindow, screen } from 'electron'
import { DEFAULT_WIDGET_BOUNDS } from '../shared/constants'
import type { LaunchMode, ModeStatus, WidgetBounds } from '../shared/ipc'
import type { SettingsStore } from './settingsStore'
import { clearWallpaperPin, isWorkerEmbedded, setAsWallpaper } from './wallpaper'

type DesktopModeOptions = {
  getWindow: () => BrowserWindow | null
  store: SettingsStore
  onModeChanged?: (status: ModeStatus) => void
}

function snapDownTo5(value: number): number {
  return Math.floor(value / 5) * 5
}

function normalizeBounds(bounds: WidgetBounds): WidgetBounds {
  const area = screen.getPrimaryDisplay().bounds
  const width = Math.min(Math.max(320, snapDownTo5(bounds.width)), area.width)
  const height = Math.min(Math.max(240, snapDownTo5(bounds.height)), area.height)
  const maxX = area.x + Math.max(0, area.width - width)
  const maxY = area.y + Math.max(0, area.height - height)
  return {
    x: Math.min(Math.max(snapDownTo5(bounds.x), area.x), maxX),
    y: Math.min(Math.max(snapDownTo5(bounds.y), area.y), maxY),
    width,
    height
  }
}

function centerOnPrimary(width: number, height: number): WidgetBounds {
  const area = screen.getPrimaryDisplay().workArea
  const w = Math.min(Math.max(640, snapDownTo5(width)), area.width)
  const h = Math.min(Math.max(480, snapDownTo5(height)), area.height)
  return {
    x: area.x + Math.round((area.width - w) / 2),
    y: area.y + Math.round((area.height - h) / 2),
    width: w,
    height: h
  }
}

function placeAwayFromCursor(bounds: WidgetBounds): WidgetBounds {
  const pt = screen.getCursorScreenPoint()
  const chrome = { x: bounds.x, y: bounds.y, width: bounds.width, height: 72 }
  const overChrome =
    pt.x >= chrome.x &&
    pt.x < chrome.x + chrome.width &&
    pt.y >= chrome.y &&
    pt.y < chrome.y + chrome.height
  if (!overChrome) return bounds

  const area = screen.getPrimaryDisplay().workArea
  const nextY = Math.min(bounds.y + 96, area.y + area.height - bounds.height)
  return normalizeBounds({ ...bounds, y: Math.max(area.y, nextY) })
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
    return this.mode === 'desktop' && isWorkerEmbedded()
  }

  getStatus(): ModeStatus {
    return {
      mode: this.mode,
      embedded: this.isWorkerEmbedded(),
      bounds: this.lockedBounds ?? this.store.getWidgetBounds(),
      switchReady: this.modeSwitchAllowed
    }
  }

  restoreFromSettings(): void {
    const settings = this.store.getSettings()
    this.lockedBounds = centerOnPrimary(
      Math.min(settings.widget.bounds?.width ?? DEFAULT_WIDGET_BOUNDS.width, 1100),
      Math.min(settings.widget.bounds?.height ?? DEFAULT_WIDGET_BOUNDS.height, 780)
    )
    this.enterWindow({ persist: true, fromRestore: true })
  }

  enterDesktop(
    options: {
      persist?: boolean
      bounds?: WidgetBounds
      intentional?: boolean
      force?: boolean
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
    setAsWallpaper(win)
    win.setBounds(this.lockedBounds)
    if (!win.isVisible()) win.showInactive()
    else win.showInactive()
    this.blurRendererChrome()

    if (options.persist !== false) {
      this.store.setWidget({ launchMode: 'desktop', bounds: this.lockedBounds })
    }
    console.log('[desktop] Desktop mode (under-icons first)', {
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
    this.armModeSwitchGate(options.fromRestore ? 300 : 250)
    this.lockInput(options.fromRestore ? 250 : 200)

    let bounds = normalizeBounds(
      this.lockedBounds ?? this.store.getWidgetBounds() ?? win.getBounds() ?? DEFAULT_WIDGET_BOUNDS
    )
    if (options.fromRestore) {
      bounds = placeAwayFromCursor(bounds)
    }
    this.lockedBounds = bounds

    clearWallpaperPin(win)
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
