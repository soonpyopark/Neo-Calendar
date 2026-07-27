import { useMemo, type ReactElement } from 'react'
import { buildDayDisplayEvents, DayEventsPopover } from '../../components/DayEventsPopover'
import { useCalendarStore } from '../../hooks/useCalendarStore'
import type { PanelWindowInit } from '../../../../shared/panelWindows'
import { parseDateKey as parseDateKeyLocal } from '../../lib/calendarUtils'
import {
  getEventSortOrderForDay,
  mergeSortOrderByDay
} from '../../../../shared/mdcExport/eventBarFormat.js'
import { getSeriesId } from '../../../../shared/mdcExport/eventOccurrences.js'
import { HOLIDAYS_KR_CALENDAR_ID } from '../../../../shared/calendarDefaults'
import { useAppDialog } from '../../components/AppDialogProvider'
import { usePanelAuth, usePanelRouter, usePanelTheme } from '../usePanelEventHelpers'

type Init = Extract<PanelWindowInit, { kind: 'dayList' }>

export function DayListPanelHost({ init }: { init: Init }): ReactElement | null {
  const { alert } = useAppDialog()
  const { closePanel, routePanel } = usePanelRouter()
  const { authReady, canEdit } = usePanelAuth()
  const { store, loading, visibleEvents, editEvent } = useCalendarStore()
  usePanelTheme(store.settings)

  const date = useMemo(
    () => parseDateKeyLocal(init.dateKey),
    [init.dateKey]
  )

  const dayEvents = useMemo(() => {
    const raw = visibleEvents.filter(
      (event) =>
        event.startDate <= init.dateKey &&
        (event.endDate || event.startDate) >= init.dateKey
    )
    return buildDayDisplayEvents(raw, init.dateKey, store.tags)
  }, [init.dateKey, store.tags, visibleEvents])

  if (loading || !authReady || !date) return null

  return (
    <div className="neo-panel-shell h-screen w-screen overflow-hidden">
      <DayEventsPopover
        surface="floating"
        date={date}
        dayKey={init.dateKey}
        events={init.eventsHidden ? [] : dayEvents}
        calendars={store.calendars}
        tags={store.tags}
        anchorRect={init.anchor}
        canEdit={canEdit}
        onClose={closePanel}
        onEventDetail={(event, _x, _y, dayKey, pointerAnchor) => {
          routePanel({
            kind: 'eventDetail',
            eventId: event.id,
            dayKey,
            anchor: pointerAnchor
              ? { top: pointerAnchor.y - 12, left: pointerAnchor.x - 12, width: 24, height: 24 }
              : null
          })
        }}
        onEventEdit={(event, dayKey) => {
          if (event.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
          routePanel({
            kind: 'eventEditor',
            eventId: event.id,
            defaultDate: dayKey,
            occurrenceDate: dayKey
          })
        }}
        onReorderEvents={async (ordered, dayKey) => {
          if (!canEdit || !dayKey) return
          try {
            for (const { event, sortOrder } of ordered ?? []) {
              const master =
                store.events.find((item) => item.id === (getSeriesId(event) || event.id)) ?? null
              if (!master || master.calendarId === HOLIDAYS_KR_CALENDAR_ID) continue
              if (getEventSortOrderForDay(master, dayKey) === sortOrder) continue
              await editEvent(master.id, {
                sortOrderByDay: mergeSortOrderByDay(master, dayKey, sortOrder)
              })
            }
          } catch (error) {
            await alert(error instanceof Error ? error.message : '일정 순서를 저장하지 못했습니다.')
          }
        }}
      />
    </div>
  )
}

export default DayListPanelHost
