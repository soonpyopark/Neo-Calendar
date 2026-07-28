import { screen } from 'electron'
import koffi from 'koffi'

/**
 * Detect clicks on desktop icons (SysListView32 items) via cross-process LVM_HITTEST.
 * In-process helper (not a separate exe) — Explorer owns the list view memory.
 */

const LVM_FIRST = 0x1000
const LVM_HITTEST = LVM_FIRST + 18
const LVM_SUBITEMHITTEST = LVM_FIRST + 57
const LVHT_ONITEMICON = 0x0002
const LVHT_ONITEMLABEL = 0x0004
const LVHT_ONITEMSTATEICON = 0x0008
const LVHT_ONITEM = LVHT_ONITEMICON | LVHT_ONITEMLABEL | LVHT_ONITEMSTATEICON

const PROCESS_VM_OPERATION = 0x0008
const PROCESS_VM_READ = 0x0010
const PROCESS_VM_WRITE = 0x0020
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

const MEM_COMMIT = 0x1000
const MEM_RESERVE = 0x2000
const MEM_RELEASE = 0x8000
const PAGE_READWRITE = 0x04

/** LVHITTESTINFO: POINT(8) + UINT + 3×int = 24 bytes. */
const LVHITTESTINFO_SIZE = 24
const LISTVIEW_CACHE_MS = 4000
const LOG_COOLDOWN_MS = 800

type DesktopIconApi = {
  FindWindowW: (cls: string | null, name: string | null) => unknown
  FindWindowExW: (
    parent: unknown,
    childAfter: unknown,
    cls: string | null,
    name: string | null
  ) => unknown
  EnumWindows: (cb: unknown, lParam: number) => number
  GetWindowThreadProcessId: (hwnd: unknown, pidOut: Buffer) => number
  GetWindowRect: (
    hwnd: unknown,
    rectOut: { left: number; top: number; right: number; bottom: number }
  ) => number
  ScreenToClient: (hwnd: unknown, pt: { x: number; y: number }) => number
  SendMessageW: (hwnd: unknown, msg: number, wParam: number, lParam: bigint | number) => unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  EnumWindowsProc: any
}

type KernelApi = {
  OpenProcess: (access: number, inherit: number, pid: number) => unknown
  CloseHandle: (handle: unknown) => number
  VirtualAllocEx: (
    process: unknown,
    address: unknown,
    size: number,
    allocType: number,
    protect: number
  ) => unknown
  VirtualFreeEx: (process: unknown, address: unknown, size: number, freeType: number) => number
  WriteProcessMemory: (
    process: unknown,
    base: unknown,
    buffer: Buffer,
    size: number,
    written: Buffer | null
  ) => number
  ReadProcessMemory: (
    process: unknown,
    base: unknown,
    buffer: Buffer,
    size: number,
    read: Buffer | null
  ) => number
  GetLastError: () => number
}

let user32Api: DesktopIconApi | null = null
let kernelApi: KernelApi | null = null
let cachedListViews: { hwnds: unknown[]; at: number } | null = null
let lastLogAt = 0

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

function logHit(msg: string, data?: Record<string, unknown>): void {
  const now = Date.now()
  if (now - lastLogAt < LOG_COOLDOWN_MS) return
  lastLogAt = now
  if (data) console.log(`[desktop-icon] ${msg}`, data)
  else console.log(`[desktop-icon] ${msg}`)
}

function getUser32(): DesktopIconApi {
  if (user32Api) return user32Api
  const user32 = koffi.load('user32.dll')
  const EnumWindowsProc = koffi.proto(
    'bool __stdcall NeoDesktopIconEnumProc(void *hwnd, intptr lParam)'
  )
  const RECT = koffi.struct('NeoDesktopIconRect', {
    left: 'long',
    top: 'long',
    right: 'long',
    bottom: 'long'
  })
  const POINT = koffi.struct('NeoDesktopIconPoint', {
    x: 'long',
    y: 'long'
  })
  user32Api = {
    FindWindowW: user32.func('FindWindowW', 'void *', ['str16', 'str16']) as DesktopIconApi['FindWindowW'],
    FindWindowExW: user32.func('FindWindowExW', 'void *', [
      'void *',
      'void *',
      'str16',
      'str16'
    ]) as DesktopIconApi['FindWindowExW'],
    EnumWindows: user32.func('EnumWindows', 'bool', [
      'NeoDesktopIconEnumProc *',
      'intptr'
    ]) as DesktopIconApi['EnumWindows'],
    GetWindowThreadProcessId: user32.func('GetWindowThreadProcessId', 'uint32', [
      'void *',
      'uint32 *'
    ]) as DesktopIconApi['GetWindowThreadProcessId'],
    GetWindowRect: user32.func('GetWindowRect', 'bool', [
      'void *',
      koffi.out(koffi.pointer(RECT))
    ]) as DesktopIconApi['GetWindowRect'],
    ScreenToClient: user32.func('ScreenToClient', 'bool', [
      'void *',
      koffi.inout(koffi.pointer(POINT))
    ]) as DesktopIconApi['ScreenToClient'],
    // LPARAM must be the remote pointer address (64-bit safe).
    SendMessageW: user32.func('SendMessageW', 'intptr', [
      'void *',
      'uint32',
      'uintptr',
      'intptr'
    ]) as DesktopIconApi['SendMessageW'],
    EnumWindowsProc
  }
  return user32Api
}

