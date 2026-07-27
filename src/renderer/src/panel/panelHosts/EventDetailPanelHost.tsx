import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useAppDialog } from '../../components/AppDialogProvider'
import { EventPopover } from '../../components/EventPopover'
import { RecurrenceScopeDialog } from '../../components/RecurrenceScopeDialog'
import { useCalendarStore } from '../../hooks/useCalendarStore'
import {
  addExdate,
  expandEventsForRange,
  getOccurrenceDate,
  getSeriesId,
  isRecurringEvent,
  truncateSeriesBefore
} from '../../../../shared/mdcExport/eventOccurrences.js'
import { eventToMutationPayload } from '../../lib/eventMutation'
import { HOLIDAYS_KR_CALENDAR_ID } from '../../../../shared/calendarDefaults'
import type { CalendarEvent } from '../../../../shared/calendarTypes'
import type { PanelWindowInit } from '../../../../shared/panelWindows'
import {
  findMasterEvent,
  useApplyRecurringEdit,
  usePanelAuth,
  usePanelRouter,
  usePanelTheme
} from '../usePanelEventHelpers'

type Init = Extract<PanelWindowInit, { kind: 'eventDetail' }>

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toDateKey(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

export function EventDetailPanelHost({ init }: { init: Init }): ReactElement | null {
  const { alert } = useAppDialog()
  const { closePanel, routePanel } = usePanelRouter()
  const { authReady, canEdit } = usePanelAuth()
  const { store, loading, editEvent, removeEvent, addEvent } = useCalendarStore()
  usePanelTheme(store.settings)

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

  const applyRecurringEdit = useApplyRecurringEdit({ addEvent, editEvent, removeEvent })

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
        const nextCompleted = Boolean(completed)
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
        const payload = {
          ...eventToMutationPayload(master),
          startDate: occurrenceDate,
          endDate: occurrenceEndDate,
          completed: nextCompleted
        }
        await applyRecurringEdit(master, payload, occurrenceDate, scope)
        setPendingComplete(null)
        return
      }
      if (dialogMode === 'delete' && pendingDelete?.master) {
        const { master, occurrenceDate } = pendingDelete
        setPendingDelete(null)
        if (scope === 'all') {
          await removeEvent(master.id)
        } else if (scope === 'single') {
          const withExdate = addExdate(master, occurrenceDate)
          await editEvent(master.id, { exdates: withExdate.exdates })
        } else {
          const truncated = truncateSeriesBefore(master, occurrenceDate)
          if ((truncated.repeat ?? 'none') === 'none') {
            await removeEvent(master.id)
          } else {
            await editEvent(master.id, {
              repeatUntil: truncated.repeatUntil,
              repeatCount: null,
              repeat: truncated.repeat
            })
          }
        }
        closePanel()
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
          const master = findMasterEvent(store.events, target)
          if (!master) {
            void alert('일정을 찾을 수 없습니다.')
            return
          }
          if (!isRecurringEvent(master)) {
            void removeEvent(master.id).then(() => closePanel())
            return
          }
          const occurrenceDate = getOccurrenceDate(target, dayKey) || master.startDate
          setPendingDelete({ master, occurrenceDate })
          setScopeDialog({ mode: 'delete' })
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
          setPendingComplete({ master, occurrenceDate, completed: nextCompleted })
          setScopeDialog({ mode: 'complete' })
        }}
      />

      <RecurrenceScopeDialog
        open={Boolean(scopeDialog)}
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
