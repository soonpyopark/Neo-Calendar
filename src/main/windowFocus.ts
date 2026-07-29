import type { BrowserWindow } from 'electron'
import koffi from 'koffi'

type User32FocusApi = {
  SetForegroundWindow: (hwnd: bigint) => number
  SetFocus: (hwnd: bigint) => unknown
  BringWindowToTop: (hwnd: bigint) => number
  AllowSetForegroundWindow: (pid: number) => number
  SetParent: (hwnd: unknown, parent: unknown) => unknown
  SetWindowPos: (
    hwnd: unknown,
    insertAfter: unknown,
    x: number,
    y: number,
    cx: number,
    cy: number,
    flags: number
  ) => boolean
}

const HWND_TOPMOST = -1
const HWND_NOTOPMOST = -2
const SWP_NOMOVE = 0x0002
const SWP_NOSIZE = 0x0001
const SWP_NOACTIVATE = 0x0010
const SWP_SHOWWINDOW = 0x0040

let api: User32FocusApi | null = null

function hwndFromBuffer(handle: Buffer): bigint {
  return process.arch === 'x64' || process.arch === 'arm64'
    ? handle.readBigUInt64LE(0)
    : BigInt(handle.readUInt32LE(0))
}

function getUser32(): User32FocusApi | null {
  if (process.platform !== 'win32') return null
  if (api) return api
  try {
    const user32 = koffi.load('user32.dll')
    api = {
      SetForegroundWindow: user32.func('SetForegroundWindow', 'bool', ['void *']) as User32FocusApi['SetForegroundWindow'],
      SetFocus: user32.func('SetFocus', 'void *', ['void *']) as User32FocusApi['SetFocus'],
      BringWindowToTop: user32.func('BringWindowToTop', 'bool', ['void *']) as User32FocusApi['BringWindowToTop'],
      AllowSetForegroundWindow: user32.func('AllowSetForegroundWindow', 'bool', [
        'uint32'
      ]) as User32FocusApi['AllowSetForegroundWindow'],
      SetParent: user32.func('SetParent', 'void *', ['void *', 'void *']) as User32FocusApi['SetParent'],
      SetWindowPos: user32.func('SetWindowPos', 'bool', [
        'void *',
        'void *',
        'int',
        'int',
        'int',
        'int',
        'uint32'
      ]) as User32FocusApi['SetWindowPos']
    }
    return api
  } catch (error) {
    console.warn('[focus] user32 load failed', error)
    return null
  }
}

/**
 * WorkerW-embedded desktop: ensure a floating panel is not owned by / parented
 * to the wallpaper HWND (which would keep it under the main calendar layer).
 */
export function raiseFloatingPanelWindow(win: BrowserWindow | null | undefined): void {
  if (!win || win.isDestroyed()) return

  try {
    win.setParentWindow(null)
  } catch (error) {
    console.warn('[focus] setParentWindow(null) failed', error)
  }

  try {
    win.setAlwaysOnTop(true, 'screen-saver')
    win.moveTop()
  } catch (error) {
    console.warn('[focus] panel alwaysOnTop failed', error)
  }

  if (process.platform !== 'win32') return
  const user32 = getUser32()
  if (!user32) return

  try {
    const hwnd = hwndFromBuffer(win.getNativeWindowHandle())
    if (hwnd === 0n) return
    user32.SetParent(hwnd, 0n)
    user32.SetWindowPos(
      hwnd,
      HWND_TOPMOST,
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW
    )
    user32.BringWindowToTop(hwnd)
  } catch (error) {
    console.warn('[focus] native panel raise failed', error)
  }
}

/**
 * Step a panel out of the topmost band so another app's window (browser, attachment
 * viewer) can open above it. Pairs with {@link raiseFloatingPanelWindow}, which is
 * called again as soon as the user returns to the panel.
 */
export function lowerFloatingPanelWindow(win: BrowserWindow | null | undefined): void {
  if (!win || win.isDestroyed()) return

  try {
    win.setAlwaysOnTop(false)
  } catch (error) {
    console.warn('[focus] panel alwaysOnTop(false) failed', error)
  }

  if (process.platform !== 'win32') return
  const user32 = getUser32()
  if (!user32) return

  try {
    const hwnd = hwndFromBuffer(win.getNativeWindowHandle())
    if (hwnd === 0n) return
    // raiseFloatingPanelWindow set WS_EX_TOPMOST natively — clear it the same way.
    user32.SetWindowPos(
      hwnd,
      HWND_NOTOPMOST,
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE
    )
  } catch (error) {
    console.warn('[focus] native panel lower failed', error)
  }
}

/**
 * Give the Electron HWND OS keyboard focus so Windows Hangul IME can attach.
 * DOM `.focus()` alone is not enough after `showInactive()` / WorkerW undock.
 */
export function focusWindowForTextInput(win: BrowserWindow | null | undefined): void {
  if (!win || win.isDestroyed()) return

  try {
    if (!win.isVisible()) win.show()
    win.focus()
    if (!win.webContents.isDestroyed()) {
      win.webContents.focus()
    }
  } catch (error) {
    console.warn('[focus] BrowserWindow focus failed', error)
  }

  if (process.platform !== 'win32') return
  const user32 = getUser32()
  if (!user32) return

  try {
    const hwnd = hwndFromBuffer(win.getNativeWindowHandle())
    if (hwnd === 0n) return
    // ASFW_ANY = (DWORD)-1
    user32.AllowSetForegroundWindow(0xffffffff)
    user32.BringWindowToTop(hwnd)
    user32.SetForegroundWindow(hwnd)
    user32.SetFocus(hwnd)
    if (!win.webContents.isDestroyed()) {
      win.webContents.focus()
    }
  } catch (error) {
    console.warn('[focus] SetForegroundWindow failed', error)
  }
}
