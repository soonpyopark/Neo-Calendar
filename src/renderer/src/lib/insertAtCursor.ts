/**
 * Insert `text` into `currentValue` at `inputEl`'s current caret (replacing any
 * selection), returning the next full value and the caret position after the
 * inserted text so the caller can restore focus/selection post-render.
 */
export function insertTextAtCursor(
  inputEl: HTMLInputElement | HTMLTextAreaElement | null | undefined,
  currentValue: string,
  text: string
): { nextValue: string; nextPos: number } {
  const length = currentValue.length
  const start =
    inputEl && typeof inputEl.selectionStart === 'number' ? inputEl.selectionStart : length
  const end =
    inputEl && typeof inputEl.selectionEnd === 'number' ? inputEl.selectionEnd : length
  const nextValue = currentValue.slice(0, start) + text + currentValue.slice(end)
  return { nextValue, nextPos: start + text.length }
}
