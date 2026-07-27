/** While a native Electron dialog (open/save/message) is modal, block outside-click re-embed. */
let depth = 0

export function isNativeDialogOpen(): boolean {
  return depth > 0
}

export async function withNativeDialog<T>(fn: () => Promise<T>): Promise<T> {
  depth += 1
  try {
    return await fn()
  } finally {
    depth = Math.max(0, depth - 1)
  }
}
