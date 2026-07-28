import { BrowserWindow, ipcMain, screen, shell } from 'electron'
import { join } from 'node:path'
import { focusWindowForTextInput, raiseFloatingPanelWindow } from './windowFocus'
import { subscribeGlobalMouseDown, type ScreenPoint } from './globalMouseHook'
import { getWindowDipScreenBounds } from './wallpaper'
import {
  computePanelWindowBounds,
  type OpenPanelWindowRequest,
  type PanelAnchorRect,
  type PanelKind,
  type PanelWindowInit
} from '../shared/panelWindows'
import type { QuickEditDeferToMainPayload } from '../shared/quickEditLayout'
import type { OpenDayQuickEditPayload, WidgetBounds } from '../shared/ipc'
import type { QuickEditViewMode } from '../shared/quickEditLayout'
import type { WallpaperBrowserWindow } from './wallpaper'

const OUTSIDE_CLOSE_GRACE_MS = 350
const OUTSIDE_CLOSE_COOLDOWN_MS = 400
/** Year grid publishes hundreds of mini day zones; month/week stay well below this. */
const EMBEDDED_YEAR_GRID_ZONE_MIN = 120

function isEmbeddedYearQuickEdit(
  context: { viewMode: QuickEditViewMode },
  zones: Array<{ width?: number; height?: number }>
): boolean {
  if (context.viewMode === 'year') return true
  return zones.length >= EMBEDDED_YEAR_GRID_ZONE_MIN
}

function isWinAlive(win: BrowserWindow | null | undefined): win is BrowserWindow {
  if (!win) return false
  try {
    return !win.isDestroyed()
  } catch {
    return false
  }
}

function winBounds(win: BrowserWindow): { x: number; y: number; width: number; height: number } | null {
  if (!isWinAlive(win)) return null
  try {
    return win.getBounds()
  } catch {
    return null
  }
}

type PanelSlot = PanelKind

type PanelEntry = {
  slot: PanelSlot
  win: BrowserWindow
  webContentsId: number
  init: PanelWindowInit
  anchorScreen: PanelAnchorRect | null
}

type OpenEmbeddedOptions = {
  init: PanelWindowInit
  anchorClient: PanelAnchorRect | null
  mainWindow: WallpaperBrowserWindow
  /** WorkerW desktop: top-level window above desktop icons (never parent to embedded main). */
  topLevel?: boolean
}

type PanelWindowManagerOptions = {
  /** Fired when the floating panel stack becomes non-empty or empty. */
  onPanelStackChanged?: (hasOpenPanels: boolean) => void
  /** WorkerW-embedded desktop: panels must be top-level (above desktop icons). */
  isWorkerEmbedded?: () => boolean
  /** Calendar footprint in screen DIP (locked bounds when WorkerW-embedded). */
  getMainFootprint?: () => WidgetBounds | null
}

export class PanelWindowManager {
  private entriesBySlot = new Map<PanelSlot, PanelEntry>()
  private slotByWebContentsId = new Map<number, PanelSlot>()
  private lastMainWindow: WallpaperBrowserWindow | null = null
  private unsubscribeOutside: (() => void) | null = null
  private outsideBlockedUntil = 0
  private lastOutsideCloseAt = 0

  constructor(
    private readonly getMainWindow: () => WallpaperBrowserWindow | null,
    private readonly options: PanelWindowManagerOptions = {}
  ) {
    ipcMain.handle('panel-get-init', (event) => this.getInitForWebContents(event.sender.id))

    ipcMain.on('panel-close', (event) => {
      const slot = this.slotByWebContentsId.get(event.sender.id)
      if (slot) this.closeSlot(slot)
    })

    ipcMain.handle('panel-resize', (event, size: { width: number; height: number }) =>
      this.resizeFromSender(event, size)
    )

    ipcMain.handle('panel-open', (event, request: OpenPanelWindowRequest) => {
      const senderWin = BrowserWindow.fromWebContents(event.sender)
      const mainWindow = this.resolveMainWindow(senderWin)
      if (!mainWindow) return false
      const { anchorClient, ...init } = request
      this.openEmbedded({
        mainWindow,
        init,
        anchorClient: anchorClient ?? null
      })
      return true
    })

    ipcMain.handle('panel-route', (event, init: PanelWindowInit) => {
      if (!this.slotByWebContentsId.has(event.sender.id)) return false
      const mainWindow = this.lastMainWindow ?? this.getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) return false
      const anchorClient =
        init.kind === 'quickEdit'
          ? (init.anchor ?? null)
          : init.kind === 'eventDetail'
            ? (init.anchor ?? null)
            : null
      this.openEmbedded({ mainWindow, init, anchorClient })
      return true
    })

