import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement
} from 'react'
import { useAppDialog } from './AppDialogProvider'
import { DayQuickEditPopover } from './DayQuickEditPopover'
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog'
import { useCalendarStore } from '../hooks/useCalendarStore'
import { parseDateKey as parseDateKeyLocal } from '../lib/calendarUtils'
import {
  addExdate,
  buildFollowingSeriesEvent,
  buildSingleExceptionEvent,
  getOccurrenceDate,
  getSeriesId,
  isRecurringEvent,
  truncateSeriesBefore
} from '../../../shared/mdcExport/eventOccurrences.js'
import { eventToMutationPayload } from '../lib/eventMutation'
import {
  getPrimaryEventLinkUrl,
  normalizeEventLinksArray
} from '../lib/eventLinks'
import { normalizeTagIds } from '../../../shared/mdcExport/eventTags.js'
import {
  getEventSortOrderForDay,
  mergeSortOrderByDay
} from '../../../shared/mdcExport/eventBarFormat.js'
import { HOLIDAYS_KR_CALENDAR_ID, PRIMARY_CALENDAR_ID } from '../../../shared/calendarDefaults'
import type { CalendarEvent, EventLink } from '../../../shared/calendarTypes'
import {
  QUICK_EDIT_YEAR_MIN_BODY,
  type QuickEditWindowInit
} from '../../../shared/quickEditLayout'
import type { DayReorderItem } from '../lib/dayReorder'
import { usePanelTheme } from '../panel/usePanelEventHelpers'

