import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DesktopModeController } from './desktopMode'
import { APP_NAME } from '../shared/constants'

function resolveTrayImage(): Electron.NativeImage {
  const candidates = [
    join(process.cwd(), 'src/renderer/public/icons/trayIcon-16.png'),
    join(process.cwd(), 'src/renderer/public/icons/trayIcon.png'),
    join(process.cwd(), 'src/renderer/public/icon.png'),
    join(app.getAppPath(), 'src/renderer/public/icons/trayIcon-16.png'),
    join(app.getAppPath(), 'src/renderer/public/icon.png'),
    join(__dirname, '../../src/renderer/public/icons/trayIcon-16.png'),
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

  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIElEQVQ4T2NkYGD4z0ABYBzVMKoBBgYGhv8UgBE0AAAhQH9zqK9WwAAAABJRU5ErkJggg=='
  )
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
  tray.setToolTip(APP_NAME)

  const rebuild = (): void => {
    const mode = options.desktopMode.getLaunchMode()
    const menu = Menu.buildFromTemplate([
      {
        label: '열기',
        click: () => {
          const win = options.getWindow()
          if (!win) return
          win.show()
          win.focus()
          if (options.desktopMode.getLaunchMode() !== 'window') {
            options.desktopMode.enterWindow({ force: true })
          }
        }
      },
      {
        label: mode === 'desktop' ? '✓ 바탕화면 모드' : '바탕화면 모드',
        click: () => {
          if (options.desktopMode.getLaunchMode() === 'desktop') return
          options.desktopMode.enterDesktop({
            intentional: true,
            force: true,
            fromTray: true
          })
          rebuild()
        }
      },
      {
        label: mode === 'window' ? '✓ 창 모드' : '창 모드',
        click: () => {
          if (options.desktopMode.getLaunchMode() === 'window') {
            const win = options.getWindow()
            win?.show()
            win?.focus()
            return
          }
          options.desktopMode.enterWindow({ force: true })
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
    options.desktopMode.enterWindow({ force: true })
    const win = options.getWindow()
    win?.show()
    win?.focus()
    rebuild()
  })

  console.log('[tray] Tray icon ready')
  return Object.assign(tray, { rebuildMenu: rebuild })
}

export type AppTray = Tray & { rebuildMenu?: () => void }
