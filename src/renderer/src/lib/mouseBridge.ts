import type { SetIgnoreMouseOptions } from '../../../shared/ipc'

let lastIgnore: boolean | null = null

/**
 * Idempotent bridge to main-process `set-ignore-mouse`.
 * Avoids flooding IPC when the pointer rapidly crosses interactive bounds.
 */
export function setIgnoreMouseEvents(
  ignore: boolean,
  options: SetIgnoreMouseOptions = { forwardToOverlay: true }
): void {
  if (lastIgnore === ignore) return
  lastIgnore = ignore

  if (typeof window !== 'undefined' && window.neoCalendar?.setIgnoreMouse) {
    window.neoCalendar.setIgnoreMouse(ignore, options)
  }
}

export function resetIgnoreMouseCache(): void {
  lastIgnore = null
}