function parseDateKey(dateKey: string): Date | null {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function toDateKey(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function QuickEditWindowApp(): ReactElement | null {
  const { alert } = useAppDialog()
  const {
    store,
    loading,
    refresh,
    addEvent,
    editEvent,
    removeEvent,
    patchStoreSettings,
    visibleEvents
  } = useCalendarStore()

  const [init, setInit] = useState<QuickEditWindowInit | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [scopeDialog, setScopeDialog] = useState<{ mode: 'complete' } | null>(null)
  const [pendingComplete, setPendingComplete] = useState<{
    master: CalendarEvent
    occurrenceDate: string
    completed: boolean
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const payload = await window.neoCalendar.getQuickEditInit?.()
        if (cancelled) return
        if (payload?.dateKey) {
          setInit(payload)
        }
      } catch (error) {
        console.error('[quick-edit-window] init failed', error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const user = await window.neoCalendar.getAuth()
        if (cancelled) return
        setCanEdit(Boolean(user))
        setAuthReady(true)
      } catch {
        if (!cancelled) setAuthReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  usePanelTheme(store.settings)

  const date = useMemo(() => {
    if (!init?.dateKey) return null
    return parseDateKeyLocal(init.dateKey) ?? parseDateKey(init.dateKey)
  }, [init?.dateKey])

  const dayColors = store.settings.dayColors ?? {}
  const eventsHidden = init?.eventsHidden ?? false
  const viewMode = init?.viewMode ?? 'month'
  const anchorRect = init?.anchor
    ? {
        top: init.anchor.top,
        left: init.anchor.left,
        width: init.anchor.width,
        height: init.anchor.height
      }
    : null

  const findMasterEvent = useCallback(
    (eventOrId: CalendarEvent | string | null | undefined): CalendarEvent | null => {
      if (!eventOrId) return null
      const seriesId =
        typeof eventOrId === 'string' ? eventOrId : getSeriesId(eventOrId) || eventOrId.id
      if (!seriesId) return null
      return store.events.find((item) => item.id === seriesId) ?? null
    },
    [store.events]
  )

  const applyRecurringEdit = useCallback(
    async (
      master: CalendarEvent,
      payload: Record<string, unknown>,
      occurrenceDate: string,
      scope: 'single' | 'following' | 'all'
    ): Promise<void> => {
      if (scope === 'all') {
        const startDate = String(payload.startDate ?? master.startDate)
        const endDate = String(payload.endDate ?? payload.startDate ?? master.endDate)
        const durationDays = Math.max(
          1,
          Math.round(
            (new Date(`${endDate}T00:00:00`).getTime() -
              new Date(`${startDate}T00:00:00`).getTime()) /
              86400000
          ) + 1
        )
        const keepSeriesStart = occurrenceDate !== master.startDate
        const nextStart = keepSeriesStart ? master.startDate : startDate
        const seriesEnd = new Date(`${nextStart}T00:00:00`)
        seriesEnd.setDate(seriesEnd.getDate() + durationDays - 1)
        const seriesEndDate = toDateKey(
          seriesEnd.getFullYear(),
          seriesEnd.getMonth(),
          seriesEnd.getDate()
        )
        await editEvent(master.id, {
          ...payload,
          startDate: nextStart,
          endDate: seriesEndDate,
          exdates: Array.isArray(master.exdates) ? master.exdates : []
        } as Partial<CalendarEvent>)
        return
      }

      if (scope === 'single') {
        const exception = buildSingleExceptionEvent(master, payload, occurrenceDate)
        const withExdate = addExdate(master, occurrenceDate)
        await editEvent(master.id, { exdates: withExdate.exdates })
        await addEvent(exception as Parameters<typeof addEvent>[0])
        return
      }

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
      await addEvent(
        buildFollowingSeriesEvent(master, payload, occurrenceDate) as Parameters<
          typeof addEvent
        >[0]
      )
    },
    [addEvent, editEvent, removeEvent]
  )

  const handleQuickEditEventPatch = useCallback(
    async (
      event: CalendarEvent,
      patch: Partial<CalendarEvent>,
      errorMessage: string
    ): Promise<void> => {
      if (!canEdit) return
      const master = findMasterEvent(event)
      if (!master || master.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
      try {
        await editEvent(master.id, patch)
      } catch (error) {
        await alert(error instanceof Error ? error.message : errorMessage)
      }
    },
    [alert, canEdit, editEvent, findMasterEvent]
  )

  const handleQuickEditToggleCompleted = useCallback(
    async (event: CalendarEvent, completed: boolean): Promise<void> => {
      if (!canEdit || !init?.dateKey) return
      const master = findMasterEvent(event)
      if (!master || master.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
      const nextCompleted = Boolean(completed)
      try {
        if (!isRecurringEvent(master)) {
          await editEvent(master.id, { completed: nextCompleted })
          return
        }
        const occurrenceDate =
          getOccurrenceDate(event, init.dateKey) ?? master.startDate
        setPendingComplete({
          master,
          occurrenceDate,
          completed: nextCompleted
        })
        setScopeDialog({ mode: 'complete' })
      } catch (error) {
        await alert(
          error instanceof Error ? error.message : '완료 상태를 변경하지 못했습니다.'
        )
      }
    },
    [alert, canEdit, editEvent, findMasterEvent, init?.dateKey]
  )

  const handleReorderEvents = useCallback(
    async (ordered: DayReorderItem[], dayKey: string): Promise<void> => {
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
    },
    [alert, canEdit, editEvent, store.events]
  )

  const handleScopeSelect = async (scope: 'single' | 'following' | 'all'): Promise<void> => {
    setScopeDialog(null)
    try {
      if (pendingComplete?.master) {
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
      }
    } catch (error) {
      await alert(error instanceof Error ? error.message : '반복 일정 처리에 실패했습니다.')
    }
  }

  const routeFromQuickEdit = useCallback(
    (
      kind: 'editor' | 'detail',
      event?: CalendarEvent | null,
      pointer?: { x: number; y: number; screenX?: number; screenY?: number }
    ): void => {
      if (!init?.dateKey) return
      const returnQuickEdit = { dateKey: init.dateKey, anchor: init.anchor ?? null }
      if (kind === 'detail') {
        if (!event?.id) return
        void window.neoCalendar.routePanelWindow?.({
          kind: 'eventDetail',
          eventId: event.id,
          dayKey: init.dateKey,
          pointerScreen:
            pointer?.screenX != null && pointer?.screenY != null
              ? { x: pointer.screenX, y: pointer.screenY }
              : null
        })
        return
      }
      if (event?.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
      void window.neoCalendar.routePanelWindow?.({
        kind: 'eventEditor',
        eventId: event?.id ?? null,
        defaultDate: init.dateKey,
        occurrenceDate: init.dateKey,
        returnQuickEdit
      })
    },
    [init?.anchor, init?.dateKey]
  )

  const handleClose = useCallback((): void => {
    if (scopeDialog) return
    window.neoCalendar.closeQuickEditWindow?.()
  }, [scopeDialog])

  if (!init || !date || loading || !authReady) {
    return null
  }

  return (
    <div className="neo-quick-edit-shell h-screen w-screen overflow-hidden">
      <DayQuickEditPopover
        surface="floating"
        dateKey={init.dateKey}
        date={date}
        events={eventsHidden ? [] : visibleEvents}
        calendars={store.calendars}
        tags={store.tags}
        dayColor={dayColors[init.dateKey] ?? null}
        anchorRect={anchorRect}
        canEdit={canEdit}
        expandBody={viewMode === 'month'}
        minBodyHeight={viewMode === 'year' ? QUICK_EDIT_YEAR_MIN_BODY : undefined}
        onReorderEvents={handleReorderEvents}
        onClose={handleClose}
        onCreate={(title, calendarId, tagIds, links) =>
          void addEvent({
            title,
            calendarId: calendarId || PRIMARY_CALENDAR_ID,
            startDate: init.dateKey,
            endDate: init.dateKey,
            allDay: true,
            tagIds,
            links
          })
        }
        onToggleCompleted={(event, completed) => {
          void handleQuickEditToggleCompleted(event, completed)
        }}
        onDayColorChange={(color) => {
          const next = { ...dayColors }
          if (!color) delete next[init.dateKey]
          else next[init.dateKey] = color
          void patchStoreSettings({ dayColors: next })
        }}
        onEventCalendarChange={(event, calendarId) => {
          void handleQuickEditEventPatch(event, { calendarId }, '캘린더를 변경하지 못했습니다.')
        }}
        onEventTagChange={(event, tagIds) => {
          void handleQuickEditEventPatch(
            event,
            { tagIds: normalizeTagIds(tagIds) },
            '태그를 변경하지 못했습니다.'
          )
        }}
        onEventMarkerShapeChange={(event, markerShape) => {
          void handleQuickEditEventPatch(event, { markerShape }, '표시 도형을 변경하지 못했습니다.')
        }}
        onEventLinkChange={(event, links: EventLink[]) => {
          const normalized = normalizeEventLinksArray(links)
          void handleQuickEditEventPatch(
            event,
            {
              links: normalized,
              link: getPrimaryEventLinkUrl({ links: normalized })
            },
            '바로가기를 변경하지 못했습니다.'
          )
        }}
        onOpenMore={(event) => routeFromQuickEdit('editor', event)}
        onOpenEvent={(event, pointer) => routeFromQuickEdit('detail', event, pointer)}
        onEditEvent={(event) => routeFromQuickEdit('editor', event)}
        onAttachFiles={async (event) => {
          if (!canEdit) {
            await alert('관리자 로그인 후 파일을 첨부할 수 있습니다.')
            return
          }
          const master =
            store.events.find((item) => item.id === (getSeriesId(event) || event.id)) ?? event
          if (!master?.id || master.calendarId === HOLIDAYS_KR_CALENDAR_ID) {
            await alert('저장된 일정에만 파일을 첨부할 수 있습니다.')
            return
          }
          try {
            await window.neoCalendar.addEventAttachments(master.id)
            await refresh()
          } catch (error) {
            await alert(error instanceof Error ? error.message : '파일을 첨부하지 못했습니다.')
          }
        }}
      />

      <RecurrenceScopeDialog
        open={Boolean(scopeDialog)}
        mode="complete"
        onClose={() => {
          setScopeDialog(null)
          setPendingComplete(null)
        }}
        onSelect={(scope) => {
          void handleScopeSelect(scope)
        }}
      />
    </div>
  )
}

export default QuickEditWindowApp
