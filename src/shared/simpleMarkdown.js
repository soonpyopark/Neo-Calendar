/**
 * Tiny Markdown subset for event descriptions:
 *   **bold**  *italic*  ~~strike~~  `code`  [label](url)
 * Nested markers are not supported — first match wins left-to-right.
 */

/**
 * @typedef {{
 *   text: string,
 *   bold?: boolean,
 *   italic?: boolean,
 *   strike?: boolean,
 *   code?: boolean,
 *   href?: string
 * }} SimpleMdRun
 */

const TOKEN_RE =
  /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|~~([^~]+)~~|`([^`]+)`|\*([^*]+)\*/g

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeMdHref(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''
  if (/^javascript:/i.test(trimmed)) return ''
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[\w.-]+\.[\w.-]+/.test(trimmed)
      ? `https://${trimmed}`
      : ''
  if (!candidate) return ''
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    if (!parsed.hostname) return ''
    return candidate
  } catch {
    return ''
  }
}

/**
 * @param {string} input
 * @returns {SimpleMdRun[]}
 */
export function parseSimpleMarkdown(input) {
  const source = String(input ?? '')
  if (!source) return []

  /** @type {SimpleMdRun[]} */
  const runs = []
  let last = 0
  TOKEN_RE.lastIndex = 0
  let match = TOKEN_RE.exec(source)
  while (match) {
    if (match.index > last) {
      runs.push({ text: source.slice(last, match.index) })
    }
    if (match[1] != null) {
      const href = normalizeMdHref(match[2])
      if (href) runs.push({ text: match[1], href })
      else runs.push({ text: match[0] })
    } else if (match[3] != null) runs.push({ text: match[3], bold: true })
    else if (match[4] != null) runs.push({ text: match[4], strike: true })
    else if (match[5] != null) runs.push({ text: match[5], code: true })
    else if (match[6] != null) runs.push({ text: match[6], italic: true })
    last = match.index + match[0].length
    match = TOKEN_RE.exec(source)
  }
  if (last < source.length) {
    runs.push({ text: source.slice(last) })
  }
  return runs.length > 0 ? runs : [{ text: source }]
}

/** Visible plain text with markers removed (search / copy / ICS-friendly). */
export function stripSimpleMarkdown(input) {
  return parseSimpleMarkdown(input)
    .map((run) => run.text)
    .join('')
}

/**
 * Wrap a selected range with markers. If selection is empty, inserts markers
 * around a placeholder and returns caret offsets inside the placeholder.
 *
 * @param {string} value
 * @param {number} start
 * @param {number} end
 * @param {string} open
 * @param {string} close
 * @param {string} [placeholder]
 */
export function wrapMarkdownSelection(value, start, end, open, close, placeholder = '텍스트') {
  const text = String(value ?? '')
  const from = Math.max(0, Math.min(start, text.length))
  const to = Math.max(from, Math.min(end, text.length))
  const selected = text.slice(from, to)
  const inner = selected.length > 0 ? selected : placeholder
  const next = `${text.slice(0, from)}${open}${inner}${close}${text.slice(to)}`
  const selStart = from + open.length
  const selEnd = selStart + inner.length
  return { next, selStart, selEnd }
}

/**
 * Insert / wrap a Markdown link `[label](url)`.
 * - Selection looks like a URL → `[링크](url)` (select label)
 * - Otherwise → `[label](https://)` (select URL for editing)
 *
 * @param {string} value
 * @param {number} start
 * @param {number} end
 */
export function wrapMarkdownLink(value, start, end) {
  const text = String(value ?? '')
  const from = Math.max(0, Math.min(start, text.length))
  const to = Math.max(from, Math.min(end, text.length))
  const selected = text.slice(from, to).trim()
  const asHref = normalizeMdHref(selected)

  if (asHref) {
    const label = '링크'
    const inserted = `[${label}](${asHref})`
    const next = `${text.slice(0, from)}${inserted}${text.slice(to)}`
    const selStart = from + 1
    const selEnd = selStart + label.length
    return { next, selStart, selEnd }
  }

  const label = selected.length > 0 ? text.slice(from, to) : '링크'
  const href = 'https://'
  const inserted = `[${label}](${href})`
  const next = `${text.slice(0, from)}${inserted}${text.slice(to)}`
  const selStart = from + 1 + label.length + 2
  const selEnd = selStart + href.length
  return { next, selStart, selEnd }
}
