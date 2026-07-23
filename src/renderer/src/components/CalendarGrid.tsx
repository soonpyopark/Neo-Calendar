import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactElement
} from 'react'
import { InteractionUI } from './InteractionUI'
import { AppChrome } from './AppChrome'
import { DayNumber } from './DayNumber'
import { DayQuickEditPopover, type AnchorRect } from './DayQuickEditPopover'
import { getEventBarStyle } from '../lib/colors'
import { getDayParts, getLunarMonthLabel } from '../lib/lunar'
import { DayEventsPopover } from './DayEventsPopover'
import { EventEditor } from './EventEditor'
import { EventMoreButton } from './EventMoreButton'
import { EventPopover } from './EventPopover'
import { LoginDialog } from './LoginDialog'
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog'
import { SearchPanel } from './SearchPanel'
import { SettingsPanel } from './SettingsPanel'
import {
  resolveDayVisibleEventLimit,
  useEventLayoutCssVars,
  useMaxVisibleEvents
} from '../hooks/useMaxVisibleEvents'
import {
  addExdate,
  buildFollowingSeriesEvent,
  buildSingleExceptionEvent,
  getOccurrenceDate,
  isRecurringEvent,
  truncateSeriesBefore
} from '../../../shared/mdcExport/eventOccurrences.js'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DoubleChevronLeftIcon,
  DoubleChevronRightIcon,
  HideCompletedCheckIcon,
  HideEventsEyeIcon,
  MonthViewIcon,
  WebBrowserIcon,
  WeekViewIcon,
  YearViewIcon
} from './CalendarHeaderIcons'
import { useCalendarStore } from '../hooks/useCalendarStore'
import {
  desktopModeIconBtnClass,
  footerShellClass,
  headerShellClass,
  navBtnClass,
  softBlueIconBtnActiveClass,
  softBlueIconBtnClass,
  todayBtnClass,
  viewModeIconBtnActiveClass,
  viewModeIconBtnClass,
  yearNavBtnClass
} from '../lib/headerButtonClasses'
import { HOLIDAYS_KR_CALENDAR_ID, PRIMARY_CALENDAR_ID } from '../../../shared/calendarDefaults'
import type { CalendarEvent } from '../../../shared/calendarTypes'
import type { AppSettings, AuthUser, LaunchMode } from '../../../shared/ipc'
import { SITE_URL } from '../../../shared/constants'

export type { CalendarEvent }
export type ViewMode = 'year' | 'week' | 'month'

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const
const EVENT_PALETTE = ['#039be5', '#33b679', '#8e24aa', '#e67c73', '#f6bf26', '#0b8043'] as const

const VIEW_MODE_OPTIONS: Array<{ value: ViewMode; label: string; Icon: () => ReactElement }> = [
  { value: 'year', label: '연', Icon: YearViewIcon },
  { value: 'week', label: '주', Icon: WeekViewIcon },
  { value: 'month', label: '월', Icon: MonthViewIcon }
]

