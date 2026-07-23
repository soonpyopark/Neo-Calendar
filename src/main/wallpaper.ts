import { BrowserWindow } from 'electron'
import koffi from 'koffi'

/**
 * Desktop-mode z-order (MDC DesktopEmbedService.SendToBottom + Neo click-through).
 *
 * - Keeps a top-level HWND (NO WorkerW SetParent) so mouse forwarding works.
 * - Parks the window immediately above the desktop shell (Progman/WorkerW + DefView)
 *   so it sits on the desktop layer under normal apps (Win+D safe).
 * - Click-through remains `setIgnoreMouseEvents(true, { forward: true })` in desktopMode.
 */

const HWND_BOTTOM = 1
const HWND_TOP = 0
const GW_HWNDPREV = 3
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOACTIVATE = 0x0010
const SWP_SHOWWINDOW = 0x0040
const SMTO_NORMAL = 0x0000

type User32 = {
  FindWindowW: (...args: unknown[]) => unknown
  FindWindowExW: (...args: unknown[]) => unknown
  GetWindow: (...args: unknown[]) => unknown
  SetWindowPos: (...args: unknown[]) => unknown
  EnumWindows: (...args: unknown[]) => unknown
  SendMessageTimeoutW: (...args: unknown[]) => unknown
  EnumWindowsProc: unknown
}

let user32Api: User32 | null = null
let bottomTimer: ReturnType<typeof setInterval> | null = null
let pinnedWindow: BrowserWindow | null = null

function hwndFromBuffer(handle: Buffer): bigint {
  return process.arch === 'x64' || process.arch === 'arm64'
    ? handle.readBigUInt64LE(0)
    : BigInt(handle.readUInt32LE(0))
}

function asHwnd(value: unknown): bigint {
  if (value == null) return 0n
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(value)
  try {
    return BigInt(koffi.address(value as object))
  } catch {
    return 0n
  }
}

function getUser32(): User32 {
  if (user32Api) return user32Api
  const user32 = koffi.load('user32.dll')
  const EnumWindowsProc = koffi.proto(
    'bool __stdcall NeoEnumWindowsProc(void *hwnd, intptr lParam)'
  )
  user32Api = {
    FindWindowW: user32.func('FindWindowW', 'void *', ['str16', 'str16']),
    FindWindowExW: user32.func('FindWindowExW', 'void *', [
      'void *',
      'void *',
      'str16',
      'str16'
    ]),
    GetWindow: user32.func('GetWindow', 'void *', ['void *', 'uint32']),
    SetWindowPos: user32.func('SetWindowPos', 'bool', [
      'void *',
      'void *',
      'int',
      'int',
      'int',
      'int',
      'uint32'
    ]),
    EnumWindows: user32.func('EnumWindows', 'bool', [koffi.pointer(EnumWindowsProc), 'intptr']),
    SendMessageTimeoutW: user32.func('SendMessageTimeoutW', 'void *', [
      'void *',
      'uint32',
      'uintptr',
      'intptr',
      'uint32',
      'uint32',
      'void *'
    ]),
    EnumWindowsProc
  }
  return user32Api
}

/** Progman / WorkerW that hosts SHELLDLL_DefView — z-order anchor only. */
function findDesktopShellWindow(): bigint {
  const api = getUser32()
  let progman = asHwnd(api.FindWindowW('Progman', 'Program Manager'))
  if (progman === 0n) progman = asHwnd(api.FindWindowW('Progman', null))

  if (progman !== 0n) {
    const defView = asHwnd(api.FindWindowExW(progman, null, 'SHELLDLL_DefView', null))
    if (defView !== 0n) return progman
  }

  let result = 0n
  const callback = koffi.register((hwnd: unknown) => {
    const defView = asHwnd(api.FindWindowExW(hwnd, null, 'SHELLDLL_DefView', null))
    if (defView !== 0n) {
      result = asHwnd(hwnd)
      return false
    }
    return true
  }, koffi.pointer(api.EnumWindowsProc as never))

  try {
    api.EnumWindows(callback, 0)
  } finally {
    koffi.unregister(callback)
  }

  return result
}

export function sendToDesktopBottom(win: BrowserWindow): void {
  if (process.platform !== 'win32' || win.isDestroyed()) return

  try {
    const api = getUser32()
    const hwnd = hwndFromBuffer(win.getNativeWindowHandle())
    const shell = findDesktopShellWindow()

    if (shell !== 0n && shell !== hwnd) {
      const aboveShell = asHwnd(api.GetWindow(shell, GW_HWNDPREV))
      if (aboveShell === hwnd) return

      if (aboveShell !== 0n) {
        api.SetWindowPos(
          hwnd,
          aboveShell,
          0,
          0,
          0,
          0,
          SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW
        )
        return
      }
    }

    api.SetWindowPos(
      hwnd,
      HWND_BOTTOM,
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW
    )
  } catch (error) {
    console.error('[wallpaper] sendToDesktopBottom failed:', error)
  }
}

export function setAsWallpaper(win: BrowserWindow): void {
  if (process.platform !== 'win32') {
    win.setAlwaysOnTop(false)
    return
  }

  win.setAlwaysOnTop(false)
  sendToDesktopBottom(win)
  pinnedWindow = win

  if (!bottomTimer) {
    bottomTimer = setInterval(() => {
      if (!pinnedWindow || pinnedWindow.isDestroyed()) return
      sendToDesktopBottom(pinnedWindow)
    }, 250)
  }

  console.log('[wallpaper] Desktop embed: always-on-bottom above shell (click-through capable)')
}

export function clearWallpaperPin(): void {
  pinnedWindow = null
  if (bottomTimer) {
    clearInterval(bottomTimer)
    bottomTimer = null
  }
}

export function raiseWindow(win: BrowserWindow): void {
  if (process.platform !== 'win32' || win.isDestroyed()) {
    win.setAlwaysOnTop(true, 'screen-saver')
    return
  }
  try {
    const api = getUser32()
    const hwnd = hwndFromBuffer(win.getNativeWindowHandle())
    api.SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)
  } catch {
    win.setAlwaysOnTop(true, 'screen-saver')
  }
}

export type WallpaperBrowserWindow = BrowserWindow & {
  setAsWallpaper: () => void
}

export function withWallpaperApi(win: BrowserWindow): WallpaperBrowserWindow {
  const wallpaperWindow = win as WallpaperBrowserWindow
  wallpaperWindow.setAsWallpaper = () => {
    setAsWallpaper(win)
  }
  return wallpaperWindow
}
