import { app, BrowserWindow, Menu, Tray, dialog, nativeImage, shell } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DesktopModeController } from './desktopMode'
import { APP_NAME, APP_TITLE, SITE_URL } from '../shared/constants'

/** Visible 16×16 blue square PNG — last-resort fallback (old 1px placeholder was invisible). */
const FALLBACK_TRAY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALElEQVQ4T2NkYGD4z0AEYBxVMFQGD4waMGrAqAGjBtDIgKECRg0YNWAUDADhAQEA0o8B/6Yx9e8AAAAASUVORK5CYII='

function trayIconCandidates(): string[] {
  const exeDir = dirname(process.execPath)
  const resourcesPath =
    typeof process.resourcesPath === 'string' && process.resourcesPath
      ? process.resourcesPath
      : join(exeDir, 'resources')

  return [
    // Packaged MSI / electron-builder: extraResources → resources/icons/
    join(resourcesPath, 'icons', 'trayIcon-16.png'),
    join(resourcesPath, 'icons', 'trayIcon.png'),
    join(resourcesPath, 'icons', 'appIcon.png'),
    join(exeDir, 'app-icon.ico'),
    join(exeDir, 'resources', 'icons', 'trayIcon-16.png'),
    // Dev
    join(process.cwd(), 'src/renderer/public/icons/trayIcon-16.png'),
    join(process.cwd(), 'src/renderer/public/icons/trayIcon.png'),
    join(process.cwd(), 'src/renderer/public/icon.png'),
    join(app.getAppPath(), 'src/renderer/public/icons/trayIcon-16.png'),
    join(app.getAppPath(), 'src/renderer/public/icon.png'),
    join(__dirname, '../../src/renderer/public/icons/trayIcon-16.png'),
    join(__dirname, '../../src/renderer/public/icon.png')
  ]
}

function resolveTrayImage(): Electron.NativeImage {
  for (const iconPath of trayIconCandidates()) {
    if (!existsSync(iconPath)) continue
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) {
      console.log('[tray] Using icon:', iconPath)
      return image.getSize().width > 16 ? image.resize({ width: 16, height: 16 }) : image
    }
  }

  console.warn('[tray] No packaged icon found — using fallback PNG')
  return nativeImage.createFromDataURL(FALLBACK_TRAY_PNG)
}

export type AppTray = Tray & {
  rebuildMenu?: () => void
  hideToTray?: () => void
  showFromTray?: () => void
  bringToFront?: () => void
}

/**
 * MDC NotifyIcon context menu (MainWindow.SetupTray) — Neo Electron port.
 */
