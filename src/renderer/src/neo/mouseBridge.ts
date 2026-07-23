import type { SetIgnoreMouseOptions } from '../../../shared/ipc'

let lastIgnore: boolean | null = null

export function setIgnoreMouseEvents(
  ignore: boolean,
  options: SetIgnoreMouseOptions = { forwardToOverlay: true }
): void {
  if (lastIgnore === ignore) return
  lastIgnore = ignore
  window.neoCalendar?.setIgnoreMouse?.(ignore, options)
}

export function resetIgnoreMouseCache(): void {
  lastIgnore = null
}

/** Force capture while overlays are open (bypass idempotent cache). */
export function forceMouseCapture(capture: boolean): void {
  lastIgnore = null
  setIgnoreMouseEvents(!capture, { forwardToOverlay: true })
}
