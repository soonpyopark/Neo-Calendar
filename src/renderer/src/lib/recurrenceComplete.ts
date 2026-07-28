import type { CalendarEvent } from '../../../shared/calendarTypes'
import type { PanelKind, PanelWindowInit } from '../../../shared/panelWindows'
import { eventToMutationPayload } from './eventMutation'

function toDateKey(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setDate(next.getDate() + days)
  return next
}

/** Mutation payload for applying a completed-state change to a recurring occurrence. */
export function buildRecurringCompletePayload(
  master: CalendarEvent,
  occurrenceDate: string,
  completed: boolean
): Record<string, unknown> {
  const durationDays = Math.max(
    1,
    Math.round(
      (new Date(`${master.endDate || master.startDate}T00:00:00`).getTime() -
        new Date(`${master.startDate}T00:00:00`).getTime()) /
        86400000
    ) + 1
  )
  const occurrenceEnd = addDays(new Date(`${occurrenceDate}T00:00:00`), durationDays - 1)
  const occurrenceEndDate = toDateKey(
    occurrenceEnd.getFullYear(),
    occurrenceEnd.getMonth(),
    occurrenceEnd.getDate()
  )
  return {
    ...eventToMutationPayload(master),
    startDate: occurrenceDate,
    endDate: occurrenceEndDate,
    completed: Boolean(completed)
  }
}

export type RecurrenceCompletePanelRequest = {
  eventId: string
  occurrenceDate: string
  completed: boolean
}

export type RecurrenceDeletePanelRequest = {
  eventId: string
  occurrenceDate: string
  /** Sibling panels to close after a successful delete. */
  closePanels?: Array<Exclude<PanelKind, 'recurrenceScope'>>
}

/** Opens a floating recurrence-scope panel. Returns false when unavailable (use inline). */
export async function openRecurrenceScopePanel(
  init: Extract<PanelWindowInit, { kind: 'recurrenceScope' }>
): Promise<boolean> {
  const open = window.neoCalendar?.openPanelWindow
  if (!open) return false
  try {
    const opened = await open(init)
    return opened !== false
  } catch {
    return false
  }
}

/** Opens the floating recurrence-complete panel. Returns false when unavailable (use inline). */
export async function openRecurrenceCompletePanel(
  request: RecurrenceCompletePanelRequest
): Promise<boolean> {
  return openRecurrenceScopePanel({
    kind: 'recurrenceScope',
    mode: 'complete',
    eventId: request.eventId,
    occurrenceDate: request.occurrenceDate,
    completed: request.completed
  })
}

/** Opens the floating recurrence-delete panel. Returns false when unavailable (use inline). */
export async function openRecurrenceDeletePanel(
  request: RecurrenceDeletePanelRequest
): Promise<boolean> {
  return openRecurrenceScopePanel({
    kind: 'recurrenceScope',
    mode: 'delete',
    eventId: request.eventId,
    occurrenceDate: request.occurrenceDate,
    closePanels: request.closePanels
  })
}
