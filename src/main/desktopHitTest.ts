import { screen } from 'electron'
import koffi from 'koffi'

const GA_ROOT = 2
const DESKTOP_CLASSES = new Set(['Progman', 'WorkerW', 'SHELLDLL_DefView'])

type Point = { x: number; y: number }

type HitTestApi = {
  WindowFromPoint: (pt: { x: number; y: number }) => unknown
  GetParent: (hwnd: unknown) => unknown
  GetAncestor: (hwnd: unknown, flags: number) => unknown
  IsChild: (parent: unknown, child: unknown) => boolean
  GetClassNameW: (hwnd: unknown, buf: Buffer, maxCount: number) => number
}

let api: HitTestApi | null = null

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

function getApi(): HitTestApi {
  if (api) return api
  const user32 = koffi.load('user32.dll')
  const POINT = koffi.struct('NEO_HIT_POINT', {
    x: 'long',
    y: 'long'
  })
  api = {
    WindowFromPoint: user32.func('WindowFromPoint', 'void *', [POINT]) as HitTestApi['WindowFromPoint'],
    GetParent: user32.func('GetParent', 'void *', ['void *']) as HitTestApi['GetParent'],
    GetAncestor: user32.func('GetAncestor', 'void *', ['void *', 'uint32']) as HitTestApi['GetAncestor'],
    IsChild: user32.func('IsChild', 'bool', ['void *', 'void *']) as HitTestApi['IsChild'],
    GetClassNameW: user32.func('GetClassNameW', 'int', [
      'void *',
      'void *',
      'int'
    ]) as HitTestApi['GetClassNameW']
  }
  return api
}

export function hwndFromNativeHandle(handle: Buffer): bigint {
  return process.arch === 'x64' || process.arch === 'arm64'
    ? handle.readBigUInt64LE(0)
    : BigInt(handle.readUInt32LE(0))
}

function toPhysicalPoint(pt: Point): Point {
  try {
    const physical = screen.dipToScreenPoint(pt)
    return { x: Math.round(physical.x), y: Math.round(physical.y) }
  } catch {
    const scale = screen.getDisplayNearestPoint(pt).scaleFactor || 1
    return { x: Math.round(pt.x * scale), y: Math.round(pt.y * scale) }
  }
}

function classNameOf(hwnd: bigint): string {
  const a = getApi()
  const buf = Buffer.alloc(512)
  const len = a.GetClassNameW(hwnd, buf, 256)
  if (len <= 0) return ''
  return buf.toString('utf16le', 0, len * 2)
}

/**
 * True when the topmost window under the DIP cursor is our HWND (or child),
 * or a desktop shell surface (Progman / WorkerW / icon layer).
 * Used so WorkerW click bridges ignore double-clicks aimed at other apps.
 */
export function isPointOverDesktopOrOurWindow(
  dipPt: Point,
  ourHwnd: bigint | null | undefined
): boolean {
  if (process.platform !== 'win32') return true

  const a = getApi()
  const pt = toPhysicalPoint(dipPt)
  const hit = asHwnd(a.WindowFromPoint({ x: pt.x, y: pt.y }))
  if (hit === 0n) return false

  if (ourHwnd && ourHwnd !== 0n) {
    if (hit === ourHwnd) return true
    if (a.IsChild(ourHwnd, hit)) return true
    if (asHwnd(a.GetAncestor(hit, GA_ROOT)) === ourHwnd) return true
  }

  let cur = hit
  for (let i = 0; i < 24 && cur !== 0n; i += 1) {
    if (DESKTOP_CLASSES.has(classNameOf(cur))) return true
    cur = asHwnd(a.GetParent(cur))
  }
  return false
}