function getKernel32(): KernelApi {
  if (kernelApi) return kernelApi
  const kernel32 = koffi.load('kernel32.dll')
  kernelApi = {
    OpenProcess: kernel32.func('OpenProcess', 'void *', [
      'uint32',
      'bool',
      'uint32'
    ]) as KernelApi['OpenProcess'],
    CloseHandle: kernel32.func('CloseHandle', 'bool', ['void *']) as KernelApi['CloseHandle'],
    VirtualAllocEx: kernel32.func('VirtualAllocEx', 'void *', [
      'void *',
      'void *',
      'size_t',
      'uint32',
      'uint32'
    ]) as KernelApi['VirtualAllocEx'],
    VirtualFreeEx: kernel32.func('VirtualFreeEx', 'bool', [
      'void *',
      'void *',
      'size_t',
      'uint32'
    ]) as KernelApi['VirtualFreeEx'],
    WriteProcessMemory: kernel32.func('WriteProcessMemory', 'bool', [
      'void *',
      'void *',
      'void *',
      'size_t',
      'size_t *'
    ]) as KernelApi['WriteProcessMemory'],
    ReadProcessMemory: kernel32.func('ReadProcessMemory', 'bool', [
      'void *',
      'void *',
      'void *',
      'size_t',
      'size_t *'
    ]) as KernelApi['ReadProcessMemory'],
    GetLastError: kernel32.func('GetLastError', 'uint32', []) as KernelApi['GetLastError']
  }
  return kernelApi
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

function readPid(user32: DesktopIconApi, hwnd: unknown): number {
  try {
    const pidOut = Buffer.alloc(4)
    user32.GetWindowThreadProcessId(hwnd, pidOut)
    return pidOut.readUInt32LE(0)
  } catch {
    return 0
  }
}

function collectDesktopListViews(): unknown[] {
  const now = Date.now()
  if (cachedListViews && now - cachedListViews.at < LISTVIEW_CACHE_MS) {
    return cachedListViews.hwnds
  }

  const api = getUser32()
  const found: unknown[] = []
  const seen = new Set<string>()

  const pushListViewUnderDefView = (defView: unknown): void => {
    if (!defView) return
    let child: unknown = null
    for (;;) {
      child = api.FindWindowExW(defView, child, 'SysListView32', null)
      if (!child || asHwnd(child) === 0n) break
      const key = asHwnd(child).toString()
      if (seen.has(key)) continue
      seen.add(key)
      found.push(child)
    }
  }

  const progman = api.FindWindowW('Progman', null)
  if (progman) {
    pushListViewUnderDefView(api.FindWindowExW(progman, null, 'SHELLDLL_DefView', null))
  }

  const callback = koffi.register((topHwnd: unknown) => {
    pushListViewUnderDefView(api.FindWindowExW(topHwnd, null, 'SHELLDLL_DefView', null))
    return true
  }, koffi.pointer(api.EnumWindowsProc as never))

  try {
    api.EnumWindows(callback, 0)
  } finally {
    koffi.unregister(callback)
  }

  cachedListViews = { hwnds: found, at: now }
  return found
}

function toClientPoint(
  user32: DesktopIconApi,
  listHwnd: unknown,
  physical: { x: number; y: number }
): { x: number; y: number } | null {
  const rect = { left: 0, top: 0, right: 0, bottom: 0 }
  if (!user32.GetWindowRect(listHwnd, rect)) return null
  if (
    physical.x < rect.left ||
    physical.x >= rect.right ||
    physical.y < rect.top ||
    physical.y >= rect.bottom
  ) {
    return null
  }

  const pt = { x: physical.x, y: physical.y }
  if (user32.ScreenToClient(listHwnd, pt)) {
    return { x: pt.x, y: pt.y }
  }
  // Fallback if ScreenToClient fails to mutate the struct through koffi.
  return { x: physical.x - rect.left, y: physical.y - rect.top }
}

function hitTestDesktopListView(
  listHwnd: unknown,
  physical: { x: number; y: number }
): boolean | 'error' {
  const user32 = getUser32()
  const kernel32 = getKernel32()

  const client = toClientPoint(user32, listHwnd, physical)
  if (!client) return false

  const pid = readPid(user32, listHwnd)
  if (pid <= 0) {
    logHit('OpenProcess skipped — no pid')
    return 'error'
  }

  const access =
    PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_QUERY_LIMITED_INFORMATION
  const process = kernel32.OpenProcess(access, 0, pid)
  if (!process || asHwnd(process) === 0n) {
    logHit('OpenProcess failed', { pid, lastError: kernel32.GetLastError() })
    return 'error'
  }

  let remote: unknown = null
  try {
    remote = kernel32.VirtualAllocEx(
      process,
      null,
      LVHITTESTINFO_SIZE,
      MEM_COMMIT | MEM_RESERVE,
      PAGE_READWRITE
    )
    if (!remote || asHwnd(remote) === 0n) {
      logHit('VirtualAllocEx failed', { lastError: kernel32.GetLastError() })
      return 'error'
    }

    const local = Buffer.alloc(LVHITTESTINFO_SIZE)
    local.writeInt32LE(Math.round(client.x), 0)
    local.writeInt32LE(Math.round(client.y), 4)

    if (!kernel32.WriteProcessMemory(process, remote, local, LVHITTESTINFO_SIZE, null)) {
      logHit('WriteProcessMemory failed', { lastError: kernel32.GetLastError() })
      return 'error'
    }

    const remoteAddr = koffi.address(remote as object)
    // Prefer SUBITEMHITTEST (desktop FolderView), then HITTEST.
    user32.SendMessageW(listHwnd, LVM_SUBITEMHITTEST, 0, remoteAddr)
    let out = Buffer.alloc(LVHITTESTINFO_SIZE)
    if (!kernel32.ReadProcessMemory(process, remote, out, LVHITTESTINFO_SIZE, null)) {
      logHit('ReadProcessMemory failed', { lastError: kernel32.GetLastError() })
      return 'error'
    }

    let flags = out.readUInt32LE(8)
    let iItem = out.readInt32LE(12)
    if ((flags & LVHT_ONITEM) === 0) {
      // Reset and try classic LVM_HITTEST.
      local.fill(0)
      local.writeInt32LE(Math.round(client.x), 0)
      local.writeInt32LE(Math.round(client.y), 4)
      kernel32.WriteProcessMemory(process, remote, local, LVHITTESTINFO_SIZE, null)
      user32.SendMessageW(listHwnd, LVM_HITTEST, 0, remoteAddr)
      out = Buffer.alloc(LVHITTESTINFO_SIZE)
      if (!kernel32.ReadProcessMemory(process, remote, out, LVHITTESTINFO_SIZE, null)) {
        return 'error'
      }
      flags = out.readUInt32LE(8)
      iItem = out.readInt32LE(12)
    }

    const onItem = (flags & LVHT_ONITEM) !== 0
    logHit('hit-test', {
      client,
      flags: `0x${flags.toString(16)}`,
      iItem,
      onItem
    })
    return onItem
  } catch (error) {
    logHit('exception', { error: error instanceof Error ? error.message : String(error) })
    return 'error'
  } finally {
    try {
      if (remote && asHwnd(remote) !== 0n) {
        kernel32.VirtualFreeEx(process, remote, 0, MEM_RELEASE)
      }
    } catch {
      /* ignore */
    }
    try {
      kernel32.CloseHandle(process)
    } catch {
      /* ignore */
    }
  }
}

/**
 * True when `ptDip` is on a desktop icon (not empty desktop / wallpaper).
 */
export function isDesktopIconAtPoint(ptDip: { x: number; y: number }): boolean {
  if (process.platform !== 'win32') return false

  try {
    const physical = dipToPhysicalPoint(ptDip)
    const listViews = collectDesktopListViews()
    if (listViews.length === 0) {
      logHit('no desktop SysListView32 found')
      return false
    }

    for (const listHwnd of listViews) {
      const hit = hitTestDesktopListView(listHwnd, physical)
      if (hit === true) return true
      if (hit === false) continue
      // 'error' — try next list view; if all error, treat as not-icon (fail open).
    }
    return false
  } catch (error) {
    logHit('isDesktopIconAtPoint failed', {
      error: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}
