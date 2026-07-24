import type { CalendarRecord } from './calendarTypes'

export function sortCalendarsByOrder<T extends { sortOrder?: number }>(calendars: T[]): T[]
export function getDefaultCalendarId(
  calendars: CalendarRecord[],
  excludeId?: string
): string | null
