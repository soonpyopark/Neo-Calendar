import { HOLIDAYS_KR_CALENDAR_ID } from './constants.js'

/**
 * @param {object[]} events
 * @param {object[]} calendars
 * @param {{
 *   includeCompleted?: boolean
 *   includeHolidays?: boolean
 *   excludeHiddenCalendars?: boolean
 *   asAdmin?: boolean
 * }} [options]
 */
export function filterEventsForExport(events, calendars, options = {}) {
  const includeCompleted = options.includeCompleted !== false
  const includeHolidays = options.includeHolidays !== false
  const excludeHiddenCalendars = Boolean(options.excludeHiddenCalendars)
  const asAdmin = options.asAdmin !== false

  const calendarMap = new Map((calendars ?? []).map((calendar) => [calendar.id, calendar]))
  const allowedCalendarIds = new Set()
  for (const calendar of calendars ?? []) {
    if (excludeHiddenCalendars && calendar.visible === false) continue
    if (!asAdmin && calendar.visible === false) continue
    allowedCalendarIds.add(calendar.id)
  }

  return (events ?? []).filter((event) => {
    if (!event) return false
    if (!includeHolidays && event.calendarId === HOLIDAYS_KR_CALENDAR_ID) return false
    if (!allowedCalendarIds.has(event.calendarId)) return false
    if (!includeCompleted && event.completed) return false
    // Keep masters that may expand to incomplete occurrences; completed filter
    // is reapplied after expansion for occurrence rows.
    if (!calendarMap.has(event.calendarId) && excludeHiddenCalendars) return false
    return true
  })
}

/**
 * @param {object[]} occurrences
 * @param {{ includeCompleted?: boolean }} [options]
 */
export function filterExpandedEventsForExport(occurrences, options = {}) {
  const includeCompleted = options.includeCompleted !== false
  if (includeCompleted) return occurrences ?? []
  return (occurrences ?? []).filter((event) => !event?.completed)
}
