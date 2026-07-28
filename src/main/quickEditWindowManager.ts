import { BrowserWindow, ipcMain, screen, shell } from 'electron'
import { join } from 'node:path'
import { focusWindowForTextInput } from './windowFocus'
import { subscribeGlobalMouseDown, type ScreenPoint } from './globalMouseHook'
import { getWindowDipScreenBounds } from './wallpaper'
import {
  computeQuickEditWindowBounds,
  type QuickEditAnchorRect,
  type QuickEditDeferToMainPayload,
  type QuickEditViewMode,
  type QuickEditWindowInit
} from '../shared/quickEditLayout'
import type { OpenDayQuickEditPayload } from '../shared/ipc'
import type { WallpaperBrowserWindow } from './wallpaper'

const OUTSIDE_CLOSE_GRACE_MS = 350
const OUTSIDE_CLOSE_COOLDOWN_MS = 400

type OpenOptions = {
  dateKey: string
  viewMode: QuickEditViewMode
  eventsHidden: boolean
  anchorClient: QuickEditAnchorRect | null
  mainWindow: WallpaperBrowserWindow
}

export class QuickEditWindowManager {
  private quickEditWindow: BrowserWindow | null = null
  private pendingInit: QuickEditWindowInit | null = null
  private pendingAnchorScreen: QuickEditAnchorRect | null = null
  private unsubscribeOutside: (() => void) | null = null
  private outsideBlockedUntil = 0
  private lastOutsideCloseAt = 0

  constructor(
    private readonly onDeferToMain: (payload: QuickEditDeferToMainPayload) => void
  ) {
    ipcMain.handle('quick-edit-get-init', (event) => {
      if (!this.quickEditWindow || event.sender.id !== this.quickEditWindow.webContents.id) {
        return null
      }
      return this.pendingInit
    })

    ipcMain.on('quick-edit-close', (event) => {
      if (!this.quickEditWindow || event.sender.id !== this.quickEditWindow.webContents.id) {
        return
      }
      this.close()
    })

    ipcMain.handle('quick-edit-resize', (event, size: { width: number; height: number }) => {
      if (!this.quickEditWindow || event.sender.id !== this.quickEditWindow.webContents.id) {
        return false
      }
      const w = Number(size?.width)
      const h = Number(size?.height)
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 200 || h < 120) return false
      const bounds = this.quickEditWindow.getBounds()
      this.quickEditWindow.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: Math.round(w),
        height: Math.round(h)
      })
      return true
    })

    ipcMain.handle('quick-edit-defer-to-main', (event, payload: QuickEditDeferToMainPayload) => {
      if (!this.quickEditWindow || event.sender.id !== this.quickEditWindow.webContents.id) {
        return false
      }
      const anchorScreen = this.pendingAnchorScreen
      this.close()
      this.onDeferToMain({
        ...payload,
        anchorScreen: payload.anchorScreen ?? anchorScreen
      })
      return true
    })
  }

  isOpen(): boolean {
    return Boolean(this.quickEditWindow && !this.quickEditWindow.isDestroyed())
  }

  getWindow(): BrowserWindow | null {
    if (!this.quickEditWindow || this.quickEditWindow.isDestroyed()) return null
    return this.quickEditWindow
  }

  isQuickEditWebContents(webContentsId: number): boolean {
    const win = this.getWindow()
    return Boolean(win && win.webContents.id === webContentsId)
  }

  close(): void {
    if (!this.quickEditWindow || this.quickEditWindow.isDestroyed()) {
      this.quickEditWindow = null
      this.pendingInit = null
      this.pendingAnchorScreen = null
      this.stopOutsideListener()
      return
    }
    this.quickEditWindow.close()
  }

  openEmbedded(options: OpenOptions): void {
    const { mainWindow, dateKey, viewMode, eventsHidden, anchorClient } = options
    if (mainWindow.isDestroyed()) return

    this.close()

    const mainBounds = getWindowDipScreenBounds(mainWindow)
    if (!mainBounds) return

    const origin = { x: mainBounds.x, y: mainBounds.y }
    const display = screen.getDisplayNearestPoint({
      x: origin.x + Math.round(mainBounds.width / 2),
      y: origin.y + Math.round(mainBounds.height / 2)
    })
    const windowBounds = computeQuickEditWindowBounds({
      viewMode,
      anchorClient,
      mainOrigin: origin,
      mainSize: { width: mainBounds.width, height: mainBounds.height },
      workArea: display.workArea
    })

    this.pendingInit = {
      dateKey,
      viewMode,
      eventsHidden,
      anchor: anchorClient
    }
    this.pendingAnchorScreen = {
      top: windowBounds.y,
      left: windowBounds.x,
      width: windowBounds.width,
      height: windowBounds.height
    }

    const win = new BrowserWindow({
      x: windowBounds.x,
      y: windowBounds.y,
      width: windowBounds.width,
      height: windowBounds.height,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: true,
      show: false,
      hasShadow: false,
      alwaysOnTop: false,
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

    this.quickEditWindow = win

    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return
      win.show()
      focusWindowForTextInput(win)
      this.outsideBlockedUntil = Date.now() + OUTSIDE_CLOSE_GRACE_MS
      this.startOutsideListener()
    })

    win.on('closed', () => {
      if (this.quickEditWindow === win) {
        this.quickEditWindow = null
      }
      this.pendingInit = null
      this.pendingAnchorScreen = null
      this.stopOutsideListener()
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      const base = process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '')
      void win.loadURL(`${base}/quickEdit.html`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/quickEdit.html'))
    }
  }

  /** Map WorkerW double-click payload + published zones to a floating window open. */
  openFromEmbeddedDblClick(
    mainWindow: WallpaperBrowserWindow,
    payload: OpenDayQuickEditPayload,
    context: { viewMode: QuickEditViewMode; eventsHidden: boolean },
    zones: Array<{ x: number; y: number; width: number; height: number; dateKey: string }>
  ): void {
    let anchorClient: QuickEditAnchorRect | null = null
    const zone = zones.find((z) => z.dateKey === payload.dateKey)
    if (zone) {
      anchorClient = {
        top: zone.y,
        left: zone.x,
        width: zone.width,
        height: zone.height
      }
    } else if (
      typeof payload.clientX === 'number' &&
      typeof payload.clientY === 'number'
    ) {
      anchorClient = {
        left: payload.clientX - 24,
        top: payload.clientY - 24,
        width: 48,
        height: 48
      }
    }

    this.openEmbedded({
      mainWindow,
      dateKey: payload.dateKey,
      viewMode: context.viewMode,
      eventsHidden: context.eventsHidden,
      anchorClient
    })
  }

  private startOutsideListener(): void {
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
    if (!this.isOpen()) return
    const now = Date.now()
    if (now < this.outsideBlockedUntil) return
    if (now - this.lastOutsideCloseAt < OUTSIDE_CLOSE_COOLDOWN_MS) return

    const win = this.quickEditWindow
    if (!win || win.isDestroyed()) return

    const bounds = win.getBounds()
    const inside =
      pt.x >= bounds.x &&
      pt.y >= bounds.y &&
      pt.x < bounds.x + bounds.width &&
      pt.y < bounds.y + bounds.height
    if (inside) return

    this.lastOutsideCloseAt = now
    this.close()
  }
}
