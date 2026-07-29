/**
 * Cross-mode event UI dismiss after delete.
 *
 * Modes:
 * - Desktop (WorkerW) + Window: floating BrowserWindow panels via closePanelSlot
 * - Browser + unlocked desktop: inline overlays listen for these events in CalendarGrid
 *
 * Contract:
 * - Delete CANCEL must not call dismissAfterEventDelete (detail + quickEdit stay)
 * - Detail X closes detail only (quickEdit stays)
 * - Delete SUCCESS: detail/editor/scope close; quickEdit stays and refreshes via store-changed
 */

export const EVENT_UI_DISMISS_AFTER_DELETE = 'neo-dismiss-event-ui-after-delete'

export type EventUiDismissPhase = 'immediate' | 'quickEdit'

export type EventUiDismissDetail = {
  phase: EventUiDismissPhase
}

/** @deprecated QuickEdit is no longer closed after delete; kept for type/compat only. */
export const EVENT_UI_DISMISS_QUICK_EDIT_DELAY_MS = 180

export function dispatchEventUiDismiss(phase: EventUiDismissPhase): void {
  window.dispatchEvent(
    new CustomEvent<EventUiDismissDetail>(EVENT_UI_DISMISS_AFTER_DELETE, {
      detail: { phase }
    })
  )
}
