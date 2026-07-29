import { useCallback, type ReactElement } from 'react'
import { DayListPreviewPanel } from '../../components/DayListPreviewPanel'
import { useCalendarStore } from '../../hooks/useCalendarStore'
import type { PanelWindowInit } from '../../../../shared/panelWindows'
import { usePanelRouter, usePanelTheme } from '../usePanelEventHelpers'

type Init = Extract<PanelWindowInit, { kind: 'dayListPreview' }>

export function DayListPreviewPanelHost({ init }: { init: Init }): ReactElement | null {
  const { closePanel } = usePanelRouter()
  const { store, loading } = useCalendarStore()
  usePanelTheme(store.settings, loading)

  const eventsHidden = Boolean(store.settings.viewOptions.eventsHidden)

  // Double-click a date: hand the day to a quick edit panel, then close this one.
  const openDayQuickEdit = useCallback(
    (dayKey: string): void => {
      void (async () => {
        await window.neoCalendar.routePanelWindow?.({
          kind: 'quickEdit',
          dateKey: dayKey,
          viewMode: 'month',
          eventsHidden,
          anchor: null
        })
        closePanel()
      })()
    },
    [closePanel, eventsHidden]
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
        onOpenDay={openDayQuickEdit}
        onClose={closePanel}
      />
    </div>
  )
}

export default DayListPreviewPanelHost
