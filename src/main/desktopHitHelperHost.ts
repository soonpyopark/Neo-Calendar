import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, screen } from 'electron'
import koffi from 'koffi'
import { isDesktopIconAtPoint } from './desktopIconHitTest'

const GENERIC_READ = 0x80000000
const GENERIC_WRITE = 0x40000000
const OPEN_EXISTING = 3
const FILE_ATTRIBUTE_NORMAL = 0x80
const WAIT_PIPE_MS = 800
const QUERY_TIMEOUT_HINT_MS = 100

type PipeApi = {
  WaitNamedPipeW: (name: string, timeoutMs: number) => number
  CreateFileW: (
    name: string,
    access: number,
    share: number,
    security: null,
    creation: number,
    flags: number,
    template: null
  ) => unknown
  WriteFile: (
    handle: unknown,
    buffer: Buffer,
    size: number,
    written: Buffer,
    overlapped: null
  ) => number
  ReadFile: (
    handle: unknown,
    buffer: Buffer,
    size: number,
    read: Buffer,
    overlapped: null
  ) => number
  CloseHandle: (handle: unknown) => number
  GetLastError: () => number
}

let pipeApi: PipeApi | null = null

function getPipeApi(): PipeApi {
  if (pipeApi) return pipeApi
  const kernel32 = koffi.load('kernel32.dll')
  pipeApi = {
    WaitNamedPipeW: kernel32.func('WaitNamedPipeW', 'bool', [
      'str16',
      'uint32'
    ]) as PipeApi['WaitNamedPipeW'],
    CreateFileW: kernel32.func('CreateFileW', 'void *', [
      'str16',
      'uint32',
      'uint32',
      'void *',
      'uint32',
      'uint32',
      'void *'
    ]) as PipeApi['CreateFileW'],
    WriteFile: kernel32.func('WriteFile', 'bool', [
      'void *',
      'void *',
      'uint32',
      'uint32 *',
      'void *'
    ]) as PipeApi['WriteFile'],
    ReadFile: kernel32.func('ReadFile', 'bool', [
      'void *',
      'void *',
      'uint32',
      'uint32 *',
      'void *'
    ]) as PipeApi['ReadFile'],
    CloseHandle: kernel32.func('CloseHandle', 'bool', ['void *']) as PipeApi['CloseHandle'],
    GetLastError: kernel32.func('GetLastError', 'uint32', []) as PipeApi['GetLastError']
  }
  return pipeApi
}

function isInvalidHandle(handle: unknown): boolean {
  if (handle == null) return true
  try {
    const addr = typeof handle === 'bigint' ? handle : BigInt(koffi.address(handle as object))
    // INVALID_HANDLE_VALUE is -1 as UINT_PTR
    return addr === 0n || addr === 0xffffffffffffffffn || addr === 0xffffffffn
  } catch {
    return true
  }
}

/**
 * Hosts the hidden neo-desktop-hit.exe helper and queries icon hits over a named pipe.
 * Uses synchronous Win32 pipe I/O so the mouse-hook path can decide without racing the event loop.
 * Fail-open: if the helper is unavailable, falls back to in-process hit-test.
 */
export class DesktopHitHelperHost {
  private child: ChildProcess | null = null
  private pipeHandle: unknown | null = null
  private pipeName = ''
  private stopped = false
  private lastWarnAt = 0

  start(): void {
    if (process.platform !== 'win32' || this.child) return
    this.stopped = false
    const exe = resolveHelperExe()
    if (!exe) {
      console.warn('[desktop-hit] helper exe not found — in-process fallback only')
      return
    }

    this.pipeName = `NeoCalendarDesktopHit-${process.pid}`
    try {
      this.child = spawn(exe, ['--pipe', this.pipeName], {
        windowsHide: true,
        stdio: 'ignore',
        detached: false
      })
      this.child.on('exit', (code, signal) => {
        console.log('[desktop-hit] helper exited', { code, signal })
        this.child = null
        this.closePipe()
      })
      this.child.on('error', (error) => {
        this.warn('helper spawn error', error)
        this.child = null
      })
      console.log('[desktop-hit] helper started', { exe, pipe: this.pipeName })
    } catch (error) {
      this.warn('failed to start helper', error)
      this.child = null
    }
  }

  stop(): void {
    this.stopped = true
    if (this.pipeHandle && !isInvalidHandle(this.pipeHandle)) {
      try {
        this.writeLine('QUIT')
      } catch {
        /* ignore */
      }
    }
    this.closePipe()
    if (this.child && !this.child.killed) {
      try {
        this.child.kill()
      } catch {
        /* ignore */
      }
    }
    this.child = null
  }

