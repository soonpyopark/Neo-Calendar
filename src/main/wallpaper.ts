import { BrowserWindow } from 'electron'
import koffi from 'koffi'

/**
 * Desktop wallpaper attachment.
 *
 * Principle #1 (desktop mode): sit UNDER desktop icons via WorkerW SetParent.
 * This takes priority over click-through / overlay interactivity.
 * If WorkerW cannot be found, fall back to shell-bottom overlay.
 */

const SMTO_NORMAL = 0x0000
const HWND_BOTTOM = 1
const HWND_TOP = 0
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOACTIVATE = 0x0010
const SWP_SHOWWINDOW = 0x0040
const GW_HWNDPREV = 3
/** Undocumented Progman message that spawns the WorkerW wallpaper host. */
const WM_SPAWN_WORKERW = 0x052c

type User32Api = {
  FindWindowW: (...args: unknown[]) => unknown
  FindWindowExW: (...args: unknown[]) => unknown
  SendMessageTimeoutW: (...args: unknown[]) => unknown
  EnumWindows: (...args: unknown[]) => unknown
  SetParent: (...args: unknown[]) => unknown
  SetWindowPos: (...args: unknown[]) => unknown
  GetWindow: (...args: unknown[]) => unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  EnumWindowsProc: any
}

let user32Api: User32Api | null = null
let embeddedHwnd: bigint | null = null

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

function getUser32(): User32Api {
  if (user32Api) return user32Api

  const user32 = koffi.load('user32.dll')
  const EnumWindowsProc = koffi.proto('bool __stdcall EnumWindowsProc(void *hwnd, intptr lParam)')

  user32Api = {
    FindWindowW: user32.func('FindWindowW', 'void *', ['str16', 'str16']),
    FindWindowExW: user32.func('FindWindowExW', 'void *', ['void *', 'void *', 'str16', 'str16']),
    SendMessageTimeoutW: user32.func('SendMessageTimeoutW', 'void *', [
      'void *',
      'uint32',
      'void *',
      'void *',
      'uint32',
      'uint32',
      'void *'
    ]),
    EnumWindows: user32.func('EnumWindows', 'bool', ['EnumWindowsProc *', 'intptr']),
    SetParent: user32.func('SetParent', 'void *', ['void *', 'void *']),
    SetWindowPos: user32.func('SetWindowPos', 'bool', [
      'void *',
      'void *',
      'int',
      'int',
      'int',
      'int',
      'uint32'
    ]),
    GetWindow: user32.func('GetWindow', 'void *', ['void *', 'uint32']),
    EnumWindowsProc
  }

  return user32Api
}

/** Find WorkerW that sits behind SHELLDLL_DefView (under icons). */
function findWorkerW(): bigint {
  const api = getUser32()
  const progman = asHwnd(api.FindWindowW('Progman', null))
  if (progman === 0n) return 0n

  // Spawn / refresh the wallpaper WorkerW host.
  api.SendMessageTimeoutW(progman, WM_SPAWN_WORKERW, 0n, 0n, SMTO_NORMAL, 1000, null)

  let workerw = 0n
  const callback = koffi.register((topHwnd: unknown) => {
    const top = asHwnd(topHwnd)
    const defView = asHwnd(api.FindWindowExW(top, 0n, 'SHELLDLL_DefView', null))
    if (defView !== 0n) {
      workerw = asHwnd(api.FindWindowExW(0n, top, 'WorkerW', null))
      return false
    }
    return true
  }, koffi.pointer(api.EnumWindowsProc as never))

  try {
    api.EnumWindows(callback, 0)
  } finally {
    koffi.unregister(callback)
  }

  if (workerw !== 0n) return workerw

  // Fallback: WorkerW child of Progman on some Windows builds.
  return asHwnd(api.FindWindowExW(progman, 0n, 'WorkerW', null))
}

function findDesktopShellWindow(): bigint {
  const api = getUser32()
  const progman = asHwnd(api.FindWindowW('Progman', null))
  if (progman !== 0n && asHwnd(api.FindWindowExW(progman, 0n, 'SHELLDLL_DefView', null)) !== 0n) {
    return progman
  }

  let shell = 0n
  const callback = koffi.register((topHwnd: unknown) => {
    const top = asHwnd(topHwnd)
    if (asHwnd(api.FindWindowExW(top, 0n, 'SHELLDLL_DefView', null)) !== 0n) {
      shell = top
      return false
    }
    return true
  }, koffi.pointer(api.EnumWindowsProc as never))

  try {
    api.EnumWindows(callback, 0)
  } finally {
    koffi.unregister(callback)
  }
  return shell
}

/** True while the calendar HWND is parented under WorkerW (under icons). */
export function isWorkerEmbedded(): boolean {
  return embeddedHwnd !== null
}

/**
 * Principle #1: parent under WorkerW so the calendar sits beneath desktop icons.
 * Fallback: park above the desktop shell if WorkerW is unavailable.
 */
export function setAsWallpaper(win: BrowserWindow): void {
  if (process.platform !== 'win32') {
    win.setAlwaysOnTop(false)
    return
  }

  try {
    const api = getUser32()
    const hwnd = hwndFromBuffer(win.getNativeWindowHandle())
    win.setAlwaysOnTop(false)

    const workerw = findWorkerW()
    if (workerw !== 0n) {
      api.SetParent(hwnd, workerw)
      api.SetWindowPos(
        hwnd,
        HWND_BOTTOM,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW
      )
      embeddedHwnd = hwnd
      console.log('[wallpaper] Attached to WorkerW (under desktop icons) — principle #1')
      return
    }

    console.warn('[wallpaper] WorkerW not found — falling back to shell-bottom overlay')
    sendToDesktopBottom(win)
    embeddedHwnd = null
  } catch (error) {
    console.error('[wallpaper] Failed to attach under icons:', error)
    try {
      sendToDesktopBottom(win)
    } catch {
      /* ignore */
    }
    embeddedHwnd = null
  }
}

/** Detach from WorkerW and raise to a normal top-level window. */
export function clearWallpaperPin(win?: BrowserWindow | null): void {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return

  try {
    const api = getUser32()
    const hwnd = hwndFromBuffer(win.getNativeWindowHandle())

    // SetParent(NULL) restores a top-level HWND after WorkerW embed.
    api.SetParent(hwnd, 0n)
    api.SetWindowPos(
      hwnd,
      HWND_TOP,
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW
    )
    embeddedHwnd = null
    console.log('[wallpaper] Detached from WorkerW — raised to top-level')
  } catch (error) {
    embeddedHwnd = null
    console.error('[wallpaper] Failed to detach wallpaper pin:', error)
  }
}

/** Fallback only: immediately above Progman/DefView host (NOT under icons). */
export function sendToDesktopBottom(win: BrowserWindow): void {
  if (process.platform !== 'win32') return

  try {
    const api = getUser32()
    const hwnd = hwndFromBuffer(win.getNativeWindowHandle())
    const shell = findDesktopShellWindow()

    win.setAlwaysOnTop(false)
    if (shell !== 0n) {
      const aboveShell = asHwnd(api.GetWindow(shell, GW_HWNDPREV))
      if (aboveShell !== 0n && aboveShell !== hwnd) {
        api.SetWindowPos(
          hwnd,
          aboveShell,
          0,
          0,
          0,
          0,
          SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW
        )
        console.log('[wallpaper] Pinned above desktop shell (fallback overlay)')
        return
      }
    }

    api.SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
    console.log('[wallpaper] Pinned HWND_BOTTOM (fallback)')
  } catch (error) {
    console.error('[wallpaper] sendToDesktopBottom failed:', error)
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
