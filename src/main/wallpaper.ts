import { BrowserWindow } from 'electron'
import koffi from 'koffi'

/**
 * Pins the window to the bottom of the Z-order as a desktop overlay.
 *
 * NOTE: True WorkerW (under-icon wallpaper) parenting is intentionally NOT used.
 * A child of WorkerW sits beneath the desktop icon layer, so Windows never
 * delivers mouse input — click-through interaction becomes impossible.
 * Instead we keep a top-level transparent window at HWND_BOTTOM so
 * `setIgnoreMouseEvents(..., { forward: true })` can drive interactive hotspots.
 */

const HWND_BOTTOM = 1
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOACTIVATE = 0x0010

function hwndFromBuffer(handle: Buffer): bigint {
  return process.arch === 'x64' || process.arch === 'arm64'
    ? handle.readBigUInt64LE(0)
    : BigInt(handle.readUInt32LE(0))
}

export function setAsWallpaper(win: BrowserWindow): void {
  if (process.platform !== 'win32') {
    win.setAlwaysOnTop(false)
    return
  }

  try {
    const user32 = koffi.load('user32.dll')
    const SetWindowPos = user32.func('SetWindowPos', 'bool', [
      'void *',
      'void *',
      'int',
      'int',
      'int',
      'int',
      'uint32'
    ])

    win.setAlwaysOnTop(false)
    const hwnd = hwndFromBuffer(win.getNativeWindowHandle())
    SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
    console.log('[wallpaper] Pinned to HWND_BOTTOM (interactive desktop overlay)')
  } catch (error) {
    console.error('[wallpaper] Failed to pin window:', error)
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
