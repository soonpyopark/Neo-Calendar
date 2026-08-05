export type SimpleMdRun = {
  text: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
  /** Present for `[label](url)` runs — already normalized to http(s). */
  href?: string
}

export function parseSimpleMarkdown(input: string): SimpleMdRun[]
export function stripSimpleMarkdown(input: string): string
export function wrapMarkdownSelection(
  value: string,
  start: number,
  end: number,
  open: string,
  close: string,
  placeholder?: string
): { next: string; selStart: number; selEnd: number }
export function wrapMarkdownLink(
  value: string,
  start: number,
  end: number
): { next: string; selStart: number; selEnd: number }
