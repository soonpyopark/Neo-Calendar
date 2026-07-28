import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { useAppDialog } from '../../components/AppDialogProvider'
import { EventPopover } from '../../components/EventPopover'
import { RecurrenceScopeDialog } from '../../components/RecurrenceScopeDialog'
import { useCalendarStore } from '../../hooks/useCalendarStore'
import {
  expandEventsForRange,
  getOccurrenceDate,
  getSeriesId,
  isRecurringEvent
} from '../../../../shared/mdcExport/eventOccurrences.js'
import {
  buildRecurringCompletePayload,
  closePanelsAfterEventDelete,
  openRecurrenceCompletePanel,
  openRecurrenceDeletePanel
} from '../../lib/recurrenceComplete'
import { HOLIDAYS_KR_CALENDAR_ID } from '../../../../shared/calendarDefaults'
import type { CalendarEvent } from '../../../../shared/calendarTypes'
import type { PanelWindowInit } from '../../../../shared/panelWindows'
import {
  findMasterEvent,
  useApplyRecurringDelete,
  useApplyRecurringEdit,
  usePanelAuth,
  usePanelRouter,
  usePanelTheme
} from '../usePanelEventHelpers'

type Init = Extract<PanelWindowInit, { kind: 'eventDetail' }>

export function EventDetailPanelHost({ init }: { init: Init }): ReactElement | null {
  const { alert } = useAppDialog()
  const { closePanel, routePanel } = usePanelRouter()
  const { authReady, canEdit } = usePanelAuth()
  const { store, loading, editEvent, removeEvent, addEvent } = useCalendarStore()
  usePanelTheme(store.settings, loading)

  const [scopeDialog, setScopeDialog] = useState<{ mode: 'complete' | 'delete' } | null>(null)
  const [pendingComplete, setPendingComplete] = useState<{
    master: CalendarEvent
    occurrenceDate: string
    completed: boolean
  } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    master: CalendarEvent
    occurrenceDate: string
  } | null>(null)

  const getEvents = useCallback(() => store.events, [store.events])
  const applyRecurringEdit = useApplyRecurringEdit({
    addEvent,
    editEvent,
    removeEvent,
    getEvents
  })
  const applyRecurringDelete = useApplyRecurringDelete({
    editEvent,
    removeEvent,
    getEvents
  })

  const seriesId = init.eventId.split('::')[0] ?? init.eventId
  const dayKey = init.dayKey ?? init.eventId.split('::')[1] ?? ''
  const event = useMemo(() => {
    const master = store.events.find((item) => item.id === seriesId) ?? null
    if (!master) return null
    const resolvedDay = dayKey || master.startDate
    const expanded = expandEventsForRange([master], resolvedDay, resolvedDay)
    return (
      expanded.find((item) => item.id === init.eventId) ??
      expanded.find((item) => (getSeriesId(item) || item.id) === seriesId) ??
      expanded[0] ??
      master
    )
  }, [dayKey, init.eventId, seriesId, store.events])
  const calendar = event
    ? (store.calendars.find((c) => c.id === event.calendarId) ?? null)
    : null

  const handleScopeSelect = async (scope: 'single' | 'following' | 'all'): Promise<void> => {
    const dialogMode = scopeDialog?.mode
    setScopeDialog(null)
    try {
      if (dialogMode === 'complete' && pendingComplete?.master) {
        const { master, occurrenceDate, completed } = pendingComplete
        const payload = buildRecurringCompletePayload(master, occurrenceDate, Boolean(completed))
        await applyRecurringEdit(master, payload, occurrenceDate, scope)
        setPendingComplete(null)
        return
      }
      if (dialogMode === 'delete' && pendingDelete?.master) {
        const { master, occurrenceDate } = pendingDelete
        setPendingDelete(null)
        await applyRecurringDelete(master, occurrenceDate, scope)
        closePanelsAfterEventDelete()
      }
    } catch (error) {
      await alert(error instanceof Error ? error.message : '반복 일정 처리에 실패했습니다.')
    }
  }

  const openEditor = useCallback(
    (target: CalendarEvent): void => {
      routePanel({
        kind: 'eventEditor',
        eventId: target.id,
        defaultDate: dayKey,
        occurrenceDate: dayKey
      })
    },
    [dayKey, routePanel]
  )

  if (loading || !authReady || !event) return null

  return (
    <div className="neo-panel-shell h-screen w-screen overflow-hidden">
      <EventPopover
        surface="floating"
        event={event}
        calendar={calendar}
        tags={store.tags}
        dayKey={dayKey}
        anchorRect={init.anchor ?? null}
        canEdit={canEdit && event.calendarId !== HOLIDAYS_KR_CALENDAR_ID}
        onClose={closePanel}
        onEdit={openEditor}
        onDelete={(target) => {
          // Same delete path as EventEditorPanelHost (after EventPopover/EventEditor confirm).
          void (async () => {
            const master = findMasterEvent(store.events, target)
            if (!master) {
              await alert('일정을 찾을 수 없습니다.')
              return
            }
            if (!isRecurringEvent(master)) {
              await removeEvent(master.id)
              closePanelsAfterEventDelete()
              return
            }
            const occurrenceDate = getOccurrenceDate(target, dayKey) || master.startDate
            const opened = await openRecurrenceDeletePanel({
              eventId: master.id,
              occurrenceDate
            })
            if (!opened) {
              setPendingDelete({ master, occurrenceDate })
              setScopeDialog({ mode: 'delete' })
            }
          })()
        }}
        onToggleCompleted={(target, completed) => {
          if (!canEdit) return
          const master = findMasterEvent(store.events, target)
          if (!master || master.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
          const nextCompleted = Boolean(completed)
          if (!isRecurringEvent(master)) {
            void editEvent(master.id, { completed: nextCompleted })
            return
          }
          const occurrenceDate = getOccurrenceDate(target, dayKey) || master.startDate
          void openRecurrenceCompletePanel({
            eventId: master.id,
            occurrenceDate,
            completed: nextCompleted
          }).then((opened) => {
            if (opened) return
            setPendingComplete({ master, occurrenceDate, completed: nextCompleted })
            setScopeDialog({ mode: 'complete' })
          })
        }}
      />

      <RecurrenceScopeDialog
        open={Boolean(scopeDialog)}
        surface="overlay"
        mode={scopeDialog?.mode === 'delete' ? 'delete' : 'complete'}
        onClose={() => {
          setScopeDialog(null)
          if (scopeDialog?.mode === 'complete') setPendingComplete(null)
          else setPendingDelete(null)
        }}
        onSelect={(scope) => {
          void handleScopeSelect(scope)
        }}
      />
    </div>
  )
}

export default EventDetailPanelHost
