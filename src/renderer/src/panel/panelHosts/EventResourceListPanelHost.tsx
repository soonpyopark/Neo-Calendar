import { useMemo, type ReactElement } from 'react'
import { EventResourceListDialog } from '../../components/EventResourceListDialog'
import { useCalendarStore } from '../../hooks/useCalendarStore'
import type { PanelWindowInit } from '../../../../shared/panelWindows'
import { usePanelRouter, usePanelTheme } from '../usePanelEventHelpers'

type Init = Extract<PanelWindowInit, { kind: 'eventResourceList' }>

export function EventResourceListPanelHost({ init }: { init: Init }): ReactElement | null {
  const { closePanel } = usePanelRouter()
  const { store, loading } = useCalendarStore()
  usePanelTheme(store.settings, loading)

  const event = useMemo(
    () => store.events.find((item) => item.id === init.eventId) ?? null,
    [init.eventId, store.events]
  )

  if (loading) return null

  if (!event) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl bg-gcal-surface px-4 text-sm text-gcal-muted">
        일정을 찾을 수 없습니다.
        <button
          type="button"
          className="ml-3 rounded-full px-2.5 py-1 text-gcal-blue hover:bg-gcal-blue-soft"
          onClick={closePanel}
        >
          닫기
        </button>
      </div>
    )
  }

  return (
    <EventResourceListDialog
      type={init.type}
      event={event}
      surface="floating"
      onClose={closePanel}
    />
  )
}

export default EventResourceListPanelHost
