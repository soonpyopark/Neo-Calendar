import type { PanelWindowInit } from '../../../shared/panelWindows'

/**
 * Open the image attachment viewer as a search/settings-sized floating panel.
 * Returns false when panels are unavailable (browser host).
 */
export async function openAttachmentViewerPanel(
  eventId: string,
  attachmentId: string
): Promise<boolean> {
  const eid = String(eventId ?? '').trim()
  const aid = String(attachmentId ?? '').trim()
  if (!eid || !aid) return false
  const init: Extract<PanelWindowInit, { kind: 'attachmentViewer' }> = {
    kind: 'attachmentViewer',
    eventId: eid,
    attachmentId: aid
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
    console.warn('[attachment-viewer] open panel failed', error)
  }
  return false
}
