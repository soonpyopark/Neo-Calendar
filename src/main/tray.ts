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

function resolveAppIconForMenu(): Electron.NativeImage | undefined {
  for (const iconPath of trayIconCandidates()) {
    if (!existsSync(iconPath)) continue
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) {
      return image.getSize().width > 16 ? image.resize({ width: 16, height: 16 }) : image
    }
  }
  return undefined
}

export type AppTray = Tray & {
  rebuildMenu?: () => void
  hideToTray?: () => void
  showFromTray?: () => void
  bringToFront?: () => void
}

/**
 * MDC NotifyIcon context menu (MainWindow.SetupTray) — Neo Electron port.
 * Web-server items are included for parity but disabled (Neo has no LAN editor host).
 */
export function createAppTray(options: {
  getWindow: () => BrowserWindow | null
  desktopMode: DesktopModeController
  getDataRoot: () => string
  requestQuit: () => void
}): AppTray | null {
  const image = resolveTrayImage()
  if (image.isEmpty()) {
    console.error('[tray] Failed to load tray icon')
    return null
  }

  const tray = new Tray(image) as AppTray
  tray.setToolTip(APP_TITLE)
  const desktopIcon = resolveAppIconForMenu()
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

  const bringToFront = (): void => {
    const win = options.getWindow()
    if (!win || win.isDestroyed()) return
    const mode = options.desktopMode.getLaunchMode()

    if (mode === 'desktop') {
      if (!win.isVisible()) win.show()
      // Raise above other apps so covered day cells can be double-clicked (MDC).
      options.desktopMode.suspendForInteraction()
      win.setAlwaysOnTop(true, 'floating')
      win.show()
      win.focus()
      win.moveTop()
      setTimeout(() => {
        if (options.desktopMode.getLaunchMode() !== 'desktop') return
        const current = options.getWindow()
        if (!current || current.isDestroyed()) return
        if (!options.desktopMode.isInteractionSuspended()) return
        current.setAlwaysOnTop(false)
      }, 2500)
      return
    }

    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.setAlwaysOnTop(true, 'floating')
    win.show()
    win.focus()
    win.moveTop()
    setTimeout(() => {
      const current = options.getWindow()
      if (!current || current.isDestroyed()) return
      if (options.desktopMode.getLaunchMode() === 'window') {
        current.setAlwaysOnTop(false)
      }
    }, 400)
  }

  const hideToTray = (): void => {
    const win = options.getWindow()
    if (!win || win.isDestroyed()) return
    try {
      if (
        options.desktopMode.getLaunchMode() === 'desktop' &&
        options.desktopMode.isInteractionSuspended()
      ) {
        options.desktopMode.resumeUnderIcons()
      }
    } catch {
      /* ignore */
    }
    win.hide()
    maybeShowCloseToTrayTip()
  }

  const showFromTray = (): void => {
    // MDC ShowFromTray → EnterWindowMode (Unlock) + bring to front.
    options.desktopMode.enterWindow({ force: true })
    const win = options.getWindow()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.moveTop()
    rebuild()
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

  const rebuild = (): void => {
    const mode = options.desktopMode.getLaunchMode()
    const menu = Menu.buildFromTemplate([
      {
        label: 'Start Server (local)',
        enabled: false,
        toolTip: 'Neo Calendar는 로컬 웹 서버 편집을 지원하지 않습니다.'
      },
      {
        label: 'Start Server (Web)',
        enabled: false,
        toolTip: 'Neo Calendar는 LAN 웹 서버 편집을 지원하지 않습니다.'
      },
      {
        label: 'Stop Server',
        enabled: false
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
        ...(desktopIcon ? { icon: desktopIcon } : {}),
        click: () => {
          if (options.desktopMode.getLaunchMode() === 'desktop') {
            bringToFront()
            return
          }
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

  // MDC: double-click → ShowFromTray (window unlock).
  tray.on('double-click', () => {
    showFromTray()
  })

  console.log('[tray] Tray icon ready (MDC menu)')
  return tray
}
