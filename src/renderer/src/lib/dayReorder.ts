import { HOLIDAYS_KR_CALENDAR_ID } from '../../../shared/calendarDefaults'
import { getSeriesId } from '../../../shared/mdcExport/eventOccurrences.js'
import type { CalendarEvent } from '../../../shared/calendarTypes'

export type DayReorderItem = { event: CalendarEvent; sortOrder: number }

type SegmentLike = { event?: CalendarEvent | null }

/** MDC MonthView: reorder movable (non-holiday) events within one day. */
export function buildDayReorderPayload(
  daySegments: SegmentLike[] | null | undefined,
  fromSeriesId: string | null | undefined,
  toSeriesId: string | null | undefined
): DayReorderItem[] | null {
  if (!fromSeriesId || !toSeriesId || fromSeriesId === toSeriesId) return null
  const ordered = (daySegments ?? []).map((segment) => segment.event).filter(Boolean) as CalendarEvent[]
  const movable = ordered.filter((event) => event.calendarId !== HOLIDAYS_KR_CALENDAR_ID)
  const fromIndex = movable.findIndex((event) => (getSeriesId(event) || event.id) === fromSeriesId)
  const toIndex = movable.findIndex((event) => (getSeriesId(event) || event.id) === toSeriesId)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null
  const next = [...movable]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next.map((event, index) => ({ event, sortOrder: index }))
}

export function commitDayReorder(
  onReorderEvents:
    | ((ordered: DayReorderItem[], dayKey: string) => void | Promise<void>)
    | null
    | undefined,
  payload: DayReorderItem[] | null,
  dayKey: string
): void {
  if (!payload || !dayKey) return
  void onReorderEvents?.(payload, dayKey)
}
