import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { join } from 'node:path'
import { AuthService } from './auth'
import { DesktopModeController } from './desktopMode'
import { loadDotEnv } from './dotEnv'
import { SettingsStore } from './settingsStore'
import { createAppTray, type AppTray } from './tray'
import { DayCellDblClickBridge, type DayCellClientZone } from './dayCellDblClickBridge'
import { DesktopInputBridge } from './desktopInputBridge'
import { withWallpaperApi, type WallpaperBrowserWindow } from './wallpaper'
import { WindowModeHitZone } from './windowModeHitZone'
import { snapToTen } from './displayGeometry'
import { DEFAULT_WIDGET_BOUNDS } from '../shared/constants'
import type { AppSettings, ClientHitRect, DayCellHitZone, ModeStatus } from '../shared/ipc'

let mainWindow: WallpaperBrowserWindow | null = null
let settingsStore: SettingsStore
let auth: AuthService
let desktopMode: DesktopModeController
let tray: AppTray | null = null
let windowModeHitZone: WindowModeHitZone | null = null
let desktopInputBridge: DesktopInputBridge | null = null
let dayCellDblClickBridge: DayCellDblClickBridge | null = null
let dayCellClientZones: DayCellClientZone[] = []
let interactionBusy = false

function broadcastMode(status: ModeStatus): void {
  mainWindow?.webContents.send('mode-changed', status)
  tray?.rebuildMenu?.()
}

function createWindow(): void {
  const saved = settingsStore.getSettings().widget.bounds ?? DEFAULT_WIDGET_BOUNDS
  // Prefer the monitor of the last footprint; otherwise the monitor under the cursor.
  const anchor = {
    x: Math.round(saved.x + saved.width / 2),
    y: Math.round(saved.y + saved.height / 2)
  }
  const hasSaved = Number.isFinite(saved.x) && Number.isFinite(saved.y)
  const display = hasSaved
    ? screen.getDisplayNearestPoint(anchor)
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const startWidth = Math.min(Math.max(640, snapToTen(saved.width)), area.width)
  const startHeight = Math.min(Math.max(480, snapToTen(saved.height)), area.height)
  const startX = snapToTen(
    Math.min(
      Math.max(hasSaved ? saved.x : area.x + Math.round((area.width - startWidth) / 2), area.x),
      area.x + Math.max(0, area.width - startWidth)
    )
  )
  const startY = snapToTen(
    Math.min(
      Math.max(hasSaved ? saved.y : area.y + Math.round((area.height - startHeight) / 2), area.y),
      area.y + Math.max(0, area.height - startHeight)
    )
  )

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

  // Window mode: keep footprint in sync while dragging/resizing.
  const persistBounds = (): void => {
    if (desktopMode.getLaunchMode() === 'window') {
      desktopMode.persistWindowBounds()
    }
  }
  win.on('moved', persistBounds)
  win.on('resized', persistBounds)
  win.on('close', () => {
    desktopMode.persistSession()
  })

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

  ipcMain.on('set-header-hit-zone', (_event, rect: ClientHitRect | null) => {
    if (rect && rect.height > 0) {
      desktopMode.setHeaderHitHeight(Math.round(rect.height + rect.y))
    }
  })

  ipcMain.on('set-wake-hit-zones', (_event, zones: ClientHitRect[] | null) => {
    desktopMode.setWakeClientZones(Array.isArray(zones) ? zones : [])
  })

  ipcMain.on('set-day-cell-hit-zones', (_event, zones: DayCellHitZone[] | null) => {
    dayCellClientZones = Array.isArray(zones)
      ? zones
          .filter(
            (z) =>
              z &&
              typeof z.dateKey === 'string' &&
              z.dateKey.length > 0 &&
              z.width > 0 &&
              z.height > 0
          )
          .map((z) => ({
            x: Math.round(z.x),
            y: Math.round(z.y),
            width: Math.round(z.width),
            height: Math.round(z.height),
            dateKey: z.dateKey
          }))
      : []
  })

  ipcMain.on('set-interaction-busy', (_event, busy: boolean) => {
    interactionBusy = Boolean(busy)
  })

  ipcMain.handle('get-mode-status', () => desktopMode.getStatus())
  ipcMain.handle('enter-desktop', () =>
    desktopMode.enterDesktop({ intentional: true, force: true })
  )
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
  loadDotEnv()
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

  // Fully embedded: window-mode button still works via hit-zone.
  windowModeHitZone = new WindowModeHitZone(
    () => mainWindow,
    () => desktopMode.getLockedBounds(),
    () => desktopMode.isWorkerEmbedded(),
    () => {
      desktopMode.enterWindow({ force: true })
    }
  )
  windowModeHitZone.start()

  // Hover header/period buttons → temporary undock;
  // outside click → re-embed immediately; else 10s idle → under icons.
  // After button/tray desktop enter, wake is held until the cursor leaves those buttons.
  desktopInputBridge = new DesktopInputBridge({
    isArmed: () => desktopMode.getLaunchMode() === 'desktop',
    isSuspended: () => desktopMode.isInteractionSuspended(),
    isBusy: () => interactionBusy,
    shouldHoldWake: () => desktopMode.shouldHoldWake(),
    noteWakeCursor: (over) => desktopMode.noteWakeCursor(over),
    getEnterZones: () => desktopMode.getWakeScreenZones(),
    getWidgetBounds: () => desktopMode.getLockedBounds(),
    onEnter: () => desktopMode.suspendForInteraction(),
    onLeave: () => desktopMode.resumeUnderIcons()
  })
  desktopInputBridge.start()

  // Date-cell double-click: undock + open/retarget quick edit (no hover wake).
  // Also armed while undocked + busy so another day can be opened without closing first.
  dayCellDblClickBridge = new DayCellDblClickBridge({
    isArmed: () =>
      desktopMode.getLaunchMode() === 'desktop' &&
      (desktopMode.isWorkerEmbedded() ||
        (desktopMode.isInteractionSuspended() && interactionBusy)),
    getScreenOrigin: () => desktopMode.getLockedBounds(),
    getZones: () => dayCellClientZones,
    onDoubleClick: ({ dateKey, clientX, clientY }) => {
      const win = mainWindow
      if (!win || win.isDestroyed()) return

      const open = (): void => {
        if (!desktopMode.isInteractionSuspended()) {
          desktopMode.suspendForInteraction()
        }
        win.webContents.send('open-day-quick-edit', { dateKey, clientX, clientY })
      }

      // Ignore double-clicks that land on the open quick-edit chrome itself.
      void win.webContents
        .executeJavaScript(
          `(() => {
            const el = document.elementFromPoint(${clientX}, ${clientY});
            return Boolean(el && el.closest && el.closest('.day-quick-edit'));
          })()`,
          true
        )
        .then((onPopover: unknown) => {
          if (onPopover) return
          open()
        })
        .catch(() => {
          open()
        })
    }
  })
  dayCellDblClickBridge.start()

  const onDisplayChanged = (): void => {
    desktopMode.onDisplayTopologyChanged()
  }
  screen.on('display-added', onDisplayChanged)
  screen.on('display-removed', onDisplayChanged)
  screen.on('display-metrics-changed', onDisplayChanged)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  desktopMode?.persistSession()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
