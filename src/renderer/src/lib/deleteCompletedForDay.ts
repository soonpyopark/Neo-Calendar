import {
  addExdate,
  getOccurrenceDate,
  getSeriesId,
  isRecurringEvent
} from '../../../shared/mdcExport/eventOccurrences.js'
import { HOLIDAYS_KR_CALENDAR_ID } from '../../../shared/calendarDefaults'
import type { CalendarEvent, EventInput } from '../../../shared/calendarTypes'
import { eventToMutationPayload } from './eventMutation'
import { listDetachedExceptions, type RecurrenceMutators } from './recurrenceMutations'

export type DeleteCompletedForDayResult = {
  deleted: number
  failed: number
  /** Ordered forward (redo). Undo applies this list in reverse. */
  steps: BulkDeleteHistoryStep[]
}

/** One atomic undo/redo bundle for bulk completed-delete. */
export type BulkDeleteHistoryStep =
  | { kind: 'deleted'; restore: EventInput; idRef: { id: string } }
  | {
      kind: 'patched'
      id: string
      before: EventInput
      after: Partial<CalendarEvent>
    }

function toRestorePayload(event: CalendarEvent): EventInput {
  return {
    ...eventToMutationPayload(event),
    detachedFromSeriesId: event.detachedFromSeriesId ?? null,
    detachedOccurrenceDate: event.detachedOccurrenceDate ?? null
  }
}

/**
 * Delete completed events shown on a day list.
 * Recurring series: this date only (`single` / EXDATE) — matches quick-edit day scope.
 * Callers should wrap with history suppression and record `steps` as one undo entry.
 */
export async function deleteCompletedEventsForDay(options: {
  completedEvents: CalendarEvent[]
  dateKey: string
  getEvents: () => CalendarEvent[]
  editEvent: RecurrenceMutators['editEvent']
  removeEvent: RecurrenceMutators['removeEvent']
}): Promise<DeleteCompletedForDayResult> {
  const { completedEvents, dateKey, getEvents, editEvent, removeEvent } = options
  let deleted = 0
  let failed = 0
  const steps: BulkDeleteHistoryStep[] = []

  for (const event of completedEvents) {
    if (event.calendarId === HOLIDAYS_KR_CALENDAR_ID) continue
    if (!event.completed) continue
    const seriesId = getSeriesId(event) || event.id
    const allEvents = getEvents()
    const master = allEvents.find((item) => item.id === seriesId) ?? null
    if (!master || master.calendarId === HOLIDAYS_KR_CALENDAR_ID) {
      failed += 1
      continue
    }
    try {
      if (!isRecurringEvent(master)) {
        const restore = toRestorePayload(master)
        const idRef = { id: master.id }
        await removeEvent(master.id)
        steps.push({ kind: 'deleted', restore, idRef })
      } else {
        const occurrenceDate = getOccurrenceDate(event, dateKey) || master.startDate
        const sameDayDetached = listDetachedExceptions(allEvents, master.id).filter(
          (item) => (item.detachedOccurrenceDate || item.startDate) === occurrenceDate
        )
        for (const detached of sameDayDetached) {
          const restore = toRestorePayload(detached)
          const idRef = { id: detached.id }
          await removeEvent(detached.id)
          steps.push({ kind: 'deleted', restore, idRef })
        }
        const before = toRestorePayload(master)
        const withExdate = addExdate(master, occurrenceDate)
        const after = { exdates: withExdate.exdates as string[] }
        await editEvent(master.id, after)
        steps.push({ kind: 'patched', id: master.id, before, after })
      }
      deleted += 1
    } catch {
      failed += 1
    }
  }

  return { deleted, failed, steps }
}

export function listDeletableCompletedEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter(
    (event) => Boolean(event.completed) && event.calendarId !== HOLIDAYS_KR_CALENDAR_ID
  )
}
