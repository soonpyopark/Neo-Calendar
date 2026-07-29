import { DEFAULT_VIEW_OPTIONS } from './constants.js'
import { compareEventsForDayDisplay, formatDayListExportEventText } from './eventBarFormat.js'
import { addDaysToDateKey, expandEventsForRange } from './eventOccurrences.js'
import { filterEventsForExport, filterExpandedEventsForExport } from './exportFilters.js'
import {
  formatDayListDateLabel,
  listDateKeysInRange,
} from './exportRange.js'

/**
 * Build a day-list export model for [startDate, endDate].
 * Every date in the range is included (empty days keep an empty events array).
 * Multi-day / recurring events appear on every overlapping date.
 *
 * @param {object} store
 * @param {{ startDate: string, endDate: string }} range
 * @param {{
 *   includeCompleted?: boolean
 *   includeHolidays?: boolean
 *   excludeHiddenCalendars?: boolean
 *   asAdmin?: boolean
 * }} [options]
 */
export function prepareDayListExportLayout(store, range, options = {}) {
  const startDate = range.startDate
  const endDate = range.endDate
  if (!startDate || !endDate || endDate < startDate) {
    throw new Error('내보내기 기간이 올바르지 않습니다.')
  }

  const viewOptions = {
    ...DEFAULT_VIEW_OPTIONS,
    ...(store?.settings?.viewOptions ?? {}),
  }
  const weekStartsOn = viewOptions.weekStartsOnSunday === false ? 1 : 0

  const calendars = store?.calendars ?? []
  const calendarMap = new Map(calendars.map((calendar) => [calendar.id, calendar]))
  const tags = store?.tags ?? []

  const filtered = filterEventsForExport(store?.events ?? [], calendars, options)
  const expanded = filterExpandedEventsForExport(
    expandEventsForRange(filtered, startDate, endDate),
    options,
  )

  /** @type {Map<string, object[]>} */
  const byDay = new Map()
  for (const event of expanded) {
    const eventStart = event.startDate < startDate ? startDate : event.startDate
    const eventEnd = event.endDate > endDate ? endDate : event.endDate
    if (eventEnd < startDate || eventStart > endDate) continue
    let cursor = eventStart
    for (let i = 0; i < 1200 && cursor <= eventEnd; i += 1) {
      const list = byDay.get(cursor) ?? []
      list.push(event)
      byDay.set(cursor, list)
      cursor = addDaysToDateKey(cursor, 1)
    }
  }

  const dateKeys = listDateKeysInRange(startDate, endDate)
  const rows = dateKeys.map((dayKey) => {
    const dayEvents = [...(byDay.get(dayKey) ?? [])]
      .sort((a, b) => compareEventsForDayDisplay(a, b, dayKey))
      .map((event) => {
        const color = calendarMap.get(event.calendarId)?.color ?? '#f6bf26'
        return {
          id: `${event.id}-${dayKey}`,
          line: formatDayListExportEventText(event, dayKey, tags),
          color,
          completed: Boolean(event.completed),
        }
      })

    return {
      dayKey,
      dateLabel: formatDayListDateLabel(dayKey),
      events: dayEvents,
      contentText: dayEvents.map((event) => event.line).join('\n'),
    }
  })

  const title =
    startDate === endDate
      ? startDate.replace(/-/g, '.')
      : `${startDate.replace(/-/g, '.')} ~ ${endDate.replace(/-/g, '.')}`

  return {
    layout: 'dayList',
    startDate,
    endDate,
    title: `일정 목록 — ${title}`,
    weekStartsOn,
    rows,
  }
}
