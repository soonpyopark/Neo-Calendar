import { PRIMARY_CALENDAR_ID } from '../../../shared/calendarDefaults'
import type { CalendarRecord } from '../../../shared/calendarTypes'

export function sortCalendarsByOrder(calendars: CalendarRecord[] | null | undefined): CalendarRecord[] {
  return (calendars ?? [])
    .map((calendar, index) => ({ calendar, index }))
    .sort((a, b) => {
      const ao = typeof a.calendar.sortOrder === 'number' ? a.calendar.sortOrder : a.index
      const bo = typeof b.calendar.sortOrder === 'number' ? b.calendar.sortOrder : b.index
      if (ao !== bo) return ao - bo
      return a.index - b.index
    })
    .map(({ calendar }) => calendar)
}

export function getDefaultCalendarId(
  calendars: CalendarRecord[] | null | undefined,
  excludeId: string,
  fallbackId = PRIMARY_CALENDAR_ID
): string {
  const ordered = sortCalendarsByOrder(
    (calendars ?? []).filter((calendar) => calendar.id !== excludeId)
  )
  if (!ordered.length) return fallbackId
  return ordered.find((calendar) => calendar.visible !== false)?.id ?? ordered[0].id
}
