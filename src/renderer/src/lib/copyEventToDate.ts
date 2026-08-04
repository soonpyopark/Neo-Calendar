import { getSeriesId } from '../../../shared/mdcExport/eventOccurrences.js'
import type { CalendarEvent, EventInput } from '../../../shared/calendarTypes'
import { eventToMutationPayload } from './eventMutation'
import { eventDurationDays, shiftDateKey } from './shiftEventDates'

/**
 * Build a create payload that clones one occurrence onto `targetStartDate`.
 * Always a single (non-recurring) event; completed is always false; attachments
 * are copied afterward via {@link copyEventAttachments}.
 */
export function buildCopiedEventInput(
  master: CalendarEvent,
  _occurrenceDate: string,
  targetStartDate: string
): EventInput {
  const base = eventToMutationPayload(master)
  const duration = eventDurationDays(master)
  const startDate = targetStartDate
  const endDate = shiftDateKey(startDate, duration - 1)

  return {
    ...base,
    startDate,
    endDate,
    repeat: 'none',
    repeatUntil: null,
    repeatCount: null,
    exdates: [],
    completed: false,
    sortOrder: undefined,
    sortOrderByDay: undefined,
    attachments: [],
    detachedFromSeriesId: null,
    detachedOccurrenceDate: null
  }
}

export async function copyEventAttachments(
  sourceEventId: string,
  targetEventId: string
): Promise<CalendarEvent | null> {
  const api = window.neoCalendar as {
    copyEventAttachments?: (from: string, to: string) => Promise<CalendarEvent>
  }
  if (typeof api.copyEventAttachments !== 'function') return null
  return api.copyEventAttachments(sourceEventId, targetEventId)
}

export type CopyEventToDateOptions = {
  master: CalendarEvent
  occurrenceDate: string
  targetStartDate: string
  addEvent: (input: EventInput) => Promise<CalendarEvent>
}

/** Create a single-day copy on `targetStartDate` and deep-copy attachments. */
export async function copyEventToDate(
  options: CopyEventToDateOptions
): Promise<CalendarEvent> {
  const { master, occurrenceDate, targetStartDate, addEvent } = options
  const payload = buildCopiedEventInput(master, occurrenceDate, targetStartDate)
  const created = await addEvent(payload)
  const sourceId = getSeriesId(master) || master.id
  if (sourceId && Array.isArray(master.attachments) && master.attachments.length > 0) {
    const withFiles = await copyEventAttachments(sourceId, created.id)
    if (withFiles) return withFiles
  }
  return created
}
