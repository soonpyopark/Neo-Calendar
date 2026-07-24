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
import { useAppDialog } from './AppDialogProvider'
import { AppChrome } from './AppChrome'
import { DayQuickEditPopover, type AnchorRect } from './DayQuickEditPopover'
import { getLunarMonthLabel } from '../lib/lunar'
import {
  generateWeekRange,
  getWeeksInMonth
} from '../lib/calendarUtils'
import { useMonthWeekScroll } from '../hooks/useMonthWeekScroll.js'
import { buildDayDisplayEvents, DayEventsPopover } from './DayEventsPopover'
import { EventEditor } from './EventEditor'
import { EventPopover, type EventPopoverAnchor } from './EventPopover'
import { MonthDayCell, type DaySegment } from './MonthDayCell'
import {
  buildAllWeekEventLayouts,
  buildWeekEventLayout
} from '../../../shared/mdcExport/monthWeekLayout.js'

const WEEKS_BEFORE = 56
const WEEKS_AFTER = 56
import { parseDateKey as parseDateKeyLocal } from '../lib/calendarUtils'
import {
  getEventSortOrderForDay,
  mergeSortOrderByDay
} from '../../../shared/mdcExport/eventBarFormat.js'
import { LoginDialog } from './LoginDialog'
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog'
import { SearchPanel } from './SearchPanel'
import { SettingsPanel } from './SettingsPanel'
import { useEventLayoutCssVars, useMaxVisibleEvents } from '../hooks/useMaxVisibleEvents'
import {
  addExdate,
  buildFollowingSeriesEvent,
  buildSingleExceptionEvent,
  getOccurrenceDate,
  getSeriesId,
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
import { useUndoRedoShortcuts } from '../hooks/useUndoRedoShortcuts'
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
import type { AppSettings, AuthUser, ClientHitRect, LaunchMode } from '../../../shared/ipc'
import { SiteLink } from './SiteLink'
import { openExternalUrl } from '../lib/openExternal'

export type { CalendarEvent }
export type ViewMode = 'year' | 'week' | 'month'

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const
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

function isMonthInWeekBuffer(
  anchor: Date,
  weekStartsOn: 0 | 1,
  weeksBefore: number,
  weeksAfter: number,
  year: number,
  monthIndex: number
): boolean {
  const weeks = generateWeekRange(anchor, weekStartsOn, weeksBefore, weeksAfter)
  return weeks.some((week) =>
    week.some(
      ({ date }) =>
        date.getFullYear() === year && date.getMonth() === monthIndex && date.getDate() === 1
    )
  )
}

function mapWeekToDayCells(
  week: Array<{ date: Date }>,
  displayYear: number,
  displayMonth: number
): DayCell[] {
  const today = new Date()
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate())
  return week.map(({ date }) => {
    const y = date.getFullYear()
    const m = date.getMonth()
    const day = date.getDate()
    const dateKey = toDateKey(y, m, day)
    return {
      day,
      dateKey,
      inMonth: y === displayYear && m === displayMonth,
      isToday: dateKey === todayKey,
      weekday: date.getDay(),
      date: new Date(y, m, day)
    }
  })
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

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

function toWeekStartKey(week: DayCell[]): string {
  return week[0]?.dateKey ?? ''
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
  const { alert, confirm } = useAppDialog()
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
    clearCalendarEvents,
    importEventsIntoCalendar,
    createTag,
    patchTag,
    deleteTag,
    replaceStore,
    importStore,
    listMembers,
    saveMembers,
    syncHolidays,
    refresh,
    undo,
    redo,
    canUndo,
    canRedo
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
  const [webEditUrl, setWebEditUrl] = useState<string | null>(null)
  /** Bumps when light/dark flips so MDC event-bar themes recompute. */
  const [themeEpoch, setThemeEpoch] = useState(0)
  const [quickEdit, setQuickEdit] = useState<{
    dateKey: string
    date: Date
    anchorRect: AnchorRect | null
  } | null>(null)
  const [eventPopover, setEventPopover] = useState<{
    event: CalendarEvent
    anchorRect: EventPopoverAnchor
    dayKey?: string
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
  const [scopeDialog, setScopeDialog] = useState<{
    mode: 'edit' | 'delete' | 'complete'
  } | null>(null)
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
  const [pendingComplete, setPendingComplete] = useState<{
    master: CalendarEvent
    occurrenceDate: string
    completed: boolean
  } | null>(null)
  /** Search-opened detail may stay up even while grid hide toggles are on (MDC). */
  const detailFromSearchRef = useRef(false)

  /** MDC App.clearEventDetail */
  const clearEventDetail = useCallback((): void => {
    detailFromSearchRef.current = false
    setEventPopover(null)
  }, [])

  const handleUndo = useCallback(async () => {
    if (!canEdit || !canUndo) return
    try {
      await undo()
      clearEventDetail()
      setQuickEdit(null)
    } catch (err) {
      await alert(err instanceof Error ? err.message : '실행 취소에 실패했습니다.')
    }
  }, [alert, canEdit, canUndo, clearEventDetail, undo])

  const handleRedo = useCallback(async () => {
    if (!canEdit || !canRedo) return
    try {
      await redo()
      clearEventDetail()
      setQuickEdit(null)
    } catch (err) {
      await alert(err instanceof Error ? err.message : '다시 실행에 실패했습니다.')
    }
  }, [alert, canEdit, canRedo, clearEventDetail, redo])

  useUndoRedoShortcuts({
    canUndo: canEdit && canUndo,
    canRedo: canEdit && canRedo,
    onUndo: handleUndo,
    onRedo: handleRedo,
    enabled: canEdit
  })

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

  const rectToZone = (rect: DOMRect, pad = 2): ClientHitRect => ({
    x: rect.left - pad,
    y: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2
  })

  /** Search/settings/login/export — hover undock for IME/modals. */
  const publishWakeZones = (): void => {
    const api = window.neoCalendar
    if (!api?.setWakeHitZones) return
    if (mode !== 'desktop') {
      api.setWakeHitZones([])
      api.setClickForwardHitZones?.([])
      return
    }

    const pad = 2
    const chromeRoot = chromeRef.current
    // Skip 창모드 (own hit-zone) and 바탕화면모드 (already in desktop).
    const wakeButtons = chromeRoot
      ? Array.from(chromeRoot.querySelectorAll<HTMLElement>('button')).filter((btn) => {
          const host = btn.closest('.window-mode-hit-host')
          if (host) return false
          const label = `${btn.getAttribute('aria-label') ?? ''} ${btn.title ?? ''}`
          if (label.includes('바탕화면')) return false
          return true
        })
      : []
    const wakeZones = wakeButtons
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => rectToZone(rect, pad))

    api.setWakeHitZones(wakeZones)

    // Period toolbar: stay-embedded click inject (연/주/월/nav/오늘/internet/eye/check).
    const periodRoot = periodHeaderRef.current
    const clickZones = periodRoot
      ? Array.from(periodRoot.querySelectorAll<HTMLElement>('button, [data-embed-click="1"]'))
          .map((el) => el.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect) => rectToZone(rect, pad))
      : []
    api.setClickForwardHitZones?.(clickZones)

    const stripRoots: HTMLElement[] = []
    if (chromeRoot) stripRoots.push(chromeRoot)
    if (periodRoot) stripRoots.push(periodRoot)
    if (stripRoots.length > 0) {
      const stripBottom = Math.max(
        ...stripRoots.map((el) => {
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

    // Infinite month buffer keeps ~100+ weeks in the DOM. Only publish cells that
    // intersect the visible month-body — stale off-screen rects after scroll used to
    // open quick-edit for wrong dates (e.g. June) when double-clicking empty chrome.
    const body = monthBodyRef.current
    const clip = body?.getBoundingClientRect()
    if (!clip || clip.width < 8 || clip.height < 8) {
      api.setDayCellHitZones([])
      return
    }

    const zones = Array.from(
      document.querySelectorAll<HTMLElement>('.neo-cal-shell .day-cell[data-date-key]')
    )
      .map((el) => {
        const rect = el.getBoundingClientRect()
        const dateKey = el.dataset.dateKey ?? ''
        const left = Math.max(rect.left, clip.left)
        const top = Math.max(rect.top, clip.top)
        const right = Math.min(rect.right, clip.right)
        const bottom = Math.min(rect.bottom, clip.bottom)
        const width = right - left
        const height = bottom - top
        return { x: left, y: top, width, height, dateKey }
      })
      .filter((z) => z.dateKey && z.width >= 8 && z.height >= 8)

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

    const body = monthBodyRef.current
    const onScroll = (): void => {
      // Scroll does not always re-render — refresh day-cell zones immediately.
      publishDayCellZones()
    }
    body?.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('resize', onResize)
      window.clearInterval(id)
      body?.removeEventListener('scroll', onScroll)
      window.neoCalendar?.setWakeHitZones?.([])
      window.neoCalendar?.setClickForwardHitZones?.([])
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

  const scrollAnchorRef = useRef(viewDate)
  const [scrollAnchorVersion, setScrollAnchorVersion] = useState(0)
  const viewDateRef = useRef(viewDate)
  viewDateRef.current = viewDate
  const hasInitialScrollRef = useRef(false)
  const prevViewMonthRef = useRef('')
  const prevWeeksInViewportRef = useRef(0)
  const viewModeRef = useRef(viewMode)
  viewModeRef.current = viewMode
  const prevViewModeForAlignRef = useRef(viewMode)

  useLayoutEffect(() => {
    if (viewMode !== 'month') {
      const anchor = viewDateRef.current
      scrollAnchorRef.current = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
      setScrollAnchorVersion((version) => version + 1)
    }
  }, [viewMode])

  const weekRangeAnchor = useMemo(() => {
    const current = scrollAnchorRef.current
    if (
      isMonthInWeekBuffer(current, weekStartsOn, WEEKS_BEFORE, WEEKS_AFTER, year, month)
    ) {
      return current
    }
    const next = new Date(year, month, 1)
    scrollAnchorRef.current = next
    return next
  }, [year, month, weekStartsOn, scrollAnchorVersion])

  /** MDC infinite buffer (~113 weeks) mapped to DayCells for the header month. */
  const scrollWeeks = useMemo(() => {
    const raw = generateWeekRange(weekRangeAnchor, weekStartsOn, WEEKS_BEFORE, WEEKS_AFTER)
    return raw.map((week) => mapWeekToDayCells(week, year, month))
  }, [weekRangeAnchor, weekStartsOn, year, month])

  const effectiveWeeksInViewport =
    viewMode === 'week' ? 1 : viewMode === 'month' ? getWeeksInMonth(year, month, weekStartsOn) : 0

  /** MDC: row height ÷ weeks → how many bars fit before "더보기". */
  const eventCapacity = useMaxVisibleEvents(monthBodyRef, effectiveWeeksInViewport)
  const eventLayoutCssVars = useEventLayoutCssVars()

  const layoutEvents = useMemo(
    () => (completedHidden ? visibleEvents.filter((event) => !event.completed) : visibleEvents),
    [visibleEvents, completedHidden]
  )

  const monthWeekLayouts = useMemo(
    () =>
      buildAllWeekEventLayouts(scrollWeeks, layoutEvents, store.tags) as Map<
        string,
        Record<string, DaySegment[]>
      >,
    [scrollWeeks, layoutEvents, store.tags]
  )

  const weekViewLayout = useMemo(
    () =>
      buildWeekEventLayout(weekDays, layoutEvents, store.tags) as Record<string, DaySegment[]>,
    [weekDays, layoutEvents, store.tags]
  )

  const segmentsForDay = useCallback(
    (cell: DayCell, weeks: DayCell[][]): DaySegment[] => {
      if (viewMode === 'week') return weekViewLayout[cell.dateKey] ?? []
      const week = weeks.find((row) => row.some((d) => d.dateKey === cell.dateKey))
      if (!week) return []
      const layout = monthWeekLayouts.get(toWeekStartKey(week))
      return layout?.[cell.dateKey] ?? []
    },
    [viewMode, weekViewLayout, monthWeekLayouts]
  )

  const wheelLocked = Boolean(
    quickEdit ||
      searchOpen ||
      settingsOpen ||
      loginOpen ||
      eventPopover ||
      dayList ||
      editor ||
      scopeDialog
  )

  const {
    setWeekRef,
    scrollToMonth,
    consumeSkipScroll
  } = useMonthWeekScroll({
    scrollRef: monthBodyRef,
    weeks: scrollWeeks,
    weeksInViewport: effectiveWeeksInViewport,
    onVisibleMonthChange: (nextYear: number, nextMonth1: number) => {
      // Ignore trailing scroll reports from the previous mode's container (MDC viewModeRef).
      if (viewModeRef.current !== 'month') return
      const next = new Date(nextYear, nextMonth1 - 1, 1)
      setViewDate(next)
    },
    wheelLocked: wheelLocked || mode === 'desktop'
  })

  const scrollToMonthRef = useRef(scrollToMonth)
  scrollToMonthRef.current = scrollToMonth

  useLayoutEffect(() => {
    if (viewMode !== 'month') {
      prevViewModeForAlignRef.current = viewMode
      return
    }

    // Week/year unmount the infinite month body — remount starts at scrollTop 0
    // (~buffer start, often a prior month). Same monthKey must still realign.
    const enteredMonth = prevViewModeForAlignRef.current !== 'month'
    prevViewModeForAlignRef.current = viewMode

    const monthKey = `${year}-${month}`
    const weeksCountChanged = prevWeeksInViewportRef.current !== effectiveWeeksInViewport
    prevWeeksInViewportRef.current = effectiveWeeksInViewport

    if (!hasInitialScrollRef.current) {
      hasInitialScrollRef.current = true
      scrollToMonthRef.current(year, month, weekStartsOn, 'auto')
      prevViewMonthRef.current = monthKey
      return
    }

    if (enteredMonth || prevViewMonthRef.current !== monthKey || weeksCountChanged) {
      if (weeksCountChanged || enteredMonth) consumeSkipScroll()
      prevViewMonthRef.current = monthKey
      scrollToMonthRef.current(year, month, weekStartsOn, 'auto')
    }
  }, [
    viewMode,
    year,
    month,
    weekStartsOn,
    effectiveWeeksInViewport,
    scrollWeeks,
    consumeSkipScroll
  ])

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
    detailFromSearchRef.current = false
    setEventPopover(null)
    setDayList(null)
    setEditor(null)
    setScopeDialog(null)
    setPendingEdit(null)
    setPendingDelete(null)
    setPendingComplete(null)
    setSearchOpen(false)
    setSettingsOpen(false)
    setLoginOpen(false)
    setLoginError(null)
  }, [])

  // Keep open detail in sync when store patches the same event (preserve occurrence day).
  useEffect(() => {
    if (!eventPopover) return
    const seriesId = getSeriesId(eventPopover.event) || eventPopover.event.id
    const next =
      store.events.find((item) => item.id === seriesId || item.id === eventPopover.event.id) ??
      null
    if (!next) {
      clearEventDetail()
      return
    }
    setEventPopover((prev) => {
      if (!prev) return null
      const occurrenceDate = prev.event.occurrenceDate
      const merged = occurrenceDate ? { ...next, occurrenceDate } : next
      if (
        prev.event.title === merged.title &&
        prev.event.completed === merged.completed &&
        prev.event.description === merged.description &&
        prev.event.calendarId === merged.calendarId
      ) {
        return prev
      }
      return { ...prev, event: merged }
    })
  }, [store.events, eventPopover?.event.id, clearEventDetail])

  // MDC: hide-events / hide-completed dismisses bar detail (search-opened stays).
  useEffect(() => {
    if (!eventsHidden) return
    if (detailFromSearchRef.current) return
    clearEventDetail()
  }, [eventsHidden, clearEventDetail])

  useEffect(() => {
    if (!completedHidden || !eventPopover?.event.completed) return
    if (detailFromSearchRef.current) return
    clearEventDetail()
  }, [completedHidden, eventPopover?.event.completed, clearEventDetail])

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
    if (viewMode === 'month') {
      // Day-1 of current month so header + infinite scroll stay on this month.
      setViewDate(new Date(d.getFullYear(), d.getMonth(), 1))
    } else {
      setViewDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
    }
    setSelectedKey(toDateKey(d.getFullYear(), d.getMonth(), d.getDate()))
    setQuickEdit(null)
    // Force month-body realign even when year/month did not change (same as MDC token).
    if (viewMode === 'month') {
      prevViewMonthRef.current = ''
      scrollToMonthRef.current(d.getFullYear(), d.getMonth(), weekStartsOn, 'auto')
    }
  }

  const handleViewModeChange = (nextMode: ViewMode): void => {
    if (nextMode === 'month' || nextMode === 'year') {
      setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), 1))
    } else if (nextMode === 'week') {
      const fromSelected = selectedKey ? parseDateKeyLocal(selectedKey) : null
      const anchor = fromSelected ?? viewDateRef.current
      setViewDate(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()))
    }
    setViewMode(nextMode)
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

  const openQuickEdit = (
    cell: DayCell,
    eventOrRect?: MouseEvent | DOMRect | null
  ): void => {
    setEventPopover(null)
    setDayList(null)
    setSelectedKey(cell.dateKey)
    let anchorRect: AnchorRect | null = null
    if (eventOrRect instanceof DOMRect) {
      anchorRect = {
        top: eventOrRect.top,
        left: eventOrRect.left,
        width: eventOrRect.width,
        height: eventOrRect.height
      }
    } else if (eventOrRect) {
      anchorRect = rectFromTarget(eventOrRect.currentTarget)
    }
    setQuickEdit({
      dateKey: cell.dateKey,
      date: cell.date,
      anchorRect
    })
  }

  const openQuickEditFromDate = (date: Date, rect?: DOMRect | null): void => {
    const dateKey = toDateKey(date.getFullYear(), date.getMonth(), date.getDate())
    openQuickEdit(
      {
        day: date.getDate(),
        dateKey,
        inMonth: true,
        isToday: false,
        weekday: date.getDay(),
        date
      },
      rect ?? null
    )
  }

  const openQuickEditByDateKey = (
    dateKey: string,
    clientX?: number,
    clientY?: number
  ): void => {
    let resolvedKey = dateKey
    let el: HTMLElement | null = null

    // Prefer the live cell under the cursor — hit-zones can lag behind month scroll.
    if (typeof clientX === 'number' && typeof clientY === 'number') {
      const under = document.elementFromPoint(clientX, clientY)
      const cell =
        under instanceof Element
          ? under.closest<HTMLElement>('.neo-cal-shell .day-cell[data-date-key]')
          : null
      if (!cell?.dataset.dateKey) {
        // Non-date chrome (weekdays / gaps / header): do not open a random buffer day.
        return
      }
      resolvedKey = cell.dataset.dateKey
      el = cell
    } else {
      el = document.querySelector<HTMLElement>(
        `.neo-cal-shell .day-cell[data-date-key="${CSS.escape(dateKey)}"]`
      )
    }

    const date = parseDateKey(resolvedKey)
    if (!date) return

    const body = monthBodyRef.current
    const bodyRect = body?.getBoundingClientRect()
    const rect = el?.getBoundingClientRect()
    if (el && bodyRect && rect) {
      const visible =
        rect.bottom > bodyRect.top + 2 &&
        rect.top < bodyRect.bottom - 2 &&
        rect.right > bodyRect.left + 2 &&
        rect.left < bodyRect.right - 2
      if (!visible) return
    }

    setEventPopover(null)
    setDayList(null)
    setSelectedKey(resolvedKey)
    setQuickEdit({
      dateKey: resolvedKey,
      date,
      anchorRect:
        typeof clientX === 'number' && typeof clientY === 'number'
          ? { top: clientY, left: clientX, width: 0, height: 0 }
          : rect
            ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
            : null
    })
  }

  useEffect(() => {
    const api = window.neoCalendar
    if (!api?.onOpenDayQuickEdit) return
    return api.onOpenDayQuickEdit(({ dateKey, clientX, clientY }) => {
      openQuickEditByDateKey(dateKey, clientX, clientY)
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

  const toggleCompleted = async (id: string, completed?: boolean): Promise<void> => {
    if (!canEdit) return
    const current = store.events.find((e) => e.id === id)
    if (!current) return
    await editEvent(id, {
      completed: typeof completed === 'boolean' ? completed : !current.completed
    })
  }

  useEffect(() => {
    let cancelled = false
    const poll = async (): Promise<void> => {
      try {
        const info = await window.neoCalendar.getSyncInfo?.()
        if (cancelled) return
        if (info?.running && info.port) {
          setWebEditUrl(`http://127.0.0.1:${info.port}/`)
        } else {
          setWebEditUrl(null)
        }
      } catch {
        if (!cancelled) setWebEditUrl(null)
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const handleOpenWebEditor = (): void => {
    if (!webEditUrl) return
    void openExternalUrl(webEditUrl)
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
      await refresh()
      setLoginOpen(false)
    } finally {
      setLoginBusy(false)
    }
  }

  /**
   * MDC App.openEventDetail — pointer `{x,y}` or null (centered, e.g. search).
   * Callers that must not open over QE/editor (bar click) guard themselves.
   */
  const openEventDetail = (
    event: CalendarEvent,
    anchorRect: EventPopoverAnchor = null,
    opts?: { dayKey?: string; keepDayList?: boolean; fromSearch?: boolean }
  ): void => {
    detailFromSearchRef.current = Boolean(opts?.fromSearch)
    if (!opts?.keepDayList) setDayList(null)
    setEventPopover({
      event,
      anchorRect,
      dayKey: opts?.dayKey ?? event.occurrenceDate ?? event.startDate
    })
  }

  const handleSearchSelect = ({
    event,
    date,
    dayKey
  }: {
    event: CalendarEvent
    date: Date
    dayKey: string
  }): void => {
    setSearchOpen(false)
    setViewDate(date)
    setSelectedKey(dayKey)
    setViewMode('month')
    // MDC: search result → centered detail (null anchor).
    openEventDetail(event, null, { dayKey, fromSearch: true })
  }

  const handleReorderEvents = useCallback(
    async (
      ordered: Array<{ event: CalendarEvent; sortOrder: number }>,
      dayKey: string
    ): Promise<void> => {
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

  const openEventEditor = (
    event: CalendarEvent | null,
    opts?: {
      defaultDate?: string
      returnQuickEdit?: { dateKey: string; date: Date; anchorRect: AnchorRect | null } | null
    }
  ): void => {
    if (!canEdit && event === null) return
    // Holidays are read-only — never open the full editor (MDC).
    if (event?.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
    setEventPopover(null)
    setDayList(null)
    setScopeDialog(null)
    setPendingDelete(null)
    if (!opts?.returnQuickEdit) setQuickEdit(null)
    else setQuickEdit(null)

    if (event) {
      const master = store.events.find((item) => item.id === event.id) ?? event
      if (master.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
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
          calendarId: master.calendarId,
          title: master.title,
          description: master.description ?? '',
          location: master.location ?? '',
          startDate: occurrenceDate,
          endDate: occurrenceEndDate,
          allDay: master.allDay,
          startTime: master.startTime,
          endTime: master.endTime,
          repeat: master.repeat ?? 'none',
          repeatUntil: master.repeatUntil ?? null,
          repeatCount: master.repeatCount ?? null,
          color: master.color ?? null,
          completed: nextCompleted,
          markerShape: master.markerShape ?? null,
          tagIds: master.tagIds,
          links: master.links,
          link: master.link
        }
        await applyRecurringEdit(master, payload, occurrenceDate, scope)
        setPendingComplete(null)
        setEventPopover((prev) =>
          prev ? { ...prev, event: { ...prev.event, completed: nextCompleted } } : null
        )
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
        clearEventDetail()
        setEditor(null)
      }
    } catch (error) {
      await alert(error instanceof Error ? error.message : '반복 일정 처리에 실패했습니다.')
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
    const ok = await confirm(
      `${exportYear}년 ${exportMonth}월 일정을 ${formatLabel} 파일로 저장하시겠습니까?`
    )
    if (!ok) return
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
        await alert(result.error || `${formatLabel} 내보내기에 실패했습니다.`)
        return
      }
      await alert(`${exportYear}년 ${exportMonth}월 일정을 ${formatLabel} 파일로 저장했습니다.`)
    } catch (error) {
      await alert(error instanceof Error ? error.message : `${formatLabel} 내보내기에 실패했습니다.`)
    } finally {
      setExporting(false)
    }
  }

  const lunarMonthLabel = useMemo(
    () => (viewMode === 'month' ? getLunarMonthLabel(year, month + 1) : null),
    [viewMode, year, month]
  )

  const renderDayCell = (cell: DayCell, options?: { tall?: boolean }): ReactElement => {
    const weeks = options?.tall ? [weekDays] : scrollWeeks
    return (
      <MonthDayCell
        key={cell.dateKey}
        cell={cell}
        segments={segmentsForDay(cell, weeks)}
        calendarsById={calendarsById}
        tags={store.tags}
        selected={selectedKey === cell.dateKey}
        isKrHoliday={holidayKeys.has(cell.dateKey)}
        dayColor={dayColors[cell.dateKey] ?? null}
        eventCapacity={eventCapacity}
        eventsHidden={eventsHidden}
        completedHidden={completedHidden}
        canEdit={canEdit}
        tall={options?.tall}
        themeEpoch={themeEpoch}
        onDaySelect={(date) => {
          setSelectedKey(toDateKey(date.getFullYear(), date.getMonth(), date.getDate()))
        }}
        onDayQuickEdit={(date, rect) => openQuickEditFromDate(date, rect)}
        onEventDetail={(event, clientX, clientY, dayKey) => {
          // MDC: bar / list click (or context menu) → pointer-anchored detail.
          // Don't open over quick-edit / full editor (guard is here, not in openEventDetail).
          if (quickEdit || editor) return
          setSelectedKey(dayKey)
          openEventDetail(event, { x: clientX, y: clientY }, { dayKey })
        }}
        onEventEdit={(event, dayKey) => {
          if (event.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
          setSelectedKey(dayKey)
          openEventEditor(event, { defaultDate: dayKey })
        }}
        onMoreOpen={(date, dayKey, _segments, rect) => {
          // MDC onCloseEventDetail: "더보기" list opening closes bar detail.
          setSelectedKey(dayKey)
          setQuickEdit(null)
          clearEventDetail()
          setDayList({
            dateKey: dayKey,
            anchorRect: {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height
            }
          })
          void date
        }}
        onReorderEvents={handleReorderEvents}
      />
    )
  }

  const renderYearView = (): ReactElement => (
    <div className="year-view flex-1">
      {Array.from({ length: 12 }, (_, monthIndex) => {
        const weeks = buildMonthWeeks(year, monthIndex, weekStartsOn)
        return (
          <div
            key={monthIndex}
            className={cn('year-month', monthIndex === month && 'is-current')}
          >
            <InteractionUI
              as="button"
              className="year-month-title"
              onClick={() => {
                setViewDate(new Date(year, monthIndex, 1))
                setViewMode('month')
              }}
              aria-label={`${year}년 ${monthIndex + 1}월로 이동`}
            >
              {monthIndex + 1}월
            </InteractionUI>
            <div className="year-month-weekdays">
              {weekdayLabels.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="year-month-grid">
              {weeks.flat().map((cell) => (
                <button
                  key={cell.dateKey}
                  type="button"
                  className={cn(
                    'year-day',
                    'interaction-ui',
                    !cell.inMonth && 'other-month',
                    cell.isToday && 'today',
                    selectedKey === cell.dateKey && !cell.isToday && 'selected',
                    cell.weekday === 0 && cell.inMonth && 'sunday',
                    cell.weekday === 6 && cell.inMonth && 'saturday',
                    holidayKeys.has(cell.dateKey) && cell.inMonth && 'holiday'
                  )}
                  disabled={!cell.inMonth}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!cell.inMonth) return
                    setSelectedKey(cell.dateKey)
                    setViewDate(cell.date)
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!cell.inMonth) return
                    openQuickEdit(cell)
                  }}
                  aria-label={
                    cell.inMonth
                      ? `${year}년 ${monthIndex + 1}월 ${cell.day}일`
                      : undefined
                  }
                >
                  {cell.inMonth ? cell.day : ''}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )

  const dayListEvents = useMemo(() => {
    if (!dayList) return []
    const raw = eventsByDate.get(dayList.dateKey) ?? []
    return buildDayDisplayEvents(raw, dayList.dateKey, store.tags)
  }, [dayList, eventsByDate, store.tags])

  const dayListDate = dayList ? parseDateKeyLocal(dayList.dateKey) : null

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
                onClick={() => handleViewModeChange(value)}
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
              onClick={handleOpenWebEditor}
              aria-label="브라우저에서 편집"
              title={
                webEditUrl
                  ? `브라우저에서 편집 (${webEditUrl})`
                  : '로컬 웹 서버가 꺼져 있습니다 (.env의 PORT 확인)'
              }
              disabled={!webEditUrl}
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
          style={
            {
              ...eventLayoutCssVars,
              '--weeks-in-viewport': effectiveWeeksInViewport
            } as CSSProperties
          }
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
            {scrollWeeks.map((week) => {
              const weekStartKey = toWeekStartKey(week)
              return (
                <div
                  key={weekStartKey}
                  className="month-week"
                  ref={(node) => setWeekRef(weekStartKey, node)}
                >
                  {showWeekNumbers ? (
                    <div className="week-number" title={`${getWeekNumber(week[0].date)}주`}>
                      {getWeekNumber(week[0].date)}
                    </div>
                  ) : null}
                  {week.map((cell) => renderDayCell(cell))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <footer
        className={cn(footerShellClass, 'interaction-ui')}
        data-shell-chrome="footer"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <SiteLink />
      </footer>

      <SearchPanel
        open={searchOpen}
        events={visibleEvents}
        calendars={store.calendars}
        tags={store.tags}
        onClose={() => setSearchOpen(false)}
        onSelectResult={handleSearchSelect}
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
        onClearCalendarEvents={clearCalendarEvents}
        onImportIntoCalendar={importEventsIntoCalendar}
        onCreateTag={createTag}
        onUpdateTag={patchTag}
        onDeleteTag={deleteTag}
        onReplaceStore={replaceStore}
        onImportStore={importStore}
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
          expandBody={viewMode === 'month'}
          onReorderEvents={handleReorderEvents}
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
          onOpenMore={(event) => {
            if (event?.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
            openEventEditor(event ?? null, {
              defaultDate: quickEdit.dateKey,
              returnQuickEdit: quickEdit
            })
          }}
          onOpenEvent={(event) => openEventDetail(event, quickEdit.anchorRect)}
          onEditEvent={(event) => {
            if (event.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
            openEventEditor(event)
          }}
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
              await alert(
                error instanceof Error ? error.message : '파일을 첨부하지 못했습니다.'
              )
            }
          }}
        />
      ) : null}

      {eventPopover ? (
        <EventPopover
          event={eventPopover.event}
          calendar={calendarsById.get(eventPopover.event.calendarId) ?? null}
          tags={store.tags}
          dayKey={eventPopover.dayKey}
          anchorRect={eventPopover.anchorRect}
          canEdit={
            canEdit && eventPopover.event.calendarId !== HOLIDAYS_KR_CALENDAR_ID
          }
          onClose={clearEventDetail}
          onEdit={(event) => {
            // MDC: detail pencil → full EventEditor (closes detail + day list).
            if (event.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
            openEventEditor(event, { defaultDate: eventPopover.dayKey })
          }}
          onDelete={(event) => {
            const master =
              store.events.find((item) => item.id === (getSeriesId(event) || event.id)) ??
              event
            if (!isRecurringEvent(master)) {
              void removeEvent(master.id).then(() => clearEventDetail())
              return
            }
            const occurrenceDate =
              getOccurrenceDate(event, eventPopover.dayKey) || master.startDate
            setPendingDelete({ master, occurrenceDate })
            setScopeDialog({ mode: 'delete' })
          }}
          onToggleCompleted={(event, completed) => {
            if (!canEdit) return
            const master =
              store.events.find((item) => item.id === (getSeriesId(event) || event.id)) ??
              event
            if (master.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
            const nextCompleted = Boolean(completed)
            if (!isRecurringEvent(master)) {
              void editEvent(master.id, { completed: nextCompleted }).then(() =>
                setEventPopover((prev) =>
                  prev
                    ? { ...prev, event: { ...prev.event, completed: nextCompleted } }
                    : null
                )
              )
              return
            }
            // MDC: recurring complete → scope dialog.
            const occurrenceDate =
              getOccurrenceDate(event, eventPopover.dayKey) || master.startDate
            setPendingComplete({
              master,
              occurrenceDate,
              completed: nextCompleted
            })
            setScopeDialog({ mode: 'complete' })
          }}
        />
      ) : null}

      {dayList && dayListDate ? (
        <DayEventsPopover
          date={dayListDate}
          dayKey={dayList.dateKey}
          events={dayListEvents}
          calendars={store.calendars}
          tags={store.tags}
          anchorRect={dayList.anchorRect}
          canEdit={canEdit}
          onClose={() => {
            setDayList(null)
            clearEventDetail()
          }}
          onEventDetail={(event, _x, _y, dayKey, pointerAnchor) => {
            // MDC: list-row click → detail anchored at the mouse pointer; keep day list.
            if (quickEdit || editor) return
            openEventDetail(event, pointerAnchor ?? { x: _x, y: _y }, {
              dayKey,
              keepDayList: true
            })
          }}
          onEventEdit={(event, dayKey) => {
            if (event.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
            setDayList(null)
            openEventEditor(event, { defaultDate: dayKey })
          }}
          onReorderEvents={handleReorderEvents}
        />
      ) : null}

      {editor ? (
        <EventEditor
          open
          event={editor.event}
          defaultDate={editor.defaultDate}
          calendars={store.calendars}
          tags={store.tags}
          onEventRefresh={(updated) => {
            setEditor((prev) => (prev ? { ...prev, event: updated } : prev))
            void refresh()
          }}
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
              await alert(error instanceof Error ? error.message : '일정을 저장하지 못했습니다.')
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
          const mode = scopeDialog?.mode
          setScopeDialog(null)
          if (mode === 'edit') {
            setPendingEdit((prev) => (prev ? { ...prev, payload: undefined } : prev))
          } else if (mode === 'complete') {
            setPendingComplete(null)
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
