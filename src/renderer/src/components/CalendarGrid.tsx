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
import { DayQuickEditPopover, type AnchorRect, QUICK_EDIT_YEAR_MIN_BODY } from './DayQuickEditPopover'
import { getLunarMonthLabel } from '../lib/lunar'
import {
  generateWeekRange,
  getWeeksInMonth
} from '../lib/calendarUtils'
import { useMonthWeekScroll } from '../hooks/useMonthWeekScroll.js'
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
import {
  EMBEDDED_EXPORT_CHROME_ACTIONS,
  EMBEDDED_FLOATING_CHROME_ACTIONS,
  EMBEDDED_MODE_CHROME_ACTIONS,
  PERIOD_TOOLBAR_ACTIONS
} from '../../../shared/ipc'
import type { OpenPanelWindowRequest, PanelAnchorRect, PanelWindowInit } from '../../../shared/panelWindows'
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
  expandEventsForRange,
  truncateSeriesBefore
} from '../../../shared/mdcExport/eventOccurrences.js'
import { eventToMutationPayload } from '../lib/eventMutation'
import {
  getPrimaryEventLinkUrl,
  normalizeEventLinksArray
} from '../lib/eventLinks'
import { normalizeTagIds } from '../../../shared/mdcExport/eventTags.js'
import type { EventLink } from '../../../shared/calendarTypes'
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
import type { AppSettings, AuthUser, LaunchMode } from '../../../shared/ipc'
import { SiteLink } from './SiteLink'
import { openExternalUrl } from '../lib/openExternal'

export type { CalendarEvent }
export type ViewMode = 'year' | 'week' | 'month'

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const
const PERIOD_TOOLBAR_ACTION_ID_SET = new Set<string>(Object.values(PERIOD_TOOLBAR_ACTIONS))

function toPanelAnchor(anchor: EventPopoverAnchor): PanelAnchorRect | null {
  if (!anchor) return null
  if ('left' in anchor && 'top' in anchor && 'width' in anchor && 'height' in anchor) {
    return anchor
  }
  if ('x' in anchor && 'y' in anchor) {
    return { left: anchor.x - 12, top: anchor.y - 12, width: 24, height: 24 }
  }
  return null
}
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

