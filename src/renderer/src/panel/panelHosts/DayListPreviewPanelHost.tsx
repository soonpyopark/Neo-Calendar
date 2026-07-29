import { useCallback, type ReactElement } from 'react'
import { DayListPreviewPanel } from '../../components/DayListPreviewPanel'
import { useCalendarStore } from '../../hooks/useCalendarStore'
import type { PanelWindowInit } from '../../../../shared/panelWindows'
import { usePanelRouter, usePanelTheme } from '../usePanelEventHelpers'

type Init = Extract<PanelWindowInit, { kind: 'dayListPreview' }>

export function DayListPreviewPanelHost({ init }: { init: Init }): ReactElement | null {
  const { closePanel, routePanel } = usePanelRouter()
  const { store, loading } = useCalendarStore()
  usePanelTheme(store.settings, loading)

  const eventsHidden = Boolean(store.settings.viewOptions.eventsHidden)

  // Double-click a date: open a centered editor for a new event and keep this panel open.
  // The saved event lands here through the main process `store-changed` broadcast.
  const addEventOnDay = useCallback(
    (dayKey: string): void => {
      routePanel({
        kind: 'eventEditor',
        eventId: null,
        defaultDate: dayKey,
        occurrenceDate: dayKey,
        returnQuickEdit: null
      })
    },
    [routePanel]
  )

  if (loading) return null

  return (
    <div className="neo-panel-shell h-screen w-screen overflow-hidden">
      <DayListPreviewPanel
        surface="floating"
        open
        store={store}
        year={init.year}
        month={init.month}
        eventsHidden={eventsHidden}
        completedHidden={Boolean(store.settings.viewOptions.completedHidden)}
        onOpenDay={addEventOnDay}
        onClose={closePanel}
      />
    </div>
  )
}

export default DayListPreviewPanelHost
