/** URL detection for free text (event descriptions, day-list lines). */

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'()[\]{}]+/gi

/** Trailing characters that usually belong to the sentence, not the URL. */
const TRAILING_TRIM = /[.,;:!?'"·)\]}>]+$/

export type UrlRange = {
  start: number
  /** Exclusive. */
  end: number
  /** Openable href (bare `www.` hosts get an https prefix). */
  url: string
}

/** Find URL spans in `text`, in order and without overlaps. */
export function findUrlRanges(text: string): UrlRange[] {
  const source = String(text ?? '')
  if (!source) return []

  const ranges: UrlRange[] = []
  URL_PATTERN.lastIndex = 0
  for (;;) {
    const match = URL_PATTERN.exec(source)
    if (!match) break
    const raw = match[0].replace(TRAILING_TRIM, '')
    if (raw.length < 5) continue
    ranges.push({
      start: match.index,
      end: match.index + raw.length,
      url: /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    })
  }
  return ranges
}

export type LinkifySegment = {
  text: string
  /** Non-null when the segment is a URL. */
  url: string | null
}

/** Split `text` into plain / URL segments. */
export function splitLinkifySegments(text: string): LinkifySegment[] {
  const source = String(text ?? '')
  const ranges = findUrlRanges(source)
  if (ranges.length === 0) return [{ text: source, url: null }]

  const segments: LinkifySegment[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: source.slice(cursor, range.start), url: null })
    }
    segments.push({ text: source.slice(range.start, range.end), url: range.url })
    cursor = range.end
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor), url: null })
  return segments
}