    ipcMain.handle('quick-edit-get-init', (event) => {
      const entry = this.getEntryForWebContents(event.sender.id)
      if (!entry || entry.init.kind !== 'quickEdit') return null
      const init = entry.init
      return {
        dateKey: init.dateKey,
        viewMode: init.viewMode,
        eventsHidden: init.eventsHidden,
        anchor: init.anchor ?? null
      }
    })

    ipcMain.on('quick-edit-close', (event) => {
      const slot = this.slotByWebContentsId.get(event.sender.id)
      if (slot === 'quickEdit') this.closeSlot(slot)
    })

    ipcMain.handle('quick-edit-resize', (event, size: { width: number; height: number }) =>
      this.resizeFromSender(event, size)
    )

    ipcMain.handle('quick-edit-defer-to-main', (event, payload: QuickEditDeferToMainPayload) => {
      if (!this.slotByWebContentsId.has(event.sender.id)) return false
      return this.routeFromQuickEdit(payload)
    })
  }

  private getEntryForWebContents(webContentsId: number): PanelEntry | null {
    const slot = this.slotByWebContentsId.get(webContentsId)
    if (!slot) return null
    return this.entriesBySlot.get(slot) ?? null
  }

  private getInitForWebContents(webContentsId: number): PanelWindowInit | null {
    return this.getEntryForWebContents(webContentsId)?.init ?? null
  }

  private resizeFromSender(
    event: Electron.IpcMainInvokeEvent,
    size: { width: number; height: number }
  ): boolean {
    const entry = this.getEntryForWebContents(event.sender.id)
    if (!entry || !isWinAlive(entry.win)) return false
    const w = Number(size?.width)
    const h = Number(size?.height)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 200 || h < 120) return false
    const bounds = winBounds(entry.win)
    if (!bounds) return false
    entry.win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: Math.round(w),
      height: Math.round(h)
    })
    return true
  }

  private routeFromQuickEdit(payload: QuickEditDeferToMainPayload): boolean {
    const mainWindow = this.lastMainWindow ?? this.getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return false

    const quickEditEntry = this.entriesBySlot.get('quickEdit')
    const returnQuickEdit =
      quickEditEntry?.init.kind === 'quickEdit'
        ? {
            dateKey: quickEditEntry.init.dateKey,
            anchor: quickEditEntry.init.anchor ?? null
          }
        : { dateKey: payload.dateKey, anchor: payload.anchorScreen ?? null }

    if (payload.kind === 'editor') {
      this.openEmbedded({
        mainWindow,
        init: {
          kind: 'eventEditor',
          eventId: payload.eventId ?? null,
          defaultDate: payload.dateKey,
          occurrenceDate: payload.dateKey,
          returnQuickEdit
        },
        anchorClient: null
      })
      return true
    }

    if (payload.kind === 'detail' && payload.eventId) {
      this.openEmbedded({
        mainWindow,
        init: {
          kind: 'eventDetail',
          eventId: payload.eventId,
          dayKey: payload.dateKey,
          anchor: payload.anchorScreen ?? quickEditEntry?.anchorScreen ?? null
        },
        anchorClient: null
      })
      return true
    }

    return false
  }

  private resolveMainWindow(senderWin: BrowserWindow | null): WallpaperBrowserWindow | null {
    const main = this.getMainWindow()
    if (main && !main.isDestroyed()) return main
    if (senderWin && !senderWin.isDestroyed()) return senderWin as WallpaperBrowserWindow
    return this.lastMainWindow && !this.lastMainWindow.isDestroyed()
      ? this.lastMainWindow
      : null
  }

  private beforeOpenSlot(slot: PanelSlot): void {
    if (slot === 'eventEditor') {
      this.evictSlot('eventDetail')
      this.evictSlot('quickEdit')
    }
    if (slot === 'quickEdit') {
      this.evictSlot('eventDetail')
      this.evictSlot('eventEditor')
    }
    this.evictSlot(slot)
  }

  private registerEntry(
    slot: PanelSlot,
    win: BrowserWindow,
    init: PanelWindowInit,
    anchorScreen: PanelAnchorRect | null
  ): void {
    const webContentsId = win.webContents.id
    const entry: PanelEntry = { slot, win, webContentsId, init, anchorScreen }
    this.entriesBySlot.set(slot, entry)
    this.slotByWebContentsId.set(webContentsId, slot)
    this.notifyPanelStackChanged()
  }

  private unregisterEntry(slot: PanelSlot, webContentsId: number): void {
    try {
      const entry = this.entriesBySlot.get(slot)
      if (entry?.webContentsId === webContentsId) {
        this.entriesBySlot.delete(slot)
      }
      if (this.slotByWebContentsId.get(webContentsId) === slot) {
        this.slotByWebContentsId.delete(webContentsId)
      }
      if (this.entriesBySlot.size === 0) {
        this.stopOutsideListener()
      }
      this.notifyPanelStackChanged()
    } catch {
      this.entriesBySlot.delete(slot)
      this.slotByWebContentsId.delete(webContentsId)
      if (this.entriesBySlot.size === 0) {
        this.stopOutsideListener()
      }
      this.notifyPanelStackChanged()
    }
  }

  private notifyPanelStackChanged(): void {
    this.options.onPanelStackChanged?.(this.entriesBySlot.size > 0)
  }

  /** Remove slot tracking and close the window without relying on `closed` cleanup. */
  private evictSlot(slot: PanelSlot): void {
    const entry = this.entriesBySlot.get(slot)
    if (!entry) return
    const { webContentsId, win } = entry
    this.unregisterEntry(slot, webContentsId)
    if (!isWinAlive(win)) return
    try {
      win.removeAllListeners('closed')
      win.close()
    } catch {
      /* already destroyed */
    }
  }

  closeSlot(slot: PanelSlot): void {
    this.evictSlot(slot)
  }

  isOpen(): boolean {
    return this.entriesBySlot.size > 0
  }

  getWindow(): BrowserWindow | null {
    const first = this.entriesBySlot.values().next().value as PanelEntry | undefined
    if (!first || !isWinAlive(first.win)) return null
    return first.win
  }

  getWindowForWebContents(webContentsId: number): BrowserWindow | null {
    const entry = this.getEntryForWebContents(webContentsId)
    if (!entry || !isWinAlive(entry.win)) return null
    return entry.win
  }

  isPanelWebContents(webContentsId: number): boolean {
    return this.slotByWebContentsId.has(webContentsId)
  }

  isPointInsideAnyPanel(pt: ScreenPoint): boolean {
    for (const entry of this.entriesBySlot.values()) {
      const bounds = winBounds(entry.win)
      if (!bounds) continue
      if (
        pt.x >= bounds.x &&
        pt.y >= bounds.y &&
        pt.x < bounds.x + bounds.width &&
        pt.y < bounds.y + bounds.height
      ) {
        return true
      }
    }
    return false
  }

  closeAll(): void {
    for (const slot of Array.from(this.entriesBySlot.keys())) {
      this.closeSlot(slot)
    }
  }

  private computeWindowBounds(options: {
    init: PanelWindowInit
    resolvedAnchor: PanelAnchorRect | null
    origin: { x: number; y: number }
    mainSize: { width: number; height: number }
    workArea: { x: number; y: number; width: number; height: number }
  }): { x: number; y: number; width: number; height: number } {
    const { init, resolvedAnchor, origin, mainSize, workArea } = options
    return computePanelWindowBounds({
      init,
      anchorClient: resolvedAnchor,
      mainOrigin: origin,
      mainSize,
      workArea
    })
  }

  openEmbedded(options: OpenEmbeddedOptions): void {
    const { mainWindow, init, anchorClient, topLevel: topLevelOption } = options
    if (mainWindow.isDestroyed()) return

    const slot = init.kind
    // Block the outside-click listener on this same mousedown (day-dblclick opens then
    // handleOutsideClick would immediately close before the panel is shown).
    this.outsideBlockedUntil = Date.now() + OUTSIDE_CLOSE_GRACE_MS
    this.beforeOpenSlot(slot)
    this.lastMainWindow = mainWindow
    this.ensureOutsideListener()

    const mainBounds =
      this.options.getMainFootprint?.() ?? getWindowDipScreenBounds(mainWindow)
    if (!mainBounds) return

    const origin = { x: mainBounds.x, y: mainBounds.y }
    const mainSize = { width: mainBounds.width, height: mainBounds.height }
    const display = screen.getDisplayNearestPoint({
      x: origin.x + Math.round(mainSize.width / 2),
      y: origin.y + Math.round(mainSize.height / 2)
    })

    const resolvedAnchor =
      anchorClient ??
      (init.kind === 'quickEdit' || init.kind === 'eventDetail' ? (init.anchor ?? null) : null)

    const windowBounds = this.computeWindowBounds({
      init,
      resolvedAnchor,
      origin,
      mainSize,
      workArea: display.workArea
    })

    const anchorScreen: PanelAnchorRect = {
      top: windowBounds.y,
      left: windowBounds.x,
      width: windowBounds.width,
      height: windowBounds.height
    }

    const resizable = init.kind === 'eventEditor' || init.kind === 'settings'
    const topLevel =
      topLevelOption ?? (this.options.isWorkerEmbedded?.() ?? false)

    const win = new BrowserWindow({
      x: windowBounds.x,
      y: windowBounds.y,
      width: windowBounds.width,
      height: windowBounds.height,
      ...(topLevel ? {} : { parent: mainWindow }),
      frame: false,
      transparent: true,
      skipTaskbar: true,
      resizable,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: true,
      show: false,
      hasShadow: false,
      alwaysOnTop: topLevel,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        void shell.openExternal(url)
      }
      return { action: 'deny' }
    })

    const webContentsId = win.webContents.id
    win.setIgnoreMouseEvents(false)
    if (topLevel) {
      raiseFloatingPanelWindow(win)
    }
    this.registerEntry(slot, win, init, anchorScreen)

    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return
      if (topLevel) {
        raiseFloatingPanelWindow(win)
      }
      win.show()
      focusWindowForTextInput(win)
      this.outsideBlockedUntil = Math.max(
        this.outsideBlockedUntil,
        Date.now() + OUTSIDE_CLOSE_GRACE_MS
      )
    })

    win.once('closed', () => {
      // Fallback if the window is destroyed without evictSlot (e.g. OS close).
      if (this.entriesBySlot.get(slot)?.webContentsId === webContentsId) {
        this.unregisterEntry(slot, webContentsId)
      }
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      const base = process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '')
      void win.loadURL(`${base}/panel.html`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/panel.html'))
    }
  }

  openQuickEditFromEmbeddedDblClick(
    mainWindow: WallpaperBrowserWindow,
    payload: OpenDayQuickEditPayload,
    context: { viewMode: QuickEditViewMode; eventsHidden: boolean },
    zones: Array<{ x: number; y: number; width: number; height: number; dateKey: string }>
  ): void {
    let anchorClient: PanelAnchorRect | null = null
    const clientX = payload.clientX
    const clientY = payload.clientY
    const hasPointer = typeof clientX === 'number' && typeof clientY === 'number'
    const yearView = isEmbeddedYearQuickEdit(context, zones)
    const effectiveViewMode: QuickEditViewMode = yearView ? 'year' : context.viewMode

    // Year view: pointer anchor (same as window mode CalendarGrid double-click).
    if (yearView && hasPointer) {
      anchorClient = {
        left: clientX,
        top: clientY,
        width: 1,
        height: 1
      }
    } else {
      const zone = zones.find((z) => z.dateKey === payload.dateKey)
      if (zone) {
        anchorClient = {
          top: zone.y,
          left: zone.x,
          width: zone.width,
          height: zone.height
        }
      } else if (hasPointer) {
        anchorClient = {
          left: clientX - 24,
          top: clientY - 24,
          width: 48,
          height: 48
        }
      }
    }

    this.openEmbedded({
      mainWindow,
      topLevel: true,
      init: {
        kind: 'quickEdit',
        dateKey: payload.dateKey,
        viewMode: effectiveViewMode,
        eventsHidden: context.eventsHidden,
        anchor: anchorClient
      },
      anchorClient
    })
  }

  private ensureOutsideListener(): void {
    if (this.unsubscribeOutside) return
    this.unsubscribeOutside = subscribeGlobalMouseDown((pt, _button) => {
      this.handleOutsideClick(pt)
    })
  }

  private stopOutsideListener(): void {
    this.unsubscribeOutside?.()
    this.unsubscribeOutside = null
  }

  private handleOutsideClick(pt: ScreenPoint): void {
    if (this.entriesBySlot.size === 0) return
    const now = Date.now()
    if (now < this.outsideBlockedUntil) return
    if (now - this.lastOutsideCloseAt < OUTSIDE_CLOSE_COOLDOWN_MS) return

    const entries = Array.from(this.entriesBySlot.values())
    const insideAnyPanel = entries.some((entry) => {
      const bounds = winBounds(entry.win)
      if (!bounds) return false
      return (
        pt.x >= bounds.x &&
        pt.y >= bounds.y &&
        pt.x < bounds.x + bounds.width &&
        pt.y < bounds.y + bounds.height
      )
    })

    // Click on any floating panel — keep all panels open (e.g. detail over desktop, QE stays).
    if (insideAnyPanel) return

    this.lastOutsideCloseAt = now
    for (const slot of Array.from(this.entriesBySlot.keys())) {
      this.closeSlot(slot)
    }
  }
}
