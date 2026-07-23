import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { join } from 'node:path'
import { AuthService } from './auth'
import { DesktopModeController } from './desktopMode'
import { SettingsStore } from './settingsStore'
import { createAppTray, type AppTray } from './tray'
import { withWallpaperApi, type WallpaperBrowserWindow } from './wallpaper'
import { WindowModeHitZone } from './windowModeHitZone'
import { DEFAULT_WIDGET_BOUNDS } from '../shared/constants'
import type { AppSettings, ClientHitRect, ModeStatus } from '../shared/ipc'

let mainWindow: WallpaperBrowserWindow | null = null
let settingsStore: SettingsStore
let auth: AuthService
let desktopMode: DesktopModeController
let tray: AppTray | null = null
let windowModeHitZone: WindowModeHitZone | null = null

function broadcastMode(status: ModeStatus): void {
  mainWindow?.webContents.send('mode-changed', status)
  tray?.rebuildMenu?.()
}

function createWindow(): void {
  const saved = settingsStore.getSettings().widget.bounds ?? DEFAULT_WIDGET_BOUNDS

  const area = screen.getPrimaryDisplay().workArea
  const startWidth = Math.min(Math.max(640, saved.width), area.width)
  const startHeight = Math.min(Math.max(480, saved.height), area.height)
  const startX = area.x + Math.round((area.width - startWidth) / 2)
  const startY = area.y + Math.round((area.height - startHeight) / 2)

  const win = withWallpaperApi(
    new BrowserWindow({
      x: startX,
      y: startY,
      width: startWidth,
      height: startHeight,
      frame: false,
      transparent: true,
      skipTaskbar: false,
      resizable: true,
      movable: true,
      maximizable: true,
      minimizable: true,
      fullscreenable: false,
      hasShadow: true,
      focusable: true,
      show: false,
      backgroundColor: '#00000000',
      title: 'My Desktop Calendar',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
  )

  mainWindow = win

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.once('ready-to-show', () => {
    desktopMode.restoreFromSettings()
  })

  const persistBounds = (): void => {
    if (desktopMode.getLaunchMode() === 'window') {
      desktopMode.persistWindowBounds()
    }
  }
  win.on('moved', persistBounds)
  win.on('resized', persistBounds)

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    mainWindow = null
  })
}

function registerIpc(): void {
  ipcMain.on(
    'set-ignore-mouse',
    (_event, ignore: boolean, options?: { forward?: boolean; forwardToOverlay?: boolean }) => {
      if (!mainWindow) return
      // Mode-switch swallow: do not let renderer clear ignore-mouse early.
      if (desktopMode.isInputLocked()) {
        mainWindow.setIgnoreMouseEvents(true)
        return
      }
      if (desktopMode.getLaunchMode() === 'window') {
        mainWindow.setIgnoreMouseEvents(false)
        return
      }
      const shouldForward = options?.forwardToOverlay ?? options?.forward ?? true
      if (ignore) {
        mainWindow.setIgnoreMouseEvents(true, { forward: shouldForward })
      } else {
        mainWindow.setIgnoreMouseEvents(false)
      }
    }
  )

  ipcMain.on('set-window-mode-hit-zone', (_event, rect: ClientHitRect | null) => {
    windowModeHitZone?.setClientRect(rect ?? null)
  })

  ipcMain.handle('get-mode-status', () => desktopMode.getStatus())
  ipcMain.handle('enter-desktop', () => desktopMode.enterDesktop({ intentional: true }))
  ipcMain.handle('enter-window', () => desktopMode.enterWindow())
  ipcMain.handle('get-window-bounds', () => desktopMode.getWindowBounds())
  ipcMain.handle('set-window-bounds', (_event, bounds) => desktopMode.setWindowBounds(bounds))

  ipcMain.handle('get-auth', () => auth.getUser())
  ipcMain.handle(
    'login',
    (_event, loginId: string, password: string, remember?: boolean) =>
      auth.login(loginId, password, Boolean(remember))
  )
  ipcMain.handle('logout', () => {
    auth.logout()
  })

  ipcMain.handle('get-settings', () => settingsStore.getSettings())
  ipcMain.handle('patch-settings', (_event, patch: Partial<AppSettings>) =>
    settingsStore.patchSettings(patch ?? {})
  )
}

app.whenReady().then(() => {
  settingsStore = new SettingsStore()
  auth = new AuthService(settingsStore)
  desktopMode = new DesktopModeController({
    getWindow: () => mainWindow,
    store: settingsStore,
    onModeChanged: broadcastMode
  })

  registerIpc()
  createWindow()
  tray = createAppTray({
    getWindow: () => mainWindow,
    desktopMode
  })

  // WorkerW swallows HWND input — bridge only the window-mode button so users can undock.
  windowModeHitZone = new WindowModeHitZone(
    () => mainWindow,
    () => desktopMode.getLockedBounds(),
    () => desktopMode.isWorkerEmbedded(),
    () => {
      desktopMode.enterWindow({ force: true })
    }
  )
  windowModeHitZone.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