  /**
   * True when the DIP point is on a desktop icon.
   * Uses helper first; falls back to in-process LVM_HITTEST.
   */
  isIconAtDipPoint(ptDip: { x: number; y: number }): boolean {
    try {
      const physical = screen.dipToScreenPoint(ptDip)
      const fromHelper = this.queryIconSync(physical.x, physical.y)
      if (fromHelper !== null) return fromHelper
    } catch (error) {
      this.warn('helper query failed', error)
    }
    return isDesktopIconAtPoint(ptDip)
  }

  private queryIconSync(physicalX: number, physicalY: number): boolean | null {
    if (this.stopped || !this.child) return null
    if (!this.ensurePipe()) return null

    const started = Date.now()
    try {
      this.writeLine(`HIT ${Math.round(physicalX)} ${Math.round(physicalY)}`)
      const line = this.readLine()
      if (Date.now() - started > QUERY_TIMEOUT_HINT_MS) {
        this.warn('slow helper reply', { ms: Date.now() - started })
      }
      if (line === 'ICON') return true
      if (line === 'EMPTY') return false
      this.warn('unexpected helper reply', { line })
      return null
    } catch (error) {
      this.warn('pipe I/O error', error)
      this.closePipe()
      return null
    }
  }

  private ensurePipe(): boolean {
    if (this.pipeHandle && !isInvalidHandle(this.pipeHandle)) return true
    if (!this.child || this.stopped || !this.pipeName) return false

    const api = getPipeApi()
    const fullName = `\\\\.\\pipe\\${this.pipeName}`
    try {
      api.WaitNamedPipeW(fullName, WAIT_PIPE_MS)
    } catch {
      /* WaitNamedPipe may throw via koffi; CreateFile can still succeed */
    }

    const handle = api.CreateFileW(
      fullName,
      GENERIC_READ | GENERIC_WRITE,
      0,
      null,
      OPEN_EXISTING,
      FILE_ATTRIBUTE_NORMAL,
      null
    )
    if (isInvalidHandle(handle)) {
      this.warn('CreateFile pipe failed', { err: api.GetLastError() })
      this.pipeHandle = null
      return false
    }
    this.pipeHandle = handle
    return true
  }

  private writeLine(command: string): void {
    const api = getPipeApi()
    if (!this.pipeHandle) throw new Error('pipe closed')
    const payload = Buffer.from(`${command}\n`, 'utf8')
    const written = Buffer.alloc(4)
    const ok = api.WriteFile(this.pipeHandle, payload, payload.length, written, null)
    if (!ok) throw new Error(`WriteFile failed (${api.GetLastError()})`)
  }

  private readLine(): string {
    const api = getPipeApi()
    if (!this.pipeHandle) throw new Error('pipe closed')
    const chunks: Buffer[] = []
    const buf = Buffer.alloc(64)
    const readOut = Buffer.alloc(4)
    // Bound reads so a stuck helper cannot hang the mouse hook forever.
    const deadline = Date.now() + WAIT_PIPE_MS
    while (Date.now() < deadline) {
      const ok = api.ReadFile(this.pipeHandle, buf, buf.length, readOut, null)
      if (!ok) throw new Error(`ReadFile failed (${api.GetLastError()})`)
      const n = readOut.readUInt32LE(0)
      if (n <= 0) throw new Error('ReadFile returned 0 bytes')
      chunks.push(Buffer.from(buf.subarray(0, n)))
      const joined = Buffer.concat(chunks).toString('utf8')
      const nl = joined.indexOf('\n')
      if (nl >= 0) {
        return joined.slice(0, nl).replace(/\r$/, '').trim()
      }
    }
    throw new Error('readLine timeout')
  }

  private closePipe(): void {
    if (this.pipeHandle && !isInvalidHandle(this.pipeHandle)) {
      try {
        getPipeApi().CloseHandle(this.pipeHandle)
      } catch {
        /* ignore */
      }
    }
    this.pipeHandle = null
  }

  private warn(msg: string, data?: unknown): void {
    const now = Date.now()
    if (now - this.lastWarnAt < 1000) return
    this.lastWarnAt = now
    if (data !== undefined) console.warn(`[desktop-hit] ${msg}`, data)
    else console.warn(`[desktop-hit] ${msg}`)
  }
}

function resolveHelperExe(): string | null {
  const candidates = [
    join(process.resourcesPath, 'desktop-hit-helper', 'neo-desktop-hit.exe'),
    join(app.getAppPath(), 'resources', 'desktop-hit-helper', 'neo-desktop-hit.exe'),
    join(app.getAppPath(), '..', '..', 'resources', 'desktop-hit-helper', 'neo-desktop-hit.exe'),
    join(__dirname, '../../resources/desktop-hit-helper/neo-desktop-hit.exe'),
    join(__dirname, '../../../resources/desktop-hit-helper/neo-desktop-hit.exe')
  ]
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      /* ignore */
    }
  }
  return null
}

export const desktopHitHelperHost = new DesktopHitHelperHost()
