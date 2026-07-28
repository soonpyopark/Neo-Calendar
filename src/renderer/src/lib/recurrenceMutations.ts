import {
  addExdate,
  buildFollowingSeriesEvent,
  buildSingleExceptionEvent,
  resolveExdatesForAllEdit,
  splitExdatesAt,
  truncateSeriesBefore
} from '../../../shared/mdcExport/eventOccurrences.js'
import type { CalendarEvent, EventInput } from '../../../shared/calendarTypes'

export type RecurrenceScope = 'single' | 'following' | 'all'

export type RecurrenceMutators = {
  addEvent: (input: EventInput) => Promise<CalendarEvent>
  editEvent: (id: string, patch: Partial<CalendarEvent>) => Promise<CalendarEvent>
  removeEvent: (id: string) => Promise<void>
}

function toDateKey(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/** Detached "this only" exceptions linked to a series master. */
export function listDetachedExceptions(
  events: CalendarEvent[],
  seriesId: string,
  options?: { fromDate?: string }
): CalendarEvent[] {
  const fromDate = options?.fromDate
  return events.filter((event) => {
    if (event.detachedFromSeriesId !== seriesId) return false
    if (!fromDate) return true
    const day = event.detachedOccurrenceDate || event.startDate
    return Boolean(day && day >= fromDate)
  })
}

export async function removeDetachedExceptions(
  events: CalendarEvent[],
  seriesId: string,
  removeEvent: RecurrenceMutators['removeEvent'],
  options?: { fromDate?: string }
): Promise<void> {
  const targets = listDetachedExceptions(events, seriesId, options)
  for (const event of targets) {
    await removeEvent(event.id)
  }
}

/**
 * Apply edit across a recurring series (Google-like scopes).
 */
export async function applyRecurringEdit(
  mutators: RecurrenceMutators,
  master: CalendarEvent,
  payload: Record<string, unknown>,
  occurrenceDate: string,
  scope: RecurrenceScope,
  allEvents: CalendarEvent[] = []
): Promise<void> {
  const { addEvent, editEvent, removeEvent } = mutators

  if (scope === 'all') {
    const startDate = String(payload.startDate ?? master.startDate)
    const endDate = String(payload.endDate ?? payload.startDate ?? master.endDate)
    const durationDays = Math.max(
      1,
      Math.round(
        (new Date(`${endDate}T00:00:00`).getTime() -
          new Date(`${startDate}T00:00:00`).getTime()) /
          86400000
      ) + 1
    )
    const keepSeriesStart = occurrenceDate !== master.startDate
    const nextStart = keepSeriesStart ? master.startDate : startDate
    const seriesEnd = new Date(`${nextStart}T00:00:00`)
    seriesEnd.setDate(seriesEnd.getDate() + durationDays - 1)
    const seriesEndDate = toDateKey(
      seriesEnd.getFullYear(),
      seriesEnd.getMonth(),
      seriesEnd.getDate()
    )
    const allPayload = {
      ...payload,
      startDate: nextStart,
      endDate: seriesEndDate
    }
    await editEvent(master.id, {
      ...allPayload,
      exdates: resolveExdatesForAllEdit(master, allPayload)
    } as Partial<CalendarEvent>)
    return
  }

  if (scope === 'single') {
    const exception = buildSingleExceptionEvent(master, payload, occurrenceDate)
    const withExdate = addExdate(master, occurrenceDate)
    // Replace a prior detached exception for the same occurrence, if any.
    const sameDay = listDetachedExceptions(allEvents, master.id).filter(
      (event) => (event.detachedOccurrenceDate || event.startDate) === occurrenceDate
    )
    for (const event of sameDay) {
      await removeEvent(event.id)
    }
    await editEvent(master.id, { exdates: withExdate.exdates })
    await addEvent(exception as EventInput)
    return
  }

  // following — split EXDATEs so future cancellations stay cancelled on the new series
  const { before, after } = splitExdatesAt(master.exdates, occurrenceDate)
  const truncated = truncateSeriesBefore(master, occurrenceDate)
  if ((truncated.repeat ?? 'none') === 'none') {
    await removeEvent(master.id)
  } else {
    await editEvent(master.id, {
      repeatUntil: truncated.repeatUntil,
      repeatCount: null,
      repeat: truncated.repeat,
      exdates: before
    })
  }
  await addEvent(
    buildFollowingSeriesEvent(
      master,
      { ...payload, exdates: after },
      occurrenceDate
    ) as EventInput
  )
}

/**
 * Apply delete across a recurring series.
 */
export async function applyRecurringDelete(
  mutators: Pick<RecurrenceMutators, 'editEvent' | 'removeEvent'>,
  master: CalendarEvent,
  occurrenceDate: string,
  scope: RecurrenceScope,
  allEvents: CalendarEvent[] = []
): Promise<void> {
  const { editEvent, removeEvent } = mutators

  if (scope === 'all') {
    await removeDetachedExceptions(allEvents, master.id, removeEvent)
    await removeEvent(master.id)
    return
  }

  if (scope === 'single') {
    const sameDay = listDetachedExceptions(allEvents, master.id).filter(
      (event) => (event.detachedOccurrenceDate || event.startDate) === occurrenceDate
    )
    for (const event of sameDay) {
      await removeEvent(event.id)
    }
    const withExdate = addExdate(master, occurrenceDate)
    await editEvent(master.id, { exdates: withExdate.exdates })
    return
  }

  // following
  const truncated = truncateSeriesBefore(master, occurrenceDate)
  const { before } = splitExdatesAt(master.exdates, occurrenceDate)
  await removeDetachedExceptions(allEvents, master.id, removeEvent, {
    fromDate: occurrenceDate
  })
  if ((truncated.repeat ?? 'none') === 'none') {
    await removeEvent(master.id)
  } else {
    await editEvent(master.id, {
      repeatUntil: truncated.repeatUntil,
      repeatCount: null,
      repeat: truncated.repeat,
      exdates: before
    })
  }
}
