import type { BrowserWindow } from 'electron'
import koffi from 'koffi'

type User32FocusApi = {
  SetForegroundWindow: (hwnd: bigint) => number
  SetFocus: (hwnd: bigint) => unknown
  BringWindowToTop: (hwnd: bigint) => number
  AllowSetForegroundWindow: (pid: number) => number
}

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
      ]) as User32FocusApi['AllowSetForegroundWindow']
    }
    return api
  } catch (error) {
    console.warn('[focus] user32 load failed', error)
    return null
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
