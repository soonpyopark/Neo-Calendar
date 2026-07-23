import type { CalendarEvent, CalendarRecord, TagRecord } from '../../../shared/calendarTypes'

export type SearchRange = { start: string; end: string }

export function getDefaultSearchRange(now = new Date()): SearchRange {
  const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
  const key = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: key(start), end: key(end) }
}

export function normalizeSearchRange(start?: string, end?: string): SearchRange {
  const defaults = getDefaultSearchRange()
  let from = /^\d{4}-\d{2}-\d{2}$/.test(String(start ?? '')) ? String(start) : defaults.start
  let to = /^\d{4}-\d{2}-\d{2}$/.test(String(end ?? '')) ? String(end) : defaults.end
  if (from > to) [from, to] = [to, from]
  return { start: from, end: to }
}

export type SearchHit = CalendarEvent & {
  calendarName?: string
  occurrenceDate: string
}

export function searchEvents(options: {
  events: CalendarEvent[]
  calendars: CalendarRecord[]
  tags: TagRecord[]
  query: string
  range: SearchRange
  limit?: number
}): SearchHit[] {
  const q = options.query.trim().toLowerCase()
  if (!q) return []
  const calById = new Map(options.calendars.map((c) => [c.id, c]))
  const tagById = new Map(options.tags.map((t) => [t.id, t]))
  const hits: SearchHit[] = []

  for (const event of options.events) {
    const day = event.occurrenceDate || event.startDate
    if (day < options.range.start || day > options.range.end) continue
    const cal = calById.get(event.calendarId)
    const tagNames = (event.tagIds ?? [])
      .map((id) => tagById.get(id)?.name ?? '')
      .join(' ')
    const links = (event.links ?? []).map((l) => `${l.title ?? ''} ${l.url}`).join(' ')
    const hay = [
      event.title,
      event.description,
      event.location,
      cal?.name,
      tagNames,
      links,
      event.link
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) continue
    hits.push({
      ...event,
      occurrenceDate: day,
      calendarName: cal?.name
    })
    if (options.limit && hits.length >= options.limit) break
  }

  hits.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))
  return hits
}
