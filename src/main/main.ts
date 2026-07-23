import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { AuthService } from './auth'
import { DesktopModeController } from './desktopMode'
import { handleNativeRequest } from './ipc/nativeRouter'
import { CalendarStore } from './store/calendarStore'
import { createAppTray } from './tray'
import { withWallpaperApi } from './wallpaper'
import { APP_NAME, APP_VERSION } from './appMeta'

let mainWindow: BrowserWindow | null = null
let desktopMode: DesktopModeController | null = null
let isQuitting = false

const dataRoot = join(app.getPath('userData'), 'data')
const store = new CalendarStore(dataRoot)
const auth = new AuthService(dataRoot)

function getWindow(): BrowserWindow | null {
  return mainWindow
}

function createWindow(): void {
  const win = withWallpaperApi(
    new BrowserWindow({
      width: 1280,
      height: 860,
      minWidth: 640,
      minHeight: 480,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      show: false,
      title: `${APP_NAME} v${APP_VERSION}`,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
  )

  mainWindow = win

  desktopMode = new DesktopModeController({
    getWindow,
    store,
    onModeChanged: () => {
      win.webContents.send('widget-status', desktopMode?.getStatus())
    }
  })

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      desktopMode?.persistWindowBounds()
      win.hide()
    }
  })

  win.on('moved', () => desktopMode?.persistWindowBounds())
  win.on('resized', () => desktopMode?.persistWindowBounds())

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.once('ready-to-show', () => {
    desktopMode?.restoreFromSettings()
    if (desktopMode?.getLaunchMode() === 'window') {
      win.show()
    }
  })
}

ipcMain.handle('native-request', async (_event, payload) => {
  if (!desktopMode) throw new Error('Desktop mode not ready')
  try {
    const result = await handleNativeRequest(
      { getWindow, store, auth, desktopMode },
      payload
    )
    return { ok: true, result }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
})

ipcMain.on(
  'set-ignore-mouse',
  (_event, ignore: boolean, options?: { forward?: boolean; forwardToOverlay?: boolean }) => {
    if (!mainWindow || !desktopMode) return
    if (desktopMode.getLaunchMode() !== 'desktop') return
    if (desktopMode.getStatus().embedSuspended) {
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

app.whenReady().then(() => {
  createWindow()
  if (desktopMode) {
    const tray = createAppTray({ getWindow, desktopMode })
    if (!tray) {
      console.warn('[tray] System tray icon was not created')
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  desktopMode?.persistWindowBounds()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
