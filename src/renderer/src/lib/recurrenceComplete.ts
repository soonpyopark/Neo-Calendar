import type { CalendarEvent } from '../../../shared/calendarTypes'
import type { PanelKind, PanelWindowInit } from '../../../shared/panelWindows'
import {
  dispatchEventUiDismiss,
  EVENT_UI_DISMISS_QUICK_EDIT_DELAY_MS
} from './eventUiDismiss'
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

/** Event UI panels dismissed after a successful delete (not settings/search/login). */
export const PANELS_TO_CLOSE_AFTER_EVENT_DELETE = [
  'eventDetail',
  'eventEditor',
  'quickEdit'
] as const satisfies ReadonlyArray<Exclude<PanelKind, 'recurrenceScope'>>

/** Closed first on delete success; quickEdit closes last so cancel can keep working in QE. */
const PANELS_BEFORE_QUICK_EDIT_ON_DELETE = [
  'recurrenceScope',
  'eventEditor',
  'eventDetail'
] as const satisfies ReadonlyArray<PanelKind>

export type RecurrenceDeletePanelRequest = {
  eventId: string
  occurrenceDate: string
  /** Sibling panels to close after a successful delete. Defaults to all event UI panels. */
  closePanels?: Array<Exclude<PanelKind, 'recurrenceScope'>>
}

/** Block outside-click dismiss after in-panel modals so click-through does not wipe quickEdit. */
export function blockPanelOutsideClose(ms = 400): void {
  window.neoCalendar.blockPanelOutsideClose?.(ms)
}

/**
 * After a successful delete: close detail/editor/scope first, then quickEdit last.
 * Floating panels: sequenced in the main process (renderer timers die with the caller panel).
 * Inline overlays (browser): CustomEvent phases in this window.
 * Cancel paths must not call this — quickEdit should stay available.
 */
export function closePanelsAfterEventDelete(): void {
  blockPanelOutsideClose(500)
  // Inline overlays (browser / unlocked desktop) clear local React state here.
  dispatchEventUiDismiss('immediate')

  const closeInMain = window.neoCalendar.closeAfterEventDelete
  if (typeof closeInMain === 'function') {
    closeInMain()
  } else {
    for (const kind of PANELS_BEFORE_QUICK_EDIT_ON_DELETE) {
      window.neoCalendar.closePanelSlot?.(kind)
    }
    window.neoCalendar.closePanelSlot?.('quickEdit')
    window.neoCalendar.closeQuickEditWindow?.()
  }

  // Browser inline quickEdit — schedule in this window (CalendarGrid listens).
  window.setTimeout(() => {
    dispatchEventUiDismiss('quickEdit')
  }, EVENT_UI_DISMISS_QUICK_EDIT_DELAY_MS)
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
    closePanels: request.closePanels ?? [...PANELS_TO_CLOSE_AFTER_EVENT_DELETE]
  })
}
