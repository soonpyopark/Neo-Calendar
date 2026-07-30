import type { EventResourceListKind } from '../components/EventResourceListDialog'
import type { PanelWindowInit } from '../../../shared/panelWindows'

/**
 * Open the link / attachment chooser as its own floating panel.
 * Returns false when panels are unavailable (browser host) so callers can fall back inline.
 */
export async function openEventResourceListPanel(
  type: EventResourceListKind,
  eventId: string
): Promise<boolean> {
  const id = String(eventId ?? '').trim()
  if (!id) return false
  const init: Extract<PanelWindowInit, { kind: 'eventResourceList' }> = {
    kind: 'eventResourceList',
    type,
    eventId: id
  }
  try {
    if (window.neoCalendar.routePanelWindow) {
      const routed = await window.neoCalendar.routePanelWindow(init)
      if (routed) return true
    }
    if (window.neoCalendar.openPanelWindow) {
      return Boolean(await window.neoCalendar.openPanelWindow(init))
    }
  } catch (error) {
    console.warn('[event-resource-list] open panel failed', error)
  }
  return false
}
