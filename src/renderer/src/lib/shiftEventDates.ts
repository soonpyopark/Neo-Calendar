import { isRecurringEvent } from '../../../shared/mdcExport/eventOccurrences.js'
import type { CalendarEvent } from '../../../shared/calendarTypes'
import { addDays, parseDateKey, toDateKey } from './calendarUtils'
import { eventToMutationPayload } from './eventMutation'
import {
  applyRecurringEdit,
  type RecurrenceMutators,
  type RecurrenceScope
} from './recurrenceMutations'

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  if (!deltaDays) return dateKey
  return toDateKey(addDays(parseDateKey(dateKey), deltaDays))
}

export function eventDurationDays(
  event: Pick<CalendarEvent, 'startDate' | 'endDate'>
): number {
  const start = event.startDate
  const end = event.endDate || event.startDate
  return Math.max(
    1,
    Math.round(
      (new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) /
        86400000
    ) + 1
  )
}

function shiftDateKeyMap(
  map: Record<string, number> | undefined,
  deltaDays: number
): Record<string, number> | undefined {
  if (!map || typeof map !== 'object') return undefined
  const next: Record<string, number> = {}
  for (const [key, value] of Object.entries(map)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      next[shiftDateKey(key, deltaDays)] = value
    } else {
      next[key] = value
    }
  }
  return next
}

/** Patch for a non-recurring event or an entire series (`scope=all`). */
export function buildShiftedSeriesPatch(
  master: CalendarEvent,
  deltaDays: number
): Partial<CalendarEvent> {
  const patch: Partial<CalendarEvent> = {
    startDate: shiftDateKey(master.startDate, deltaDays),
    endDate: shiftDateKey(master.endDate || master.startDate, deltaDays)
  }
  if (master.repeatUntil) {
    patch.repeatUntil = shiftDateKey(master.repeatUntil, deltaDays)
  }
  if (Array.isArray(master.exdates) && master.exdates.length > 0) {
    patch.exdates = master.exdates.map((day) => shiftDateKey(day, deltaDays))
  }
  const sortOrderByDay = shiftDateKeyMap(master.sortOrderByDay, deltaDays)
  if (sortOrderByDay) patch.sortOrderByDay = sortOrderByDay
  return patch
}

/** Payload for `single` / `following` via `applyRecurringEdit`. */
export function buildShiftedOccurrencePayload(
  master: CalendarEvent,
  occurrenceDate: string,
  deltaDays: number
): Record<string, unknown> {
  const duration = eventDurationDays(master)
  const newStart = shiftDateKey(occurrenceDate, deltaDays)
  const newEnd = shiftDateKey(occurrenceDate, deltaDays + duration - 1)
  const sortOrderByDay = shiftDateKeyMap(master.sortOrderByDay, deltaDays)
  return {
    ...eventToMutationPayload(master),
    startDate: newStart,
    endDate: newEnd,
    ...(sortOrderByDay ? { sortOrderByDay } : {})
  }
}

export type ApplyEventDateShiftOptions = {
  master: CalendarEvent
  occurrenceDate: string
  deltaDays: number
  /** Required when the master is recurring. */
  scope?: RecurrenceScope
  allEvents?: CalendarEvent[]
}

/**
 * Move an event (or occurrence) by `deltaDays`, keeping duration and clock times.
 * Recurring `all` shifts the master series; `single`/`following` reuse recurrence edit paths.
 */
export async function applyEventDateShift(
  mutators: RecurrenceMutators,
  options: ApplyEventDateShiftOptions
): Promise<void> {
  const { master, occurrenceDate, deltaDays } = options
  if (!Number.isFinite(deltaDays) || deltaDays === 0) {
    return
  }

  if (!isRecurringEvent(master)) {
    await mutators.editEvent(master.id, buildShiftedSeriesPatch(master, deltaDays))
    return
  }

  const scope = options.scope
  if (!scope) {
    throw new Error('반복 일정 범위를 선택하세요.')
  }

  if (scope === 'all') {
    const detached = (options.allEvents ?? []).filter(
      (event) => event.detachedFromSeriesId === master.id
    )
    for (const event of detached) {
      await mutators.editEvent(event.id, {
        ...buildShiftedSeriesPatch(event, deltaDays),
        detachedOccurrenceDate: event.detachedOccurrenceDate
          ? shiftDateKey(event.detachedOccurrenceDate, deltaDays)
          : event.detachedOccurrenceDate
      })
    }
    await mutators.editEvent(master.id, buildShiftedSeriesPatch(master, deltaDays))
    return
  }

  const payload = buildShiftedOccurrencePayload(master, occurrenceDate, deltaDays)
  await applyRecurringEdit(
    mutators,
    master,
    payload,
    occurrenceDate,
    scope,
    options.allEvents ?? []
  )
}
