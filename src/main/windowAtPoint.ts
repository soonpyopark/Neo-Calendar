import { BrowserWindow, screen } from 'electron'
import koffi from 'koffi'

/** Desktop / WorkerW layers — clicks here may reach the embedded calendar. */
const DESKTOP_SHELL_CLASSES = new Set([
  'Progman',
  'WorkerW',
  'Shell_TrayWnd',
  'SysListView32',
  'SHELLDLL_DefView',
  'DV2ControlHost',
  'DirectUIHWND',
  'ForegroundStaging',
  'tooltips_class32',
  'TopLevelWindowForOverflowXamlIsland'
])

type WindowAtPointApi = {
  WindowFromPoint: (x: number, y: number) => unknown
  GetForegroundWindow: () => unknown
  GetWindowThreadProcessId: (hwnd: unknown, pidOut: Buffer) => number
  GetClassNameW: (hwnd: unknown, buf: Buffer, max: number) => number
  IsChild: (parent: unknown, child: unknown) => number
  GetAncestor: (hwnd: unknown, flags: number) => unknown
}

const GA_PARENT = 3

let user32Api: WindowAtPointApi | null = null

function getUser32(): WindowAtPointApi {
  if (user32Api) return user32Api
  const user32 = koffi.load('user32.dll')
  user32Api = {
    WindowFromPoint: user32.func('WindowFromPoint', 'void *', ['long', 'long']) as WindowAtPointApi['WindowFromPoint'],
    GetForegroundWindow: user32.func('GetForegroundWindow', 'void *', []) as WindowAtPointApi['GetForegroundWindow'],
    GetWindowThreadProcessId: user32.func('GetWindowThreadProcessId', 'uint32', [
      'void *',
      'uint32 *'
    ]) as WindowAtPointApi['GetWindowThreadProcessId'],
    GetClassNameW: user32.func('GetClassNameW', 'int', ['void *', 'void *', 'int']) as WindowAtPointApi['GetClassNameW'],
    IsChild: user32.func('IsChild', 'bool', ['void *', 'void *']) as WindowAtPointApi['IsChild'],
    GetAncestor: user32.func('GetAncestor', 'void *', ['void *', 'uint32']) as WindowAtPointApi['GetAncestor']
  }
  return user32Api
}

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

function dipToPhysicalPoint(pt: { x: number; y: number }): { x: number; y: number } {
  try {
    return screen.dipToScreenPoint(pt)
  } catch {
    const display = screen.getDisplayNearestPoint(pt)
    const s = display.scaleFactor || 1
    return { x: Math.round(pt.x * s), y: Math.round(pt.y * s) }
  }
}

function readPid(user32: WindowAtPointApi, hwnd: unknown): number {
  try {
    const pidOut = Buffer.alloc(4)
    user32.GetWindowThreadProcessId(hwnd, pidOut)
    return pidOut.readUInt32LE(0)
  } catch {
    return 0
  }
}

function readClassName(user32: WindowAtPointApi, hwnd: unknown): string {
  try {
    const buf = Buffer.alloc(512)
    const len = user32.GetClassNameW(hwnd, buf, 256)
    if (len <= 0) return ''
    return buf.toString('utf16le', 0, len * 2)
  } catch {
    return ''
  }
}

function isOurHwnd(user32: WindowAtPointApi, hwnd: unknown, ourHwnd: bigint): boolean {
  const at = asHwnd(hwnd)
  if (at === 0n) return false
  if (at === ourHwnd) return true
  try {
    return Boolean(user32.IsChild(ourHwnd, hwnd))
  } catch {
    return false
  }
}

function isDesktopShellHwnd(user32: WindowAtPointApi, hwnd: unknown): boolean {
  let current: unknown = hwnd
  for (let depth = 0; depth < 10 && current; depth += 1) {
    const className = readClassName(user32, current)
    if (DESKTOP_SHELL_CLASSES.has(className)) return true
    try {
      const parent = user32.GetAncestor(current, GA_PARENT)
      if (!parent || asHwnd(parent) === asHwnd(current)) break
      current = parent
    } catch {
      break
    }
  }
  return false
}

function hwndAtPhysicalPoint(user32: WindowAtPointApi, ptDip: { x: number; y: number }): unknown {
  const physical = dipToPhysicalPoint(ptDip)
  return user32.WindowFromPoint(Math.round(physical.x), Math.round(physical.y))
}

function isForeignProcessHwnd(
  user32: WindowAtPointApi,
  hwnd: unknown,
  ourHwnd: bigint
): boolean {
  if (!hwnd) return false
  if (isOurHwnd(user32, hwnd, ourHwnd)) return false
  if (isDesktopShellHwnd(user32, hwnd)) return false
  const pid = readPid(user32, hwnd)
  if (pid === 0) return false
  return pid !== process.pid
}

/**
 * True when the topmost window under `pt` belongs to another application.
 */
export function isForeignAppAtPoint(
  win: BrowserWindow | null | undefined,
  ptDip: { x: number; y: number }
): boolean {
  if (process.platform !== 'win32') return false
  if (!win || win.isDestroyed()) return false

  const user32 = getUser32()
  const ourHwnd = hwndFromBuffer(win.getNativeWindowHandle())
  const atPoint = hwndAtPhysicalPoint(user32, ptDip)
  if (!atPoint) return false
  return isForeignProcessHwnd(user32, atPoint, ourHwnd)
}

/**
 * WorkerW-embedded global hook: accept only when the click target is the OS
 * desktop shell, or our own window while we already have focus.
 * Blocks other apps and click-through on our surface while another app is focused.
 */
export function shouldProcessEmbeddedGlobalClick(
  win: BrowserWindow | null | undefined,
  ptDip: { x: number; y: number }
): boolean {
  if (process.platform !== 'win32') return true
  if (!win || win.isDestroyed()) return true

  const user32 = getUser32()
  const ourHwnd = hwndFromBuffer(win.getNativeWindowHandle())
  const atPoint = hwndAtPhysicalPoint(user32, ptDip)
  const fg = user32.GetForegroundWindow()

  if (!atPoint) return false

  if (isForeignProcessHwnd(user32, atPoint, ourHwnd)) return false

  if (isDesktopShellHwnd(user32, atPoint)) return true

  if (isOurHwnd(user32, atPoint, ourHwnd)) {
    return isOurHwnd(user32, fg, ourHwnd)
  }

  return false
}
