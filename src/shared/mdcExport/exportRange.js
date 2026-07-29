import { addDaysToDateKey, parseDateKey, toDateKey } from './eventOccurrences.js'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * @param {string} dateKey
 * @param {0|1} weekStartsOn
 */
export function startOfWeekDateKey(dateKey, weekStartsOn = 0) {
  const date = parseDateKey(dateKey)
  const day = date.getDay()
  const offset = (day - weekStartsOn + 7) % 7
  return addDaysToDateKey(dateKey, -offset)
}

/**
 * Inclusive list of YYYY-MM-DD keys from start to end.
 * @param {string} startDate
 * @param {string} endDate
 * @returns {string[]}
 */
export function listDateKeysInRange(startDate, endDate) {
  if (endDate < startDate) return []
  /** @type {string[]} */
  const keys = []
  let cursor = startDate
  // Safety cap (~3 years) to avoid runaway ranges.
  for (let i = 0; i < 1200 && cursor <= endDate; i += 1) {
    keys.push(cursor)
    cursor = addDaysToDateKey(cursor, 1)
  }
  return keys
}

/**
 * Continuous weeks covering [startDate, endDate], padded to full weeks.
 * @param {string} startDate
 * @param {string} endDate
 * @param {0|1} [weekStartsOn=0]
 * @returns {{ date: Date, inRange: boolean }[][]}
 */
export function getRangeWeeksForExport(startDate, endDate, weekStartsOn = 0) {
  const weekStart = startOfWeekDateKey(startDate, weekStartsOn)
  const endWeekStart = startOfWeekDateKey(endDate, weekStartsOn)
  const rangeEnd = addDaysToDateKey(endWeekStart, 6)

  /** @type {{ date: Date, inRange: boolean }[][]} */
  const weeks = []
  let cursor = weekStart
  while (cursor <= rangeEnd) {
    /** @type {{ date: Date, inRange: boolean }[]} */
    const week = []
    for (let i = 0; i < 7; i += 1) {
      const key = addDaysToDateKey(cursor, i)
      const date = parseDateKey(key)
      week.push({
        date,
        inRange: key >= startDate && key <= endDate,
      })
    }
    weeks.push(week)
    cursor = addDaysToDateKey(cursor, 7)
  }
  return weeks
}

/**
 * @param {0|1} weekStartsOn
 */
export function getWeekdayHeaders(weekStartsOn = 0) {
  return [...WEEKDAY_LABELS.slice(weekStartsOn), ...WEEKDAY_LABELS.slice(0, weekStartsOn)]
}

/**
 * @param {string} dateKey
 */
export function formatDayListDateLabel(dateKey) {
  const date = parseDateKey(dateKey)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const weekday = WEEKDAY_LABELS[date.getDay()] ?? ''
  return `${mm}.${dd}.(${weekday})`
}

/**
 * Preset ranges relative to a reference date (usually "today" or viewDate).
 * @param {'thisMonth'|'thisWeek'|'thisYear'|'custom'} preset
 * @param {Date} [reference=new Date()]
 * @param {0|1} [weekStartsOn=0]
 */
export function resolveExportRangePreset(preset, reference = new Date(), weekStartsOn = 0) {
  const y = reference.getFullYear()
  const m = reference.getMonth()
  const d = reference.getDate()
  const todayKey = toDateKey(new Date(y, m, d))

  if (preset === 'thisYear') {
    return {
      startDate: `${y}-01-01`,
      endDate: `${y}-12-31`,
    }
  }

  if (preset === 'thisWeek') {
    const startDate = startOfWeekDateKey(todayKey, weekStartsOn)
    return {
      startDate,
      endDate: addDaysToDateKey(startDate, 6),
    }
  }

  // thisMonth (default) and custom callers still get month bounds as a sensible default.
  const last = new Date(y, m + 1, 0).getDate()
  return {
    startDate: `${y}-${String(m + 1).padStart(2, '0')}-01`,
    endDate: `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  }
}
