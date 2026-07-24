/** True when key events should stay in the focused field (not global undo/redo). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function isUndoShortcut(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return false
  if (event.key !== 'z' && event.key !== 'Z') return false
  return !event.shiftKey
}

export function isRedoShortcut(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return false
  if (event.key === 'y' || event.key === 'Y') return true
  if (event.key === 'z' || event.key === 'Z') return event.shiftKey
  return false
}
