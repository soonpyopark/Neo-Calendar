/**
 * While a native Electron dialog (open/save/message) is modal — and briefly after
 * it closes — block outside-click handlers that would close the parent panel /
 * re-embed the desktop calendar.
 */
let depth = 0
/** Ignore outside clicks for a short window after the dialog returns. */
let blockedUntil = 0
const POST_DIALOG_GRACE_MS = 600

export function isNativeDialogOpen(): boolean {
  return depth > 0 || Date.now() < blockedUntil
}

export async function withNativeDialog<T>(fn: () => Promise<T>): Promise<T> {
  depth += 1
  try {
    return await fn()
  } finally {
    depth = Math.max(0, depth - 1)
    blockedUntil = Date.now() + POST_DIALOG_GRACE_MS
  }
}