export function createAppTray(options: {
  getWindow: () => BrowserWindow | null
  desktopMode: DesktopModeController
  getDataRoot: () => string
  requestQuit: () => void
  webServer?: {
    isRunning: boolean
    lanMode: boolean
    tryStart: (opts?: {
      mode?: 'local' | 'lan' | 'env'
      requirePortInEnv?: boolean
    }) => Promise<{ ok: boolean; message: string }>
    stop: () => { ok: boolean; message: string }
  } | null
}): AppTray | null {
  const image = resolveTrayImage()
  if (image.isEmpty()) {
    console.error('[tray] Failed to load tray icon')
    return null
  }

  const tray = new Tray(image) as AppTray
  tray.setToolTip(APP_TITLE)
  let closeTipShown = false
  try {
    if (existsSync(join(options.getDataRoot(), '.close-to-tray-tip-shown'))) {
      closeTipShown = true
    }
  } catch {
    /* ignore */
  }

  const maybeShowCloseToTrayTip = (): void => {
    if (closeTipShown) return
    try {
      const tipPath = join(options.getDataRoot(), '.close-to-tray-tip-shown')
      if (existsSync(tipPath)) {
        closeTipShown = true
        return
      }
      writeFileSync(tipPath, new Date().toISOString(), 'utf8')
      closeTipShown = true
      tray.displayBalloon({
        title: APP_NAME,
        content:
          '닫으면 트레이로 이동합니다. 완전히 종료하려면 트레이 아이콘 → 종료를 선택하세요.',
        iconType: 'info'
      })
    } catch {
      /* ignore */
    }
  }

  const showFromTray = (): void => {
    // Explicit "창 모드" command changes and persists the launch mode.
    options.desktopMode.enterWindow({ force: true })
    const win = options.getWindow()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.moveTop()
    rebuild()
  }

  const bringToFront = (): void => {
    // Preserve the current launch mode:
    // desktop → temporary unlock, window → raise the normal window.
    if (options.desktopMode.getLaunchMode() === 'desktop') {
      options.desktopMode.suspendForInteraction()
    }
    const win = options.getWindow()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.setAlwaysOnTop(true, 'floating')
    win.show()
    win.focus()
    win.moveTop()
    setTimeout(() => {
      const current = options.getWindow()
      if (!current || current.isDestroyed()) return
      current.setAlwaysOnTop(false)
    }, 400)
    rebuild()
  }

  const hideToTray = (): void => {
    const win = options.getWindow()
    if (!win || win.isDestroyed()) return
    win.hide()
    maybeShowCloseToTrayTip()
  }

  const showAbout = (): void => {
    const win = options.getWindow()
    const box = {
      type: 'info' as const,
      title: '정보',
      message: APP_TITLE,
      detail: `Electron 데스크톱 셸\n${SITE_URL}`,
      buttons: ['확인', '사이트 열기'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    }
    const promise =
      win && !win.isDestroyed()
        ? dialog.showMessageBox(win, box)
        : dialog.showMessageBox(box)
    void promise.then((result) => {
      if (result.response === 1) {
        void shell.openExternal(SITE_URL)
      }
    })
  }

  const balloon = (content: string): void => {
    try {
      tray.displayBalloon({
        title: APP_NAME,
        content,
        iconType: 'info'
      })
    } catch {
      /* ignore */
    }
  }

  const rebuild = (): void => {
    const mode = options.desktopMode.getLaunchMode()
    const web = options.webServer
    const running = Boolean(web?.isRunning)
    // MDC RefreshTrayServerMenu: Local ↔ Web mutually exclusive; active mode checked.
    const lanMode = running && Boolean(web?.lanMode)
    const menu = Menu.buildFromTemplate([
      {
        label: running && !lanMode ? '✓ Start Server (local)' : 'Start Server (local)',
        enabled: Boolean(web) && (!running || lanMode),
        toolTip: '로컬(127.0.0.1)만 — Web과 동시에 실행되지 않습니다',
        click: () => {
          if (!web) return
          void web.tryStart({ mode: 'local', requirePortInEnv: false }).then((result) => {
            balloon(result.message)
            rebuild()
          })
        }
      },
      {
        label: lanMode ? '✓ Start Server (Web)' : 'Start Server (Web)',
        enabled: Boolean(web) && (!running || !lanMode),
        toolTip: 'LAN(0.0.0.0) — Local과 동시에 실행되지 않습니다 (URL ACL·방화벽 필요할 수 있음)',
        click: () => {
          if (!web) return
          void web.tryStart({ mode: 'lan', requirePortInEnv: false }).then((result) => {
            balloon(result.message)
            rebuild()
          })
        }
      },
      {
        label: 'Stop Server',
        enabled: Boolean(web) && running,
        click: () => {
          if (!web) return
          const result = web.stop()
          balloon(result.message)
          rebuild()
        }
      },
      { type: 'separator' },
      {
        label: '앞으로 가져오기',
        click: () => bringToFront()
      },
      {
        label: '트레이로 최소화하기',
        click: () => hideToTray()
      },
      { type: 'separator' },
      {
        label: mode === 'desktop' ? '✓ 바탕화면 모드' : '바탕화면 모드',
        click: () => {
          if (options.desktopMode.getLaunchMode() === 'desktop') return
          const win = options.getWindow()
          if (win && !win.isVisible()) win.showInactive()
          options.desktopMode.enterDesktop({
            intentional: true,
            force: true,
            fromTray: true
          })
          rebuild()
        }
      },
      {
        label: mode === 'window' ? '✓ 창 모드 (Unlock)' : '창 모드 (Unlock)',
        click: () => showFromTray()
      },
      { type: 'separator' },
      {
        label: '정보',
        click: () => showAbout()
      },
      {
        label: '종료',
        click: () => options.requestQuit()
      }
    ])
    tray.setContextMenu(menu)
  }

  tray.rebuildMenu = rebuild
  tray.hideToTray = hideToTray
  tray.showFromTray = showFromTray
  tray.bringToFront = bringToFront

  rebuild()

  // Double-click reveals the app without changing the selected launch mode.
  tray.on('double-click', () => {
    bringToFront()
  })

  console.log('[tray] Tray icon ready (MDC menu)')
  return tray
}
