import { expandEventsForRange } from '../../../shared/mdcExport/eventOccurrences.js'
import { compareEventsForDisplay } from '../../../shared/mdcExport/eventBarFormat.js'
import { getEventLinks } from './eventLinks'
import { resolveEventTags } from '../../../shared/mdcExport/eventTags.js'
import { toDateKey } from './calendarUtils'
import type { CalendarEvent, CalendarRecord, TagRecord } from '../../../shared/calendarTypes'

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export type SearchRange = { start: string; end: string }

/** Default search window: today − 1 year … today + 1 year. */
export function getDefaultSearchRange(now = new Date()): SearchRange {
  const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
  return {
    start: toDateKey(start),
    end: toDateKey(end)
  }
}

export function normalizeSearchRange(start?: string, end?: string): SearchRange {
  const defaults = getDefaultSearchRange()
  let from = DATE_KEY_RE.test(String(start ?? '')) ? String(start) : defaults.start
  let to = DATE_KEY_RE.test(String(end ?? '')) ? String(end) : defaults.end
  if (from > to) {
    const swap = from
    from = to
    to = swap
  }
  return { start: from, end: to }
}

function collectLinkSearchParts(event: CalendarEvent): string[] {
  const parts: string[] = []
  for (const link of getEventLinks(event)) {
    if (link.title) parts.push(link.title)
    if (link.url) parts.push(link.url)
  }
  return parts
}

function collectAttachmentSearchParts(event: CalendarEvent): string[] {
  if (!Array.isArray(event?.attachments)) return []
  return event.attachments
    .map((item) => {
      const anyItem = item as { name?: string; fileName?: string; path?: string }
      return anyItem.name || anyItem.fileName || anyItem.path || ''
    })
    .filter(Boolean)
}

function matchesQuery(
  query: string,
  event: CalendarEvent,
  calendar: CalendarRecord | undefined,
  tags: TagRecord[]
): boolean {
  const tagNames = resolveEventTags(event, tags).map((tag) => tag.name)
  const haystack = [
    event.title,
    event.description,
    event.location,
    calendar?.name,
    ...tagNames,
    ...collectLinkSearchParts(event),
    ...collectAttachmentSearchParts(event)
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

/**
 * Search visible calendar events (expanded occurrences) by
 * title/description/location/calendar/tag name/link/attachment name.
 */
export function searchCalendarEvents(options: {
  query: string
  events: CalendarEvent[]
  calendars: CalendarRecord[]
  tags?: TagRecord[]
  rangeStart?: string
  rangeEnd?: string
}): CalendarEvent[] {
  const normalized = String(options.query ?? '')
    .trim()
    .toLowerCase()
  if (!normalized) return []

  const tags = options.tags ?? []
  const range = normalizeSearchRange(options.rangeStart, options.rangeEnd)
  const calendarById = new Map((options.calendars ?? []).map((calendar) => [calendar.id, calendar]))
  const expanded = expandEventsForRange(options.events ?? [], range.start, range.end) as CalendarEvent[]

  return expanded
    .filter((event) =>
      matchesQuery(normalized, event, calendarById.get(event.calendarId), tags)
    )
    .sort(compareEventsForDisplay)
}

/** Build page number tokens for a compact pager: numbers and `'ellipsis'`. */
export function buildSearchPageItems(
  page: number,
  totalPages: number
): Array<number | 'ellipsis'> {
  const total = Math.max(1, Number(totalPages) || 1)
  const current = Math.min(Math.max(1, Number(page) || 1), total)
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const items: Array<number | 'ellipsis'> = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  if (start > 2) items.push('ellipsis')
  for (let n = start; n <= end; n += 1) items.push(n)
  if (end < total - 1) items.push('ellipsis')
  items.push(total)
  return items
}

export function formatSearchResultDate(dateKey: string): string {
  if (!dateKey) return ''
  const [y, m, d] = String(dateKey).split('-').map(Number)
  if (!y || !m || !d) return dateKey
  const date = new Date(y, m - 1, d)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${y}년 ${m}월 ${d}일 (${weekdays[date.getDay()]})`
}

export function dateFromDateKey(dateKey: string): Date {
  const [y, m, d] = String(dateKey).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export { toDateKey }

export const SEARCH_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

/** @deprecated Use searchCalendarEvents — kept for any leftover imports. */
export function searchEvents(options: {
  events: CalendarEvent[]
  calendars: CalendarRecord[]
  tags: TagRecord[]
  query: string
  range: SearchRange
  limit?: number
}): CalendarEvent[] {
  const results = searchCalendarEvents({
    query: options.query,
    events: options.events,
    calendars: options.calendars,
    tags: options.tags,
    rangeStart: options.range.start,
    rangeEnd: options.range.end
  })
  return options.limit ? results.slice(0, options.limit) : results
}

export type SearchHit = CalendarEvent & {
  calendarName?: string
  occurrenceDate: string
}
