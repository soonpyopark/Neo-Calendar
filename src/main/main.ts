import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { withWallpaperApi, type WallpaperBrowserWindow } from './wallpaper'

let mainWindow: WallpaperBrowserWindow | null = null

function createWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height, x, y } = primaryDisplay.bounds

  const win = withWallpaperApi(
    new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      hasShadow: false,
      focusable: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
  )

  mainWindow = win

  // Default: pass clicks through to the OS desktop
  win.setIgnoreMouseEvents(true, { forward: true })

  win.once('ready-to-show', () => {
    win.show()
    // Keep under normal apps, but as a top-level HWND so mouse forward works
    win.setAsWallpaper()
    win.setIgnoreMouseEvents(true, { forward: true })
  })



  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Keep covering the primary display when resolution / work area changes
  const relayout = (): void => {
    if (!mainWindow) return
    const bounds = screen.getPrimaryDisplay().bounds
    mainWindow.setBounds(bounds)
    if (process.platform === 'win32') {
      mainWindow.setAsWallpaper()
    }
  }

  screen.on('display-metrics-changed', relayout)
  win.on('closed', () => {
    screen.removeListener('display-metrics-changed', relayout)
    mainWindow = null
  })
}

/**
 * IPC: toggle click-through.
 * Electron's public option is `forward` (mouse-move forwarding while ignoring).
 * `forwardToOverlay` is accepted as an alias for the same behavior.
 */
ipcMain.on(
  'set-ignore-mouse',
  (_event, ignore: boolean, options?: { forward?: boolean; forwardToOverlay?: boolean }) => {
    if (!mainWindow) return

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
