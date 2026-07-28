import { useCallback, useEffect, useState } from 'react'
import {
  addExdate,
  buildFollowingSeriesEvent,
  buildSingleExceptionEvent,
  getSeriesId,
  truncateSeriesBefore
} from '../../../shared/mdcExport/eventOccurrences.js'
import type { CalendarEvent, EventInput } from '../../../shared/calendarTypes'
import type { AuthUser } from '../../../shared/ipc'
import type { PanelWindowInit } from '../../../shared/panelWindows'
import {
  applyThemeFromStoreSettings,
  getColorScheme
} from '../lib/colorScheme'
import type { StoreSettings } from '../../../shared/calendarTypes'

export function findMasterEvent(
  events: CalendarEvent[],
  eventOrId: CalendarEvent | string | null | undefined
): CalendarEvent | null {
  if (!eventOrId) return null
  const seriesId =
    typeof eventOrId === 'string' ? eventOrId : getSeriesId(eventOrId) || eventOrId.id
  if (!seriesId) return null
  return events.find((item) => item.id === seriesId) ?? null
}

export function mergeOccurrenceForEditor(
  master: CalendarEvent,
  occurrence: CalendarEvent
): CalendarEvent {
  return {
    ...master,
    startDate: occurrence.startDate ?? master.startDate,
    endDate: occurrence.endDate ?? master.endDate,
    startTime: occurrence.startTime ?? master.startTime,
    endTime: occurrence.endTime ?? master.endTime,
    allDay: occurrence.allDay ?? master.allDay
  }
}

export function useApplyRecurringEdit(options: {
  addEvent: (input: EventInput) => Promise<CalendarEvent>
  editEvent: (id: string, patch: Partial<CalendarEvent>) => Promise<CalendarEvent>
  removeEvent: (id: string) => Promise<void>
}): (
  master: CalendarEvent,
  payload: Record<string, unknown>,
  occurrenceDate: string,
  scope: 'single' | 'following' | 'all'
) => Promise<void> {
  const { addEvent, editEvent, removeEvent } = options

  return useCallback(
    async (master, payload, occurrenceDate, scope) => {
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
        await addEvent(exception as EventInput)
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
      await addEvent(buildFollowingSeriesEvent(master, payload, occurrenceDate) as EventInput)
    },
    [addEvent, editEvent, removeEvent]
  )
}

function toDateKey(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

export function usePanelRouter(): {
  closePanel: () => void
  routePanel: (init: PanelWindowInit) => void
} {
  const closePanel = useCallback((): void => {
    window.neoCalendar.closePanelWindow?.()
    window.neoCalendar.closeQuickEditWindow?.()
  }, [])

  const routePanel = useCallback((init: PanelWindowInit): void => {
    void window.neoCalendar.routePanelWindow?.(init)
  }, [])

  return { closePanel, routePanel }
}

export function usePanelAuth(): {
  authReady: boolean
  canEdit: boolean
  user: AuthUser | null
} {
  const [authReady, setAuthReady] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const nextUser = await window.neoCalendar.getAuth()
        if (cancelled) return
        setUser(nextUser)
        setCanEdit(Boolean(nextUser))
        setAuthReady(true)
      } catch {
        if (!cancelled) setAuthReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { authReady, canEdit, user }
}

export function usePanelTheme(
  settings: Pick<StoreSettings, 'viewOptions'>,
  loading = false
): void {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const appSettings = await window.neoCalendar.getSettings()
        if (cancelled) return
        document.documentElement.style.setProperty(
          '--neo-header-opacity',
          String(appSettings.headerOpacity)
        )
        document.documentElement.style.setProperty(
          '--neo-shell-opacity',
          String(appSettings.shellOpacity)
        )
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const api = window.neoCalendar
    if (!api?.getCalendarStore) return undefined
    let cancelled = false
    void api.getCalendarStore().then((snap) => {
      if (cancelled) return
      applyThemeFromStoreSettings(snap.settings)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (loading) return
    applyThemeFromStoreSettings(settings)
  }, [loading, settings.viewOptions?.colorScheme, settings.viewOptions?.accentColor])

  useEffect(() => {
    if (loading) return
    if (getColorScheme(settings.viewOptions) !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      applyThemeFromStoreSettings(settings)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [loading, settings, settings.viewOptions?.colorScheme])

  useEffect(() => {
    const api = window.neoCalendar
    if (!api?.onStoreChanged) return
    return api.onStoreChanged(() => {
      void api.getCalendarStore().then((snap) => {
        applyThemeFromStoreSettings(snap.settings)
      })
    })
  }, [])
}