function toDateKey(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function parseDateKey(dateKey: string): Date | null {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function eachDateKey(start: string, end: string): string[] {
  const from = parseDateKey(start)
  const to = parseDateKey(end || start)
  if (!from || !to) return start ? [start] : []
  const keys: string[] = []
  const cur = new Date(from)
  const last = to < from ? from : to
  while (cur <= last) {
    keys.push(toDateKey(cur.getFullYear(), cur.getMonth(), cur.getDate()))
    cur.setDate(cur.getDate() + 1)
    if (keys.length > 366) break
  }
  return keys
}

function startOfWeek(date: Date, weekStartsOn: 0 | 1 = 0): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  const diff = weekStartsOn === 1 ? (day === 0 ? -6 : 1 - day) : -day
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(date: Date, delta: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + delta)
  return d
}

function formatWeekTitle(anchor: Date, weekStartsOn: 0 | 1 = 0): string {
  const start = startOfWeek(anchor, weekStartsOn)
  const end = addDays(start, 6)
  const sameMonth = start.getMonth() === end.getMonth()
  if (sameMonth) {
    return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}–${end.getDate()}일`
  }
  return `${start.getFullYear()}년 ${start.getMonth() + 1}/${start.getDate()} – ${end.getMonth() + 1}/${end.getDate()}`
}

/** ISO week number (Mon-based), matching MDC. */
function getWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

type DayCell = {
  day: number
  dateKey: string
  inMonth: boolean
  isToday: boolean
  weekday: number
  date: Date
}

function buildMonthWeeks(year: number, month: number, weekStartsOn: 0 | 1 = 0): DayCell[][] {
  const first = new Date(year, month, 1)
  const start = startOfWeek(first, weekStartsOn)
  const today = new Date()
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate())

  const weeks: DayCell[][] = []
  const cursor = new Date(start)
  for (let w = 0; w < 6; w += 1) {
    const week: DayCell[] = []
    for (let d = 0; d < 7; d += 1) {
      const y = cursor.getFullYear()
      const m = cursor.getMonth()
      const day = cursor.getDate()
      const dateKey = toDateKey(y, m, day)
      week.push({
        day,
        dateKey,
        inMonth: m === month,
        isToday: dateKey === todayKey,
        weekday: cursor.getDay(),
        date: new Date(y, m, day)
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

function buildWeekDays(anchor: Date, weekStartsOn: 0 | 1 = 0): DayCell[] {
  const start = startOfWeek(anchor, weekStartsOn)
  const today = new Date()
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate())
  const days: DayCell[] = []
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(start, i)
    const dateKey = toDateKey(d.getFullYear(), d.getMonth(), d.getDate())
    days.push({
      day: d.getDate(),
      dateKey,
      inMonth: true,
      isToday: dateKey === todayKey,
      weekday: d.getDay(),
      date: d
    })
  }
  return days
}

function eventStyle(color: string, completed = false, lane = 0): CSSProperties {
  return getEventBarStyle(color, { completed, lane }) as CSSProperties
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export type CalendarGridProps = {
  mode: LaunchMode
  switchReady?: boolean
  user: AuthUser | null
  settings: AppSettings | null
  onUserChange: (user: AuthUser | null) => void
  onModeChange: (mode: LaunchMode) => void
  onSettingsSaved: (patch: Partial<AppSettings>) => void | Promise<void>
}

/**
 * MDC-styled calendar on Neo click-through core.
 */
export function CalendarGrid({
  mode,
  switchReady = true,
  user,
  settings,
  onUserChange,
  onModeChange,
  onSettingsSaved
}: CalendarGridProps): ReactElement {
  const now = new Date()
  const canEdit = Boolean(user)
  const {
    store,
    visibleEvents,
    calendarsById,
    addEvent,
    editEvent,
    removeEvent,
    patchStoreSettings,
    createCalendar,
    patchCalendar,
    deleteCalendar,
    setTags,
    replaceStore,
    listMembers,
    saveMembers,
    syncHolidays,
    refresh
  } = useCalendarStore()

  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [viewDate, setViewDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [modeBusy, setModeBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  /** Bumps when light/dark flips so MDC event-bar themes recompute. */
  const [themeEpoch, setThemeEpoch] = useState(0)
  const [quickEdit, setQuickEdit] = useState<{
    dateKey: string
    date: Date
    anchorRect: AnchorRect | null
  } | null>(null)
  const [eventPopover, setEventPopover] = useState<{
    event: CalendarEvent
    anchorRect: AnchorRect | null
  } | null>(null)
  const [dayList, setDayList] = useState<{
    dateKey: string
    anchorRect: AnchorRect | null
  } | null>(null)
  const [editor, setEditor] = useState<{
    event: CalendarEvent | null
    defaultDate?: string
    occurrenceDate?: string | null
    returnQuickEdit?: { dateKey: string; date: Date; anchorRect: AnchorRect | null } | null
  } | null>(null)
  const [scopeDialog, setScopeDialog] = useState<{ mode: 'edit' | 'delete' } | null>(null)
  const [pendingEdit, setPendingEdit] = useState<{
    master: CalendarEvent
    occurrenceDate: string
    needsScope: boolean
    payload?: Record<string, unknown>
  } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    master: CalendarEvent
    occurrenceDate: string
  } | null>(null)

  const chromeRef = useRef<HTMLDivElement | null>(null)
  const periodHeaderRef = useRef<HTMLDivElement | null>(null)
  const monthBodyRef = useRef<HTMLDivElement | null>(null)

  const eventsHidden = store.settings.viewOptions.eventsHidden
  const completedHidden = store.settings.viewOptions.completedHidden
  const showWeekNumbers = store.settings.viewOptions.showWeekNumbers !== false
  const roundedCorners = Boolean(store.settings.viewOptions.roundedCorners)
  const dayColors = store.settings.dayColors ?? {}
  const weekStartsOn: 0 | 1 =
    settings?.weekStartsOn ?? (store.settings.viewOptions.weekStartsOnSunday === false ? 1 : 0)

  const publishWakeZones = (): void => {
    const api = window.neoCalendar
    if (!api?.setWakeHitZones) return
    if (mode !== 'desktop') {
      api.setWakeHitZones([])
      return
    }

    const roots = [chromeRef.current, periodHeaderRef.current].filter(
      (el): el is HTMLElement => Boolean(el)
    )
    const pad = 2
    const zones = roots
      .flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>('button')))
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        x: rect.left - pad,
        y: rect.top - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2
      }))

    api.setWakeHitZones(zones)
    if (roots.length > 0) {
      const stripBottom = Math.max(
        ...roots.map((el) => {
          const r = el.getBoundingClientRect()
          return r.top + r.height
        })
      )
      api.setHeaderHitZone?.({
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: Math.max(0, stripBottom)
      })
    }
  }

  const publishDayCellZones = (): void => {
    const api = window.neoCalendar
    if (!api?.setDayCellHitZones) return
    if (mode !== 'desktop') {
      api.setDayCellHitZones([])
      return
    }

    const zones = Array.from(
      document.querySelectorAll<HTMLElement>('.neo-cal-shell .day-cell[data-date-key]')
    )
      .map((el) => {
        const rect = el.getBoundingClientRect()
        const dateKey = el.dataset.dateKey ?? ''
        return {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          dateKey
        }
      })
      .filter((z) => z.dateKey && z.width > 0 && z.height > 0)

    api.setDayCellHitZones(zones)
  }

  const publishDesktopHitZones = (): void => {
    publishWakeZones()
    publishDayCellZones()
  }

  useLayoutEffect(() => {
    publishDesktopHitZones()
  })

  useEffect(() => {
    const onResize = (): void => publishDesktopHitZones()
    window.addEventListener('resize', onResize)
    const id = window.setInterval(publishDesktopHitZones, 400)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearInterval(id)
      window.neoCalendar?.setWakeHitZones?.([])
      window.neoCalendar?.setDayCellHitZones?.([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publish uses latest mode/refs
  }, [mode, viewMode])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const weekdayLabels = useMemo(() => {
    if (weekStartsOn === 1) {
      return [...WEEKDAYS_KO.slice(1), WEEKDAYS_KO[0]]
    }
    return [...WEEKDAYS_KO]
  }, [weekStartsOn])

  const monthWeeks = useMemo(
    () => buildMonthWeeks(year, month, weekStartsOn),
    [year, month, weekStartsOn]
  )
  const weekDays = useMemo(() => buildWeekDays(viewDate, weekStartsOn), [viewDate, weekStartsOn])

  /** MDC: row height ÷ weeks → how many bars fit before "더보기". */
  const weeksInViewport = viewMode === 'week' ? 1 : viewMode === 'month' ? monthWeeks.length : 0
  const eventCapacity = useMaxVisibleEvents(monthBodyRef, weeksInViewport)
  const eventLayoutCssVars = useEventLayoutCssVars()

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of visibleEvents) {
      const keys = eachDateKey(event.startDate, event.endDate || event.startDate)
      for (const key of keys) {
        const list = map.get(key) ?? []
        list.push(event)
        map.set(key, list)
      }
    }
    return map
  }, [visibleEvents])

  /** Dates with 대한민국의 휴일 events — day numeral uses Sunday red. */
  const holidayKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const event of visibleEvents) {
      if (event.calendarId !== HOLIDAYS_KR_CALENDAR_ID) continue
      for (const key of eachDateKey(event.startDate, event.endDate || event.startDate)) {
        keys.add(key)
      }
    }
    return keys
  }, [visibleEvents])

  const periodTitle =
    viewMode === 'year'
      ? `${year}년`
      : viewMode === 'week'
        ? formatWeekTitle(viewDate, weekStartsOn)
        : `${year}년 ${month + 1}월`

  const closeOverlays = useCallback((): void => {
    setQuickEdit(null)
    setEventPopover(null)
    setDayList(null)
    setEditor(null)
    setScopeDialog(null)
    setPendingEdit(null)
    setPendingDelete(null)
    setSearchOpen(false)
    setSettingsOpen(false)
    setLoginOpen(false)
    setLoginError(null)
  }, [])

  const dismissEditorAfterSave = useCallback((): void => {
    const back = editor?.returnQuickEdit ?? null
    setEditor(null)
    setPendingEdit(null)
    if (back) setQuickEdit(back)
  }, [editor?.returnQuickEdit])

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

  const shiftMonth = (delta: number): void => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
    setQuickEdit(null)
  }

  const shiftYear = (delta: number): void => {
    setViewDate((prev) => new Date(prev.getFullYear() + delta, prev.getMonth(), 1))
    setQuickEdit(null)
  }

  const shiftWeek = (delta: number): void => {
    setViewDate((prev) => addDays(prev, delta * 7))
    setQuickEdit(null)
  }

  const onPrev = (): void => {
    if (viewMode === 'year') shiftYear(-1)
    else if (viewMode === 'week') shiftWeek(-1)
    else shiftMonth(-1)
  }

  const onNext = (): void => {
    if (viewMode === 'year') shiftYear(1)
    else if (viewMode === 'week') shiftWeek(1)
    else shiftMonth(1)
  }

  const goToday = (): void => {
    const d = new Date()
    setViewDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
    setSelectedKey(toDateKey(d.getFullYear(), d.getMonth(), d.getDate()))
    setQuickEdit(null)
  }

  const rectFromTarget = (target: EventTarget | null): AnchorRect | null => {
    const el = target instanceof Element ? target.closest('.day-cell') : null
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    }
  }

  const openQuickEdit = (cell: DayCell, event?: MouseEvent): void => {
    setEventPopover(null)
    setDayList(null)
    setSelectedKey(cell.dateKey)
    setQuickEdit({
      dateKey: cell.dateKey,
      date: cell.date,
      anchorRect: event ? rectFromTarget(event.currentTarget) : null
    })
  }

  const openQuickEditByDateKey = (dateKey: string): void => {
    const date = parseDateKey(dateKey)
    if (!date) return
    const el = document.querySelector<HTMLElement>(
      `.neo-cal-shell .day-cell[data-date-key="${dateKey}"]`
    )
    const rect = el?.getBoundingClientRect()
    setEventPopover(null)
    setDayList(null)
    setSelectedKey(dateKey)
    setQuickEdit({
      dateKey,
      date,
      anchorRect: rect
        ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        : null
    })
  }

  useEffect(() => {
    const api = window.neoCalendar
    if (!api?.onOpenDayQuickEdit) return
    return api.onOpenDayQuickEdit(({ dateKey }) => {
      openQuickEditByDateKey(dateKey)
    })
  }, [])

  useEffect(() => {
    const onTheme = (): void => setThemeEpoch((n) => n + 1)
    window.addEventListener('neocalendar:colorSchemeEffective', onTheme)
    return () => window.removeEventListener('neocalendar:colorSchemeEffective', onTheme)
  }, [])

  const interactionBusy = Boolean(
    quickEdit ||
      searchOpen ||
      settingsOpen ||
      loginOpen ||
      eventPopover ||
      dayList ||
      editor ||
      scopeDialog
  )
  const interactionBusyRef = useRef(interactionBusy)
  interactionBusyRef.current = interactionBusy

  useEffect(() => {
    window.neoCalendar?.setInteractionBusy?.(interactionBusy)
    return () => {
      window.neoCalendar?.setInteractionBusy?.(false)
    }
  }, [interactionBusy])

  useEffect(() => {
    const api = window.neoCalendar
    if (!api?.onModeChanged) return
    return api.onModeChanged((status) => {
      onModeChange(status.mode)
      // Don't kill open text UIs (settings/login/editor) while the user is typing.
      if (status.mode === 'desktop' && status.embedded && !interactionBusyRef.current) {
        closeOverlays()
      }
    })
  }, [onModeChange, closeOverlays])

  const eventColor = (item: CalendarEvent): string =>
    item.color || calendarsById.get(item.calendarId)?.color || EVENT_PALETTE[0]

  const toggleCompleted = async (id: string, completed?: boolean): Promise<void> => {
    if (!canEdit) return
    const current = store.events.find((e) => e.id === id)
    if (!current) return
    await editEvent(id, {
      completed: typeof completed === 'boolean' ? completed : !current.completed
    })
  }

  const openSite = (): void => {
    window.open(SITE_URL, '_blank', 'noopener,noreferrer')
  }

  const enterDesktop = async (): Promise<void> => {
    setModeBusy(true)
    try {
      const status = await window.neoCalendar.enterDesktop()
      onModeChange(status.mode)
    } finally {
      setModeBusy(false)
    }
  }

  const enterWindow = async (): Promise<void> => {
    setModeBusy(true)
    try {
      const status = await window.neoCalendar.enterWindow()
      onModeChange(status.mode)
    } finally {
      setModeBusy(false)
    }
  }

  const handleAuthToggle = (): void => {
    if (user) {
      void window.neoCalendar.logout().then(() => {
        onUserChange(null)
        setSettingsOpen(false)
      })
      return
    }
    setLoginError(null)
    setLoginOpen(true)
  }

  const handleLogin = async (loginId: string, password: string, remember: boolean): Promise<void> => {
    setLoginBusy(true)
    setLoginError(null)
    try {
      const result = await window.neoCalendar.login(loginId, password, remember)
      if (!result.ok) {
        setLoginError(result.error)
        return
      }
      onUserChange(result.user)
      setLoginOpen(false)
    } finally {
      setLoginBusy(false)
    }
  }

  const jumpToEvent = (event: CalendarEvent): void => {
    const day = event.occurrenceDate || event.startDate
    const date = parseDateKey(day)
    if (!date) return
    setViewDate(date)
    setSelectedKey(day)
    setViewMode('month')
  }

  const openEventDetail = (event: CalendarEvent, anchorRect: AnchorRect | null): void => {
    setQuickEdit(null)
    setDayList(null)
    setEventPopover({ event, anchorRect })
  }

  const openEventEditor = (
    event: CalendarEvent | null,
    opts?: {
      defaultDate?: string
      returnQuickEdit?: { dateKey: string; date: Date; anchorRect: AnchorRect | null } | null
    }
  ): void => {
    if (!canEdit && event === null) return
    setEventPopover(null)
    setDayList(null)
    setScopeDialog(null)
    setPendingDelete(null)
    if (!opts?.returnQuickEdit) setQuickEdit(null)
    else setQuickEdit(null)

    if (event) {
      const master = store.events.find((item) => item.id === event.id) ?? event
      const occurrenceDate =
        getOccurrenceDate(event, opts?.defaultDate ?? selectedKey ?? event.occurrenceDate) ??
        master.startDate
      setPendingEdit({
        master,
        occurrenceDate,
        needsScope: isRecurringEvent(master)
      })
      setEditor({
        event: master,
        defaultDate: opts?.defaultDate,
        occurrenceDate,
        returnQuickEdit: opts?.returnQuickEdit ?? null
      })
      return
    }

    setPendingEdit(null)
    setEditor({
      event: null,
      defaultDate: opts?.defaultDate,
      occurrenceDate: opts?.defaultDate ?? null,
      returnQuickEdit: opts?.returnQuickEdit ?? null
    })
  }

  const handleScopeSelect = async (scope: 'single' | 'following' | 'all'): Promise<void> => {
    const dialogMode = scopeDialog?.mode
    setScopeDialog(null)
    try {
      if (dialogMode === 'edit' && pendingEdit?.payload && pendingEdit.master) {
        const { master, payload, occurrenceDate } = pendingEdit
        dismissEditorAfterSave()
        await applyRecurringEdit(master, payload, occurrenceDate, scope)
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
        setEditor(null)
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '반복 일정 처리에 실패했습니다.')
    }
  }

  const setViewFlag = (patch: { eventsHidden?: boolean; completedHidden?: boolean }): void => {
    void patchStoreSettings({
      viewOptions: {
        ...store.settings.viewOptions,
        ...patch
      }
    })
  }

  const handleExport = async (format: 'excel' | 'pdf'): Promise<void> => {
    if (!canEdit || exporting) return
    const exportYear = viewDate.getFullYear()
    const exportMonth = viewDate.getMonth() + 1
    const formatLabel = format === 'excel' ? 'Excel' : 'PDF'
    if (
      !window.confirm(
        `${exportYear}년 ${exportMonth}월 일정을 ${formatLabel} 파일로 저장하시겠습니까?`
      )
    ) {
      return
    }
    setExporting(true)
    try {
      const result = await window.neoCalendar.exportCalendar({
        format,
        year: exportYear,
        month: exportMonth,
        asAdmin: true
      })
      if (result.canceled) return
      if (!result.ok) {
        window.alert(result.error || `${formatLabel} 내보내기에 실패했습니다.`)
        return
      }
      window.alert(`${exportYear}년 ${exportMonth}월 일정을 ${formatLabel} 파일로 저장했습니다.`)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : `${formatLabel} 내보내기에 실패했습니다.`)
    } finally {
      setExporting(false)
    }
  }

  const lunarMonthLabel = useMemo(
    () => (viewMode === 'month' ? getLunarMonthLabel(year, month + 1) : null),
    [viewMode, year, month]
  )

  const renderDayCell = (cell: DayCell, options?: { tall?: boolean }): ReactElement => {
    const dayEvents = eventsHidden ? [] : (eventsByDate.get(cell.dateKey) ?? [])
    const daySegments = dayEvents.map((event, lane) => ({ event, lane }))
    const { visibleCount, hiddenEventCount } = resolveDayVisibleEventLimit(
      daySegments,
      eventCapacity
    )
    const visible = dayEvents.slice(0, visibleCount)
    const weekdayClass = cell.weekday === 0 ? 'sunday' : cell.weekday === 6 ? 'saturday' : ''
    const isKrHoliday = holidayKeys.has(cell.dateKey)
    const dayColor = dayColors[cell.dateKey]
    const cellStyle = dayColor
      ? ({ '--day-cell-bg': dayColor } as CSSProperties)
      : undefined
    const { solar, lunar, lunarDay, solarTerm } = getDayParts(
      cell.date.getFullYear(),
      cell.date.getMonth() + 1,
      cell.day
    )

    return (
      <div
        key={cell.dateKey}
        data-date-key={cell.dateKey}
        className={cn(
          'day-cell',
          'interaction-ui',
          weekdayClass,
          isKrHoliday && 'holiday',
          !cell.inMonth && 'other-month',
          cell.isToday && 'today',
          selectedKey === cell.dateKey && 'selected',
          dayColor && 'has-day-color',
          options?.tall && 'day-cell--tall'
        )}
        style={cellStyle}
        onDoubleClick={(event) => {
          if ((event.target as Element | null)?.closest?.('.event-bar, .event-more')) return
          event.preventDefault()
          event.stopPropagation()
          openQuickEdit(cell, event)
        }}
      >
        <DayNumber
          solar={solar}
          lunarLabel={lunar}
          lunarDay={lunarDay}
          solarTerm={solarTerm}
        />

        <div className={cn('day-events', eventsHidden && 'is-hidden')}>
          {visible.map((item, lane) => (
            <InteractionUI
              key={`${item.id}-${themeEpoch}`}
              as="button"
              className={cn('event-bar event-bar--single', item.completed && 'is-completed')}
              style={eventStyle(eventColor(item), Boolean(item.completed), lane)}
              onClick={(e) => {
                e.stopPropagation()
                setSelectedKey(cell.dateKey)
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                openEventDetail(item, {
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height
                })
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                if (!canEdit) return
                openEventEditor(item)
              }}
              aria-label={item.title}
              title={canEdit ? '클릭: 상세 · 더블클릭: 편집' : '클릭: 상세'}
            >
              <span className="event-bar-accent" aria-hidden />
              <span className={cn('event-title', item.completed && 'is-completed')}>{item.title}</span>
              {canEdit ? (
                <span
                  role="button"
                  tabIndex={0}
                  className="event-bar-remove"
                  aria-label={`${item.title} 삭제`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void removeEvent(item.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      void removeEvent(item.id)
                    }
                  }}
                >
                  ×
                </span>
              ) : null}
            </InteractionUI>
          ))}
          {hiddenEventCount > 0 ? (
            <EventMoreButton
              count={hiddenEventCount}
              lane={visible.length}
              onClick={(e) => {
                e.stopPropagation()
                const rect = (e.currentTarget as HTMLElement)
                  .closest('.day-cell')
                  ?.getBoundingClientRect()
                setQuickEdit(null)
                setEventPopover(null)
                setDayList({
                  dateKey: cell.dateKey,
                  anchorRect: rect
                    ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
                    : null
                })
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                openQuickEdit(cell, e)
              }}
            />
          ) : null}
        </div>
      </div>
    )
  }

  const renderYearView = (): ReactElement => (
    <div className="year-view flex-1">
      {Array.from({ length: 12 }, (_, monthIndex) => {
        const weeks = buildMonthWeeks(year, monthIndex, weekStartsOn)
        return (
          <InteractionUI
            key={monthIndex}
            as="button"
            className={cn('year-month', monthIndex === month && 'is-current')}
            onClick={() => {
              setViewDate(new Date(year, monthIndex, 1))
              setViewMode('month')
            }}
            aria-label={`${year}년 ${monthIndex + 1}월`}
          >
            <div className="year-month-title">{monthIndex + 1}월</div>
            <div className="year-month-weekdays">
              {weekdayLabels.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="year-month-grid">
              {weeks.flat().map((cell) => (
                <span
                  key={cell.dateKey}
                  className={cn(
                    'year-day',
                    !cell.inMonth && 'other-month',
                    cell.isToday && 'today',
                    cell.weekday === 0 && cell.inMonth && 'sunday',
                    cell.weekday === 6 && cell.inMonth && 'saturday',
                    holidayKeys.has(cell.dateKey) && cell.inMonth && 'holiday'
                  )}
                >
                  {cell.inMonth ? cell.day : ''}
                </span>
              ))}
            </div>
          </InteractionUI>
        )
      })}
    </div>
  )

  const dayListEvents = dayList ? (eventsByDate.get(dayList.dateKey) ?? []) : []

  return (
    <div
      className={cn('neo-cal-shell flex h-full flex-col', roundedCorners && 'is-rounded-corners')}
    >
      <header
        className={cn(headerShellClass, 'interaction-ui', mode === 'window' && 'is-window-mode')}
        data-shell-chrome="header"
      >
        <AppChrome
          mode={mode}
          user={user}
          searchOpen={searchOpen}
          settingsOpen={settingsOpen}
          exporting={exporting}
          modeBusy={modeBusy}
          switchReady={switchReady}
          chromeRef={chromeRef}
          onOpenSearch={() => {
            setSettingsOpen(false)
            setSearchOpen(true)
          }}
          onOpenSettings={() => {
            setSearchOpen(false)
            setSettingsOpen(true)
          }}
          onExportExcel={() => void handleExport('excel')}
          onExportPdf={() => void handleExport('pdf')}
          onEnterDesktop={() => void enterDesktop()}
          onEnterWindow={() => void enterWindow()}
          onAuthToggle={handleAuthToggle}
        />

        <div
          ref={periodHeaderRef}
          className="header-period-row flex min-w-0 items-center justify-center gap-2"
          data-shell-chrome="period-header"
        >
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label="보기 모드">
            {VIEW_MODE_OPTIONS.map(({ value, label, Icon }) => (
              <InteractionUI
                key={value}
                as="button"
                className={
                  viewMode === value ? viewModeIconBtnActiveClass : viewModeIconBtnClass
                }
                aria-label={`${label} 보기`}
                aria-pressed={viewMode === value}
                title={`${label} 보기`}
                onClick={() => setViewMode(value)}
              >
                <Icon />
              </InteractionUI>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {viewMode === 'month' && (
              <InteractionUI
                as="button"
                className={yearNavBtnClass}
                onClick={() => shiftYear(-1)}
                aria-label="이전 연도"
                title="이전 연도"
              >
                <DoubleChevronLeftIcon />
              </InteractionUI>
            )}
            <InteractionUI
              as="button"
              className={`${navBtnClass} mr-5`}
              onClick={onPrev}
              aria-label={
                viewMode === 'year' ? '이전 연도' : viewMode === 'week' ? '이전 주' : '이전 월'
              }
              title={
                viewMode === 'year' ? '이전 연도' : viewMode === 'week' ? '이전 주' : '이전 월'
              }
            >
              <ChevronLeftIcon />
            </InteractionUI>

            <div className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
              <h1 className="m-0 text-[22px] font-semibold tracking-tight text-gcal-heading">
                {periodTitle}
              </h1>
              {lunarMonthLabel ? (
                <span
                  className="hidden shrink-0 rounded-full bg-gcal-blue-soft px-2 py-0.5 text-xs text-gcal-blue-dark xl:inline-block"
                  title={lunarMonthLabel}
                >
                  {lunarMonthLabel}
                </span>
              ) : null}
            </div>

            <InteractionUI
              as="button"
              className={`${navBtnClass} ml-5`}
              onClick={onNext}
              aria-label={
                viewMode === 'year' ? '다음 연도' : viewMode === 'week' ? '다음 주' : '다음 월'
              }
              title={
                viewMode === 'year' ? '다음 연도' : viewMode === 'week' ? '다음 주' : '다음 월'
              }
            >
              <ChevronRightIcon />
            </InteractionUI>
            {viewMode === 'month' && (
              <InteractionUI
                as="button"
                className={yearNavBtnClass}
                onClick={() => shiftYear(1)}
                aria-label="다음 연도"
                title="다음 연도"
              >
                <DoubleChevronRightIcon />
              </InteractionUI>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <InteractionUI as="button" className={todayBtnClass} onClick={goToday}>
              오늘
            </InteractionUI>
            <InteractionUI
              as="button"
              className={cn(desktopModeIconBtnClass, softBlueIconBtnClass)}
              onClick={openSite}
              aria-label="인터넷"
              title="사이트 열기"
            >
              <WebBrowserIcon />
            </InteractionUI>
            <InteractionUI
              as="button"
              className={cn(
                desktopModeIconBtnClass,
                softBlueIconBtnClass,
                eventsHidden && softBlueIconBtnActiveClass
              )}
              onClick={() => setViewFlag({ eventsHidden: !eventsHidden })}
              aria-label={eventsHidden ? '모든 일정 보이기' : '모든 일정 숨기기'}
              aria-pressed={eventsHidden}
              title={eventsHidden ? '일정 다시 보이기' : '모든 일정 숨기기'}
            >
              <HideEventsEyeIcon open={!eventsHidden} />
            </InteractionUI>
            <InteractionUI
              as="button"
              className={cn(
                desktopModeIconBtnClass,
                softBlueIconBtnClass,
                completedHidden && softBlueIconBtnActiveClass
              )}
              onClick={() => setViewFlag({ completedHidden: !completedHidden })}
              aria-label={completedHidden ? '완료 일정 보이기' : '완료 일정 숨기기'}
              aria-pressed={completedHidden}
              title={completedHidden ? '완료된 일정 다시 보이기' : '완료된 일정만 숨기기'}
            >
              <HideCompletedCheckIcon checked={completedHidden} />
            </InteractionUI>
          </div>
        </div>
      </header>

      {viewMode === 'year' ? (
        renderYearView()
      ) : viewMode === 'week' ? (
        <div
          className={cn(
            'month-view week-view flex-1',
            !showWeekNumbers && 'hide-week-numbers',
            eventsHidden && 'is-events-hidden',
            completedHidden && 'is-completed-hidden'
          )}
          style={eventLayoutCssVars as CSSProperties}
        >
          <div className="month-weekdays">
            {showWeekNumbers ? <div className="week-number-header" aria-hidden /> : null}
            {weekdayLabels.map((label) => (
              <div
                key={label}
                className={
                  label === '일' ? 'is-sunday' : label === '토' ? 'is-saturday' : undefined
                }
              >
                {label}
              </div>
            ))}
          </div>
          <div ref={monthBodyRef} className="month-body">
            <div className="month-week month-week--single">
              {showWeekNumbers ? (
                <div className="week-number" title={`${getWeekNumber(weekDays[0].date)}주`}>
                  {getWeekNumber(weekDays[0].date)}
                </div>
              ) : null}
              {weekDays.map((cell) => renderDayCell(cell, { tall: true }))}
            </div>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'month-view flex-1',
            !showWeekNumbers && 'hide-week-numbers',
            eventsHidden && 'is-events-hidden',
            completedHidden && 'is-completed-hidden'
          )}
          style={eventLayoutCssVars as CSSProperties}
        >
          <div className="month-weekdays">
            {showWeekNumbers ? (
              <div className="week-number-header" title="주차">
                주
              </div>
            ) : null}
            {weekdayLabels.map((label) => (
              <div
                key={label}
                className={
                  label === '일' ? 'is-sunday' : label === '토' ? 'is-saturday' : undefined
                }
              >
                {label}
              </div>
            ))}
          </div>
          <div ref={monthBodyRef} className="month-body">
            {monthWeeks.map((week, wi) => (
              <div key={`week-${wi}`} className="month-week">
                {showWeekNumbers ? (
                  <div className="week-number" title={`${getWeekNumber(week[0].date)}주`}>
                    {getWeekNumber(week[0].date)}
                  </div>
                ) : null}
                {week.map((cell) => renderDayCell(cell))}
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className={cn(footerShellClass, 'interaction-ui')} data-shell-chrome="footer">
        <InteractionUI
          as="button"
          className="border-0 bg-transparent p-0 text-xs text-gcal-muted transition-colors hover:text-gcal-blue hover:underline"
          onClick={openSite}
          title={SITE_URL}
          aria-label={SITE_URL}
        >
          {SITE_URL}
        </InteractionUI>
      </footer>

      <SearchPanel
        open={searchOpen}
        events={visibleEvents}
        calendars={store.calendars}
        tags={store.tags}
        onClose={() => setSearchOpen(false)}
        onSelect={jumpToEvent}
      />
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        store={store}
        user={user}
        onClose={() => setSettingsOpen(false)}
        onSave={onSettingsSaved}
        onPatchStore={patchStoreSettings}
        onCreateCalendar={createCalendar}
        onPatchCalendar={patchCalendar}
        onDeleteCalendar={deleteCalendar}
        onSetTags={setTags}
        onReplaceStore={replaceStore}
        onAddEvent={addEvent}
        onListMembers={listMembers}
        onSaveMembers={saveMembers}
        onSyncHolidays={syncHolidays}
        onRefresh={refresh}
      />
      <LoginDialog
        open={loginOpen}
        busy={loginBusy}
        error={loginError}
        onClose={() => setLoginOpen(false)}
        onSubmit={handleLogin}
      />

      {quickEdit ? (
        <DayQuickEditPopover
          dateKey={quickEdit.dateKey}
          date={quickEdit.date}
          events={eventsByDate.get(quickEdit.dateKey) ?? []}
          calendars={store.calendars}
          tags={store.tags}
          dayColor={dayColors[quickEdit.dateKey] ?? null}
          anchorRect={quickEdit.anchorRect}
          canEdit={canEdit}
          onClose={() => setQuickEdit(null)}
          onCreate={(title, calendarId, tagIds, links) =>
            void addEvent({
              title,
              calendarId: calendarId || PRIMARY_CALENDAR_ID,
              startDate: quickEdit.dateKey,
              endDate: quickEdit.dateKey,
              allDay: true,
              tagIds,
              links
            })
          }
          onToggleCompleted={(id, completed) => void toggleCompleted(id, completed)}
          onRemove={(id) => void removeEvent(id)}
          onDayColorChange={(color) => {
            const next = { ...dayColors }
            if (!color) delete next[quickEdit.dateKey]
            else next[quickEdit.dateKey] = color
            void patchStoreSettings({ dayColors: next })
          }}
          onEventCalendarChange={(event, calendarId) => void editEvent(event.id, { calendarId })}
          onEventTagChange={(event, tagIds) => void editEvent(event.id, { tagIds })}
          onEventMarkerShapeChange={(event, markerShape) =>
            void editEvent(event.id, { markerShape })
          }
          onEventLinkChange={(event, links) => void editEvent(event.id, { links })}
          onOpenMore={(event) =>
            openEventEditor(event ?? null, {
              defaultDate: quickEdit.dateKey,
              returnQuickEdit: quickEdit
            })
          }
          onOpenEvent={(event) => openEventDetail(event, quickEdit.anchorRect)}
          onEditEvent={(event) => openEventEditor(event)}
        />
      ) : null}

      {eventPopover ? (
        <EventPopover
          event={eventPopover.event}
          calendar={calendarsById.get(eventPopover.event.calendarId)}
          tags={store.tags}
          anchorRect={eventPopover.anchorRect}
          canEdit={canEdit}
          onClose={() => setEventPopover(null)}
          onEdit={() => openEventEditor(eventPopover.event)}
          onDelete={() => {
            void removeEvent(eventPopover.event.id).then(() => setEventPopover(null))
          }}
          onToggleCompleted={(completed) => {
            void toggleCompleted(eventPopover.event.id, completed).then(() =>
              setEventPopover((prev) =>
                prev ? { ...prev, event: { ...prev.event, completed } } : null
              )
            )
          }}
        />
      ) : null}

      {dayList ? (
        <DayEventsPopover
          dateKey={dayList.dateKey}
          events={dayListEvents}
          calendarsById={calendarsById}
          tags={store.tags}
          anchorRect={dayList.anchorRect}
          canEdit={canEdit}
          onClose={() => setDayList(null)}
          onSelect={(event, rect) => {
            setDayList(null)
            openEventDetail(event, rect)
          }}
          onEdit={(event) => {
            setDayList(null)
            openEventEditor(event)
          }}
        />
      ) : null}

      {editor ? (
        <EventEditor
          open
          event={editor.event}
          defaultDate={editor.defaultDate}
          calendars={store.calendars}
          tags={store.tags}
          onClose={() => {
            const back = editor.returnQuickEdit
            setEditor(null)
            setPendingEdit(null)
            if (back) setQuickEdit(back)
          }}
          onSave={async (payload) => {
            try {
              if (!editor.event) {
                dismissEditorAfterSave()
                await addEvent({
                  ...payload,
                  allDay: payload.allDay !== false
                } as Parameters<typeof addEvent>[0])
                return
              }

              if (pendingEdit?.needsScope) {
                setPendingEdit((prev) =>
                  prev
                    ? { ...prev, payload: payload as Record<string, unknown> }
                    : prev
                )
                setScopeDialog({ mode: 'edit' })
                return
              }

              dismissEditorAfterSave()
              await editEvent(editor.event.id, payload as Partial<CalendarEvent>)
            } catch (error) {
              window.alert(error instanceof Error ? error.message : '일정을 저장하지 못했습니다.')
            }
          }}
          onDelete={
            editor.event
              ? async () => {
                  const master =
                    store.events.find((item) => item.id === editor.event!.id) ?? editor.event!
                  if (!isRecurringEvent(master)) {
                    await removeEvent(master.id)
                    setEditor(null)
                    setPendingEdit(null)
                    return
                  }
                  const occurrenceDate =
                    editor.occurrenceDate ||
                    getOccurrenceDate(master, selectedKey) ||
                    master.startDate
                  setPendingDelete({ master, occurrenceDate })
                  setScopeDialog({ mode: 'delete' })
                }
              : undefined
          }
        />
      ) : null}

      <RecurrenceScopeDialog
        open={Boolean(scopeDialog)}
        mode={scopeDialog?.mode ?? 'edit'}
        onClose={() => {
          setScopeDialog(null)
          if (scopeDialog?.mode === 'edit') {
            setPendingEdit((prev) => (prev ? { ...prev, payload: undefined } : prev))
          } else {
            setPendingDelete(null)
          }
        }}
        onSelect={(scope) => {
          void handleScopeSelect(scope)
        }}
      />
    </div>
  )
}

export default CalendarGrid
