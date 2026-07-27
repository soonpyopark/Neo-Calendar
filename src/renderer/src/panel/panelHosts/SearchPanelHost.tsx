import { type ReactElement } from 'react'
import { SearchPanel } from '../../components/SearchPanel'
import { useCalendarStore } from '../../hooks/useCalendarStore'
import type { PanelWindowInit } from '../../../../shared/panelWindows'
import { usePanelRouter, usePanelTheme } from '../usePanelEventHelpers'

type Init = Extract<PanelWindowInit, { kind: 'search' }>

export function SearchPanelHost({ init }: { init: Init }): ReactElement | null {
  const { closePanel, routePanel } = usePanelRouter()
  const { store, loading, visibleEvents } = useCalendarStore()
  usePanelTheme(store.settings)

  if (loading) return null

  return (
    <div className="neo-panel-shell h-screen w-screen overflow-hidden p-2">
      <SearchPanel
        surface="floating"
        open
        events={init.eventsHidden ? [] : visibleEvents}
        calendars={store.calendars}
        tags={store.tags}
        onClose={closePanel}
        onSelectResult={({ event, dayKey }) => {
          closePanel()
          routePanel({
            kind: 'eventDetail',
            eventId: event.id,
            dayKey,
            fromSearch: true,
            anchor: null
          })
        }}
      />
    </div>
  )
}

export default SearchPanelHost
