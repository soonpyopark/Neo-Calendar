import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DesktopModeController } from './desktopMode'

function resolveTrayImage() {
  const candidates = [
    join(process.cwd(), 'src/renderer/public/icons/trayIcon-16.png'),
    join(process.cwd(), 'src/renderer/public/icons/trayIcon.png'),
    join(process.cwd(), 'src/renderer/public/icon.png'),
    join(app.getAppPath(), 'src/renderer/public/icons/trayIcon-16.png'),
    join(app.getAppPath(), 'src/renderer/public/icons/trayIcon.png'),
    join(app.getAppPath(), 'src/renderer/public/icon.png'),
    join(__dirname, '../../src/renderer/public/icons/trayIcon-16.png'),
    join(__dirname, '../../src/renderer/public/icons/trayIcon.png'),
    join(__dirname, '../../src/renderer/public/icon.png')
  ]

  for (const iconPath of candidates) {
    if (!existsSync(iconPath)) continue
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) {
      console.log('[tray] Using icon:', iconPath)
      return image.resize({ width: 16, height: 16 })
    }
  }

  // Visible 16×16 fallback (solid blue pixel PNG)
  const fallback = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIElEQVQ4T2NkYGD4z0ABYBzVMKoBBgYGhv8UgBE0AAAh6QH9zqK9WwAAAABJRU5ErkJggg=='
  )
  return fallback.isEmpty() ? nativeImage.createEmpty() : fallback
}

export function createAppTray(options: {
  getWindow: () => BrowserWindow | null
  desktopMode: DesktopModeController
}): Tray | null {
  const image = resolveTrayImage()
  if (image.isEmpty()) {
    console.error('[tray] Failed to load tray icon')
    return null
  }

  const tray = new Tray(image)
  tray.setToolTip('My Desktop Calendar')

  const rebuild = (): void => {
    const mode = options.desktopMode.getLaunchMode()
    const menu = Menu.buildFromTemplate([
      {
        label: '열기',
        click: () => {
          if (options.desktopMode.getLaunchMode() === 'desktop') {
            options.desktopMode.bringToFront()
          } else {
            const win = options.getWindow()
            win?.show()
            win?.focus()
          }
        }
      },
      {
        label: '바탕화면 모드',
        type: 'radio',
        checked: mode === 'desktop',
        click: () => {
          options.desktopMode.enterDesktop()
          rebuild()
        }
      },
      {
        label: '창 모드',
        type: 'radio',
        checked: mode === 'window',
        click: () => {
          options.desktopMode.enterWindow()
          rebuild()
        }
      },
      { type: 'separator' },
      {
        label: '종료',
        click: () => {
          app.quit()
        }
      }
    ])
    tray.setContextMenu(menu)
  }

  rebuild()
  tray.on('double-click', () => {
    if (options.desktopMode.getLaunchMode() === 'desktop') {
      options.desktopMode.bringToFront()
    } else {
      const win = options.getWindow()
      win?.show()
      win?.focus()
    }
  })

  console.log('[tray] Tray icon ready')
  return tray
}
