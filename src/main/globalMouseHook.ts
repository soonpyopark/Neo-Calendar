import { screen } from 'electron'
import koffi from 'koffi'

const WH_MOUSE_LL = 14
const WM_LBUTTONDOWN = 0x0201
const WM_RBUTTONDOWN = 0x0204

export type ScreenPoint = { x: number; y: number }
export type MouseDownListener = (pt: ScreenPoint, button: 'left' | 'right') => void

let hook: unknown = null
let hookProc: unknown = null
let CallNextHookEx: (
  h: unknown,
  code: number,
  wParam: number,
  lParam: unknown
) => bigint
let UnhookWindowsHookEx: (h: unknown) => number
const listeners = new Set<MouseDownListener>()

function ensureHook(): void {
  if (hook || process.platform !== 'win32') return

  const user32 = koffi.load('user32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  CallNextHookEx = user32.func('CallNextHookEx', 'intptr', [
    'void *',
    'int',
    'uintptr',
    'intptr'
  ]) as typeof CallNextHookEx
  UnhookWindowsHookEx = user32.func('UnhookWindowsHookEx', 'bool', ['void *']) as (
    h: unknown
  ) => number

  const LowLevelMouseProc = koffi.proto(
    'intptr __stdcall NeoGlobalLowLevelMouseProc(int nCode, uintptr wParam, intptr lParam)'
  )
  const SetWindowsHookExW = user32.func('SetWindowsHookExW', 'void *', [
    'int',
    'void *',
    'void *',
    'uint32'
  ]) as (idHook: number, proc: unknown, mod: unknown, threadId: number) => unknown
  const GetModuleHandleW = kernel32.func('GetModuleHandleW', 'void *', ['void *']) as (
    name: unknown
  ) => unknown

  hookProc = koffi.register(
    (nCode: number, wParam: number, lParam: unknown): bigint => {
      try {
        if (nCode >= 0) {
          let button: 'left' | 'right' | null = null
          if (wParam === WM_LBUTTONDOWN) button = 'left'
          else if (wParam === WM_RBUTTONDOWN) button = 'right'
          if (button && listeners.size > 0) {
            const pt = screen.getCursorScreenPoint()
            for (const listener of listeners) {
              try {
                listener(pt, button)
              } catch (error) {
                console.error('[global-mouse] listener error:', error)
              }
            }
          }
        }
      } catch (error) {
        console.error('[global-mouse] hook error:', error)
      }
      return CallNextHookEx(hook, nCode, wParam, lParam)
    },
    koffi.pointer(LowLevelMouseProc)
  )

  hook = SetWindowsHookExW(WH_MOUSE_LL, hookProc, GetModuleHandleW(null), 0)
  if (!hook) {
    console.error('[global-mouse] SetWindowsHookExW(WH_MOUSE_LL) failed')
  }
}

/** Subscribe to global mouse-button-down events (DIP screen coords). */
export function subscribeGlobalMouseDown(listener: MouseDownListener): () => void {
  if (process.platform !== 'win32') return () => undefined
  ensureHook()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && hook) {
      UnhookWindowsHookEx(hook)
      hook = null
    }
  }
}