/** WorkerW embedded: inflate client hit rects — Sunday column gets extra outer-edge slack. */
function publishDayCellHitRect(
  el: HTMLElement,
  rect: DOMRect,
  weekStartsOn: 0 | 1
): { x: number; y: number; width: number; height: number } {
  const pad = 6
  let x = Math.round(rect.left) - pad
  let y = Math.round(rect.top) - pad
  let width = Math.round(rect.width) + pad * 2
  let height = Math.round(rect.height) + pad * 2

  if (el.classList.contains('sunday')) {
    if (weekStartsOn === 0) {
      x -= 12
      width += 12
    } else {
      width += 12
    }
  }

  return { x, y, width, height }
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

/** WorkerW embedded + window mode — floating panel windows above the shell. */
function usesFloatingPanels(mode: LaunchMode, embedded: boolean): boolean {
  return mode === 'window' || embedded
}

/** Unlocked desktop only — inline popovers inside the main renderer. */
function usesInlineOverlays(mode: LaunchMode, embedded: boolean): boolean {
  return mode === 'desktop' && !embedded
}

export type CalendarGridProps = {
  mode: LaunchMode
  /** True only while WorkerW-embedded (not while temporarily undocked). */
  embedded?: boolean
  switchReady?: boolean
  user: AuthUser | null
  /** False until first getAuth() resolves — avoids flashing login before remembered session. */
  authReady?: boolean
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
  embedded = false,
  switchReady = true,
  user,
  authReady = true,
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
    loading,
    visibleEvents,
    calendarsById,
    addEvent,
    editEvent,
    removeEvent,
    patchStoreSettings,
    createCalendar,
    patchCalendar,
    reorderCalendars,
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

  // MDC login wall: first launch / cold start without session → window + login dialog.
  const autoLoginPromptedRef = useRef(false)
  useEffect(() => {
    if (autoLoginPromptedRef.current || loading || !authReady || user) return
    autoLoginPromptedRef.current = true
    setLoginError(null)
    setLoginOpen(true)
    if (mode === 'desktop') {
      void window.neoCalendar.enterWindow().then((status) => {
        onModeChange(status.mode)
      })
    }
  }, [authReady, loading, mode, onModeChange, user])

  const chromeRef = useRef<HTMLDivElement | null>(null)
  const periodHeaderRef = useRef<HTMLDivElement | null>(null)
  const monthBodyRef = useRef<HTMLDivElement | null>(null)
  const publishHitZonesRef = useRef<(() => void) | null>(null)
  const lastDayZoneCountRef = useRef(-1)
  const modeEmbeddedRef = useRef({
    mode,
    embedded,
    floatingPanels: usesFloatingPanels(mode, embedded)
  })
  modeEmbeddedRef.current = {
    mode,
    embedded,
    floatingPanels: usesFloatingPanels(mode, embedded)
  }
  const inlineOverlays = usesInlineOverlays(mode, embedded)
  const floatingPanels = usesFloatingPanels(mode, embedded)

  const openEmbeddedPanel = useCallback(
    (init: PanelWindowInit, anchorClient?: PanelAnchorRect | null): void => {
      const payload = {
        ...init,
        ...(anchorClient ? { anchorClient } : {})
      } as OpenPanelWindowRequest
      void window.neoCalendar.openPanelWindow?.(payload)
    },
    []
  )

  const eventsHidden = store.settings.viewOptions.eventsHidden
  const completedHidden = store.settings.viewOptions.completedHidden
  const showWeekNumbers = store.settings.viewOptions.showWeekNumbers !== false
  const roundedCorners = Boolean(store.settings.viewOptions.roundedCorners)
  const dayColors = store.settings.dayColors ?? {}
  const weekStartsOn: 0 | 1 =
    settings?.weekStartsOn ?? (store.settings.viewOptions.weekStartsOnSunday === false ? 1 : 0)

  // WorkerW-embedded: publish period-toolbar + visible day-cell hit zones.
  useLayoutEffect(() => {
    const api = window.neoCalendar
    if (!api?.setClickForwardHitZones || !api.setDayCellHitZones || !api.setDayDblClickExcludeZones)
      return

    const publish = (): void => {
      const { mode: currentMode, embedded: isEmbedded } = modeEmbeddedRef.current
      if (currentMode !== 'desktop' || !isEmbedded) {
        api.setClickForwardHitZones([])
        api.setDayCellHitZones([])
        api.setDayDblClickExcludeZones([])
        return
      }

      const periodRoot = periodHeaderRef.current
      const toolbarZones = periodRoot
        ? Array.from(periodRoot.querySelectorAll<HTMLElement>('[data-toolbar-action]')).flatMap(
            (el) => {
              if (el instanceof HTMLButtonElement && el.disabled) return []
              const action = el.dataset.toolbarAction ?? ''
              if (!action || !PERIOD_TOOLBAR_ACTION_ID_SET.has(action)) return []
              const r = el.getBoundingClientRect()
              if (r.width < 1 || r.height < 1) return []
              return [
                {
                  x: Math.round(r.left),
                  y: Math.round(r.top),
                  width: Math.round(r.width),
                  height: Math.round(r.height),
                  action
                }
              ]
            }
          )
        : []

      const chromeRoot = chromeRef.current
      const chromeZones = chromeRoot
        ? Array.from(chromeRoot.querySelectorAll<HTMLElement>('[data-toolbar-action]')).flatMap(
            (el) => {
              if (el instanceof HTMLButtonElement && el.disabled) return []
              const action = el.dataset.toolbarAction ?? ''
              if (
                !action ||
                (!EMBEDDED_FLOATING_CHROME_ACTIONS.has(action) &&
                  !EMBEDDED_MODE_CHROME_ACTIONS.has(action) &&
                  !EMBEDDED_EXPORT_CHROME_ACTIONS.has(action))
              )
                return []
              const r = el.getBoundingClientRect()
              if (r.width < 1 || r.height < 1) return []
              return [
                {
                  x: Math.round(r.left),
                  y: Math.round(r.top),
                  width: Math.round(r.width),
                  height: Math.round(r.height),
                  action
                }
              ]
            }
          )
        : []
      api.setClickForwardHitZones([...toolbarZones, ...chromeZones])

      const vw = window.innerWidth
      const vh = window.innerHeight
      const dayZoneSelectors = [
        '.neo-cal-shell .day-cell[data-date-key]',
        '.neo-cal-shell .year-day[data-date-key]'
      ].join(', ')
      const dayZones = Array.from(
        document.querySelectorAll<HTMLElement>(dayZoneSelectors)
      ).flatMap((el) => {
        const dateKey = el.dataset.dateKey ?? ''
        if (!dateKey) return []
        if (el instanceof HTMLButtonElement && el.disabled) return []
        const r = el.getBoundingClientRect()
        if (r.width < 1 || r.height < 1) return []
        if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return []
        const hit = publishDayCellHitRect(el, r, weekStartsOn)
        return [
          {
            ...hit,
            dateKey
          }
        ]
      })
      api.setDayCellHitZones(dayZones)

      const excludeZones = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-shell-chrome="header"], [data-shell-chrome="footer"], [data-shell-chrome="weekday-header"]'
        )
      ).flatMap((el) => {
        const r = el.getBoundingClientRect()
        if (r.width < 1 || r.height < 1) return []
        return [
          {
            x: Math.round(r.left),
            y: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height)
          }
        ]
      })
      api.setDayDblClickExcludeZones(excludeZones)
      api.setDesktopQuickEditContext?.({ viewMode, eventsHidden })

      if (dayZones.length !== lastDayZoneCountRef.current) {
        lastDayZoneCountRef.current = dayZones.length
        console.log('[day-dblclick] renderer published zones', dayZones.length)
      }
    }

    publishHitZonesRef.current = publish
    publish()
    const ro = new ResizeObserver(publish)
    const chrome = chromeRef.current
    const period = periodHeaderRef.current
    const body = monthBodyRef.current
    if (chrome) ro.observe(chrome)
    if (period) ro.observe(period)
    if (body) ro.observe(body)
    body?.addEventListener('scroll', publish, { passive: true })
    window.addEventListener('resize', publish)
    return () => {
      publishHitZonesRef.current = null
      ro.disconnect()
      body?.removeEventListener('scroll', publish)
      window.removeEventListener('resize', publish)
      api.setClickForwardHitZones([])
      api.setDayCellHitZones([])
      api.setDayDblClickExcludeZones([])
    }
  }, [
    mode,
    embedded,
    viewMode,
    viewDate,
    weekStartsOn,
    eventsHidden,
    completedHidden,
    webEditUrl,
    searchOpen,
    settingsOpen,
    exporting,
    modeBusy,
    switchReady
  ])

  // Re-publish after embed (WorkerW blocks forwarded mousemove).
  useEffect(() => {
    if (mode !== 'desktop' || !embedded) return
    const republish = (): void => publishHitZonesRef.current?.()
    republish()
    const raf = requestAnimationFrame(republish)
    const t = window.setTimeout(republish, 100)
    const interval = window.setInterval(republish, 800)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(t)
      window.clearInterval(interval)
    }
  }, [
    mode,
    embedded,
    viewMode,
    viewDate,
    weekStartsOn,
    eventsHidden,
    completedHidden,
    webEditUrl,
    searchOpen,
    settingsOpen,
    exporting,
    modeBusy,
    switchReady
  ])
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
    // Desktop / window mode: never navigate month/week by wheel (wallpaper layer).
    wheelLocked: wheelLocked || mode === 'desktop' || mode === 'window'
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
    const { floatingPanels } = modeEmbeddedRef.current
    if (floatingPanels) {
      openEmbeddedPanel(
        {
          kind: 'quickEdit',
          dateKey: cell.dateKey,
          viewMode,
          eventsHidden,
          anchor: anchorRect
        },
        anchorRect
      )
      return
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

  useEffect(() => {
    const onTheme = (): void => setThemeEpoch((n) => n + 1)
    window.addEventListener('neocalendar:colorSchemeEffective', onTheme)
    return () => window.removeEventListener('neocalendar:colorSchemeEffective', onTheme)
  }, [])

  useEffect(() => {
    const api = window.neoCalendar
    if (!api?.onModeChanged) return
    return api.onModeChanged((status) => {
      onModeChange(status.mode)
      if (status.mode === 'window') {
        closeOverlays()
        return
      }
      // Re-embed → close overlays so they aren't stranded under desktop icons.
      if (status.mode === 'desktop' && status.embedded) {
        closeOverlays()
        requestAnimationFrame(() => publishHitZonesRef.current?.())
      }
    })
  }, [onModeChange, closeOverlays])

  const openQuickEditFromDateRef = useRef(openQuickEditFromDate)
  openQuickEditFromDateRef.current = openQuickEditFromDate

  // WorkerW embedded: main opens floating quick-edit window (no full unlock).
  useEffect(() => {
    const api = window.neoCalendar
    if (!api?.onOpenDayQuickEdit) return
    return api.onOpenDayQuickEdit((payload) => {
      // Legacy inline unlock path (non-embedded fallback).
      console.log('[day-dblclick] renderer open quick edit (inline)', payload)
      const date =
        parseDateKeyLocal(payload.dateKey) ?? parseDateKey(payload.dateKey)
      if (!date) return
      const el = document.querySelector<HTMLElement>(
        `.neo-cal-shell .day-cell[data-date-key="${payload.dateKey}"], .neo-cal-shell .year-day[data-date-key="${payload.dateKey}"]`
      )
      const rect =
        el?.getBoundingClientRect() ??
        (typeof payload.clientX === 'number' && typeof payload.clientY === 'number'
          ? new DOMRect(payload.clientX, payload.clientY, 48, 48)
          : null)
      openQuickEditFromDateRef.current(date, rect)
      requestAnimationFrame(() => {
        void api.focusForTextInput?.()
      })
    })
  }, [])

  // Dev: mirror main-process day-dblclick logs into DevTools Console.
  useEffect(() => {
    const api = window.neoCalendar
    if (!api?.onDayDblClickLog) return
    return api.onDayDblClickLog(({ msg, data }) => {
      if (data) console.log(msg, data)
      else console.log(msg)
    })
  }, [])

  // WorkerW embedded: period toolbar click → synthesize button (stay embedded).
  useEffect(() => {
    const api = window.neoCalendar
    if (!api?.onToolbarClick) return
    return api.onToolbarClick(({ action }) => {
      const toolbarActionSet = PERIOD_TOOLBAR_ACTION_ID_SET
      const chromeActionSet = new Set([
        ...EMBEDDED_FLOATING_CHROME_ACTIONS,
        ...EMBEDDED_MODE_CHROME_ACTIONS,
        ...EMBEDDED_EXPORT_CHROME_ACTIONS
      ])
      if (!toolbarActionSet.has(action) && !chromeActionSet.has(action)) return
      const btn = document.querySelector<HTMLElement>(
        `.neo-cal-shell [data-toolbar-action="${action}"]`
      )
      if (btn instanceof HTMLButtonElement && btn.disabled) return
      btn?.click()
      const { mode: currentMode, embedded: isEmbedded } = modeEmbeddedRef.current
      if (currentMode !== 'desktop' || !isEmbedded) {
        requestAnimationFrame(() => {
          void api.focusForTextInput?.()
        })
      }
    })
  }, [])

  /** Resolve a display occurrence (`id::date`) back to the stored series master. */
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

  /** MDC openEditEvent — show occurrence dates/times in the full editor. */
  const mergeOccurrenceForEditor = useCallback(
    (master: CalendarEvent, occurrence: CalendarEvent): CalendarEvent => ({
      ...master,
      startDate: occurrence.startDate ?? master.startDate,
      endDate: occurrence.endDate ?? master.endDate,
      startTime: occurrence.startTime ?? master.startTime,
      endTime: occurrence.endTime ?? master.endTime,
      allDay: occurrence.allDay ?? master.allDay
    }),
    []
  )

  const handleQuickEditToggleCompleted = useCallback(
    async (event: CalendarEvent, completed: boolean): Promise<void> => {
      if (!canEdit) return
      const master = findMasterEvent(event)
      if (!master || master.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
      const nextCompleted = Boolean(completed)
      try {
        if (!isRecurringEvent(master)) {
          await editEvent(master.id, { completed: nextCompleted })
          return
        }
        const occurrenceDate =
          getOccurrenceDate(event, quickEdit?.dateKey) ?? master.startDate
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
    [alert, canEdit, editEvent, findMasterEvent, quickEdit?.dateKey]
  )

  /** MDC DayQuickEditPopover — resolve occurrence id to series master before patch. */
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

  const handleQuickEditCalendarChange = useCallback(
    (event: CalendarEvent, calendarId: string): void => {
      void handleQuickEditEventPatch(event, { calendarId }, '캘린더를 변경하지 못했습니다.')
    },
    [handleQuickEditEventPatch]
  )

  const handleQuickEditTagChange = useCallback(
    (event: CalendarEvent, tagIds: string[]): void => {
      void handleQuickEditEventPatch(
        event,
        { tagIds: normalizeTagIds(tagIds) },
        '태그를 변경하지 못했습니다.'
      )
    },
    [handleQuickEditEventPatch]
  )

  const handleQuickEditMarkerShapeChange = useCallback(
    (event: CalendarEvent, markerShape: string | null): void => {
      void handleQuickEditEventPatch(
        event,
        { markerShape },
        '표시 도형을 변경하지 못했습니다.'
      )
    },
    [handleQuickEditEventPatch]
  )

  const handleQuickEditLinkChange = useCallback(
    (event: CalendarEvent, links: EventLink[]): void => {
      const normalized = normalizeEventLinksArray(links)
      void handleQuickEditEventPatch(
        event,
        {
          links: normalized,
          link: getPrimaryEventLinkUrl({ links: normalized })
        },
        '바로가기를 변경하지 못했습니다.'
      )
    },
    [handleQuickEditEventPatch]
  )

  useEffect(() => {
    let cancelled = false
    const poll = async (): Promise<void> => {
      try {
        const info = await window.neoCalendar.getSyncInfo?.()
        if (cancelled) return
        if (info?.running && (info.editorUrl || info.port)) {
          setWebEditUrl(info.editorUrl || `http://127.0.0.1:${info.port}/`)
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
      void window.neoCalendar.logout().then(async () => {
        onUserChange(null)
        setSettingsOpen(false)
        // Reload guest (empty) snapshot — never keep the previous member's events on screen.
        await refresh()
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
    opts?: { dayKey?: string; fromSearch?: boolean }
  ): void => {
    detailFromSearchRef.current = Boolean(opts?.fromSearch)
    const panelAnchor = toPanelAnchor(anchorRect)
    const dayKey = opts?.dayKey ?? event.occurrenceDate ?? event.startDate
    const { floatingPanels } = modeEmbeddedRef.current
    if (floatingPanels) {
      openEmbeddedPanel(
        {
          kind: 'eventDetail',
          eventId: event.id,
          dayKey,
          anchor: panelAnchor,
          fromSearch: opts?.fromSearch
        },
        panelAnchor
      )
      return
    }
    setEventPopover({
      event,
      anchorRect,
      dayKey
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
    if (event?.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
    const { floatingPanels } = modeEmbeddedRef.current
    if (floatingPanels) {
      setEventPopover(null)
      setQuickEdit(null)
      setScopeDialog(null)
      setPendingDelete(null)
      openEmbeddedPanel({
        kind: 'eventEditor',
        eventId: event?.id ?? null,
        defaultDate: opts?.defaultDate,
        occurrenceDate: opts?.defaultDate ?? null,
        returnQuickEdit: opts?.returnQuickEdit
          ? {
              dateKey: opts.returnQuickEdit.dateKey,
              anchor: opts.returnQuickEdit.anchorRect
            }
          : null
      })
      return
    }
    setEventPopover(null)
    setQuickEdit(null)
    setScopeDialog(null)
    setPendingDelete(null)

    if (event) {
      const master = findMasterEvent(event)
      if (!master) {
        void alert('일정을 찾을 수 없습니다.')
        return
      }
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
        event: mergeOccurrenceForEditor(master, event),
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

  const openEventEditorRef = useRef(openEventEditor)
  openEventEditorRef.current = openEventEditor
  const openEventDetailRef = useRef(openEventDetail)
  openEventDetailRef.current = openEventDetail
  const storeEventsRef = useRef(store.events)
  storeEventsRef.current = store.events

  useEffect(() => {
    const api = window.neoCalendar
    if (!api?.onQuickEditDeferred) return
    return api.onQuickEditDeferred((payload) => {
      const date =
        parseDateKeyLocal(payload.dateKey) ?? parseDateKey(payload.dateKey)
      if (date) {
        setViewDate(date)
        setSelectedKey(payload.dateKey)
      }
      if (payload.kind === 'editor') {
        const event = payload.eventId
          ? storeEventsRef.current.find((item) => item.id === payload.eventId) ?? null
          : null
        openEventEditorRef.current(event, { defaultDate: payload.dateKey })
        return
      }
      if (payload.kind === 'detail' && payload.eventId) {
        const seriesId = payload.eventId.split('::')[0] ?? payload.eventId
        const master = storeEventsRef.current.find((item) => item.id === seriesId)
        if (master) {
          const occurrence =
            storeEventsRef.current.find((item) => item.id === payload.eventId) ?? master
          openEventDetailRef.current(occurrence, null, { dayKey: payload.dateKey })
        }
      }
    })
  }, [])

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
          ...eventToMutationPayload(master),
          startDate: occurrenceDate,
          endDate: occurrenceEndDate,
          completed: nextCompleted
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
    const { floatingPanels } = modeEmbeddedRef.current
    if (floatingPanels) {
      openEmbeddedPanel({
        kind: 'exportConfirm',
        format,
        year: exportYear,
        month: exportMonth
      })
      return
    }
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
        desktopEmbedded={embedded}
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
            <div className="year-month-weekdays" data-shell-chrome="weekday-header">
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
                    cell.isToday && cell.inMonth && 'today',
                    selectedKey === cell.dateKey && cell.inMonth && !cell.isToday && 'selected',
                    cell.weekday === 0 && cell.inMonth && 'sunday',
                    cell.weekday === 6 && cell.inMonth && 'saturday',
                    holidayKeys.has(cell.dateKey) && cell.inMonth && 'holiday'
                  )}
                  data-date-key={cell.dateKey}
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

  const captureToolbarOnHover = !embedded

  return (
    <div
      className={cn('neo-cal-shell flex h-full flex-col', roundedCorners && 'is-rounded-corners')}
    >
      <header
        className={cn(
          headerShellClass,
          !embedded && 'interaction-ui',
          mode === 'window' && 'is-window-mode'
        )}
        data-shell-chrome="header"
      >
        <AppChrome
          mode={mode}
          embedded={embedded}
          user={user}
          searchOpen={searchOpen}
          settingsOpen={settingsOpen}
          exporting={exporting}
          modeBusy={modeBusy}
          switchReady={switchReady}
          chromeRef={chromeRef}
          onOpenSearch={() => {
            if (floatingPanels) {
              openEmbeddedPanel({ kind: 'search', eventsHidden })
              return
            }
            setSettingsOpen(false)
            setSearchOpen(true)
          }}
          onOpenSettings={() => {
            if (floatingPanels) {
              openEmbeddedPanel({ kind: 'settings' })
              return
            }
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
                captureOnHover={captureToolbarOnHover}
                data-toolbar-action={
                  value === 'year'
                    ? PERIOD_TOOLBAR_ACTIONS.viewYear
                    : value === 'week'
                      ? PERIOD_TOOLBAR_ACTIONS.viewWeek
                      : PERIOD_TOOLBAR_ACTIONS.viewMonth
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
                captureOnHover={captureToolbarOnHover}
                data-toolbar-action={PERIOD_TOOLBAR_ACTIONS.prevYear}
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
              captureOnHover={captureToolbarOnHover}
              data-toolbar-action={PERIOD_TOOLBAR_ACTIONS.prev}
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
              captureOnHover={captureToolbarOnHover}
              data-toolbar-action={PERIOD_TOOLBAR_ACTIONS.next}
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
                captureOnHover={captureToolbarOnHover}
                data-toolbar-action={PERIOD_TOOLBAR_ACTIONS.nextYear}
                onClick={() => shiftYear(1)}
                aria-label="다음 연도"
                title="다음 연도"
              >
                <DoubleChevronRightIcon />
              </InteractionUI>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <InteractionUI
              as="button"
              className={todayBtnClass}
              captureOnHover={captureToolbarOnHover}
              data-toolbar-action={PERIOD_TOOLBAR_ACTIONS.today}
              aria-label="오늘"
              title="오늘"
              onClick={goToday}
            >
              오늘
            </InteractionUI>
            <InteractionUI
              as="button"
              className={cn(desktopModeIconBtnClass, softBlueIconBtnClass)}
              captureOnHover={captureToolbarOnHover}
              data-toolbar-action={PERIOD_TOOLBAR_ACTIONS.webEditor}
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
              captureOnHover={captureToolbarOnHover}
              data-toolbar-action={PERIOD_TOOLBAR_ACTIONS.toggleEvents}
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
              captureOnHover={captureToolbarOnHover}
              data-toolbar-action={PERIOD_TOOLBAR_ACTIONS.toggleCompleted}
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
          <div className="month-weekdays" data-shell-chrome="weekday-header">
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
          <div className="month-weekdays" data-shell-chrome="weekday-header">
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
        <p className="neo-cal-footer-hint m-0 min-w-0">
          [참고] 날짜 영역을 더블클릭해서 일정을 추가하세요.
        </p>
        <SiteLink />
      </footer>

      {inlineOverlays ? (
        <SearchPanel
          open={searchOpen}
          events={eventsHidden ? [] : visibleEvents}
          calendars={store.calendars}
          tags={store.tags}
          onClose={() => setSearchOpen(false)}
          onSelectResult={handleSearchSelect}
        />
      ) : null}
      {inlineOverlays ? (
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
          onReorderCalendars={reorderCalendars}
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
      ) : null}
      <LoginDialog
        open={loginOpen}
        busy={loginBusy}
        error={loginError}
        dismissible
        onClose={() => setLoginOpen(false)}
        onSubmit={handleLogin}
      />

      {inlineOverlays && quickEdit ? (
        <DayQuickEditPopover
          dateKey={quickEdit.dateKey}
          date={quickEdit.date}
          // MDC: pass store masters; DayQuickEditPopover expands recurrence per day.
          events={eventsHidden ? [] : visibleEvents}
          calendars={store.calendars}
          tags={store.tags}
          dayColor={dayColors[quickEdit.dateKey] ?? null}
          anchorRect={quickEdit.anchorRect}
          canEdit={canEdit}
          expandBody={viewMode === 'month'}
          minBodyHeight={viewMode === 'year' ? QUICK_EDIT_YEAR_MIN_BODY : undefined}
          onReorderEvents={handleReorderEvents}
          onClose={() => {
            if (scopeDialog) return
            setQuickEdit(null)
          }}
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
          onToggleCompleted={(event, completed) => {
            void handleQuickEditToggleCompleted(event, completed)
          }}
          onDayColorChange={(color) => {
            const next = { ...dayColors }
            if (!color) delete next[quickEdit.dateKey]
            else next[quickEdit.dateKey] = color
            void patchStoreSettings({ dayColors: next })
          }}
          onEventCalendarChange={handleQuickEditCalendarChange}
          onEventTagChange={handleQuickEditTagChange}
          onEventMarkerShapeChange={handleQuickEditMarkerShapeChange}
          onEventLinkChange={handleQuickEditLinkChange}
          onOpenMore={(event) => {
            if (event?.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
            openEventEditor(event ?? null, {
              defaultDate: quickEdit.dateKey,
              returnQuickEdit: quickEdit
            })
          }}
          onOpenEvent={(event, pointer) =>
            openEventDetail(
              event,
              pointer ? { x: pointer.x, y: pointer.y } : quickEdit.anchorRect,
              { dayKey: quickEdit.dateKey }
            )
          }
          onEditEvent={(event) => {
            if (event.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
            openEventEditor(event, {
              defaultDate: quickEdit.dateKey,
              returnQuickEdit: quickEdit
            })
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

      {inlineOverlays && eventPopover ? (
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
            if (event.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
            openEventEditor(event, { defaultDate: eventPopover.dayKey })
          }}
          onDelete={(event) => {
            const master = findMasterEvent(event)
            if (!master) {
              void alert('일정을 찾을 수 없습니다.')
              return
            }
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
            const master = findMasterEvent(event)
            if (!master || master.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
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

      {inlineOverlays && editor ? (
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
              const masterId = findMasterEvent(editor.event)?.id ?? editor.event.id
              await editEvent(masterId, payload as Partial<CalendarEvent>)
            } catch (error) {
              await alert(error instanceof Error ? error.message : '일정을 저장하지 못했습니다.')
            }
          }}
          onDelete={
            editor.event
              ? async () => {
                  const master = findMasterEvent(editor.event)
                  if (!master) {
                    await alert('일정을 찾을 수 없습니다.')
                    return
                  }
                  if (!isRecurringEvent(master)) {
                    await removeEvent(master.id)
                    setEditor(null)
                    setPendingEdit(null)
                    return
                  }
                  const occurrenceDate =
                    editor.occurrenceDate ||
                    getOccurrenceDate(editor.event, selectedKey) ||
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
            /* keep editor open so user can cancel scope and continue editing */
            return
          }
          if (scopeDialog?.mode === 'complete') {
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
