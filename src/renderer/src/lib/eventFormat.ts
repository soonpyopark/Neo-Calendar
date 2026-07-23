import { formatTime24, isTimedEvent } from '../../../shared/mdcExport/eventBarFormat.js'
import { eventOnDay, parseDateKey } from './calendarUtils'

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

const REPEAT_LABELS: Record<string, string | null> = {
  none: null,
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
  yearly: '매년',
  'lunar-monthly': '음력 매월',
  'lunar-yearly': '음력 매년',
  weekdays: '주중(월~금)'
}

function formatShortDate(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

/** Quick-edit / day-list label (plain title; tag icons render separately). */
export function formatEventBarLabel(
  event: { title?: string; allDay?: boolean; startTime?: string | null },
  showOnDay: boolean,
  _tags?: unknown
): { time: string | null; title: string } | null {
  if (!showOnDay) return null
  const title = event.title ?? ''
  if (!isTimedEvent(event)) {
    return { time: null, title }
  }
  return {
    time: formatTime24(event.startTime),
    title
  }
}

export function formatEventPopoverSchedule(
  event: {
    startDate: string
    endDate?: string
    allDay?: boolean
    startTime?: string | null
    endTime?: string | null
  },
  dayKey?: string
): string {
  const refKey = dayKey && eventOnDay(event, dayKey) ? dayKey : event.startDate
  const date = parseDateKey(refKey)
  const datePart = `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY_NAMES[date.getDay()]})`
  const endDate = event.endDate || event.startDate

  if (event.startDate !== endDate) {
    const start = parseDateKey(event.startDate)
    const end = parseDateKey(endDate)

    if (isTimedEvent(event)) {
      return `${formatShortDate(start)} ${formatTime24(event.startTime)} ~ ${formatShortDate(end)} ${formatTime24(event.endTime)}`
    }

    const rangePart =
      start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
        ? `${formatShortDate(start)}~${end.getDate()}일`
        : `${formatShortDate(start)}~${formatShortDate(end)}`

    return `${rangePart} · 종일`
  }

  if (isTimedEvent(event)) {
    return `${datePart} · ${formatTime24(event.startTime)}~${formatTime24(event.endTime)}`
  }

  return `${datePart} · 종일`
}

export function formatRepeatLabel(
  event: { repeat?: string | null; repeatUntil?: string | null; repeatCount?: number | null } | string | null | undefined
): string | null {
  if (!event) return null
  const repeat = typeof event === 'string' ? event : (event.repeat ?? 'none')
  if (!repeat || repeat === 'none') return null
  const base = REPEAT_LABELS[repeat]
  if (!base) return null

  if (typeof event === 'string') return base

  if (event.repeatUntil) {
    const [y, m, d] = String(event.repeatUntil).split('-')
    return `${base} · ${Number(y)}년 ${Number(m)}월 ${Number(d)}일까지`
  }
  if (event.repeatCount) {
    return `${base} · ${event.repeatCount}회`
  }
  return base
}
