import { useMemo, useState, type CSSProperties, type MouseEvent, type ReactElement } from 'react'
import { InteractionUI } from './InteractionUI'
import { AppChrome } from './AppChrome'
import { DayQuickEditPopover, type AnchorRect } from './DayQuickEditPopover'
import { LoginDialog } from './LoginDialog'
import { SearchPanel } from './SearchPanel'
import { SettingsPanel } from './SettingsPanel'
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
import type { AppSettings, AuthUser, LaunchMode } from '../../../shared/ipc'
import { SITE_URL } from '../../../shared/constants'

export type CalendarEvent = {
  id: string
  dateKey: string
  title: string
  color?: string
  completed?: boolean
}

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

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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

function eventStyle(color: string): CSSProperties {
  return {
    '--event-accent': color,
    '--event-bg': `${color}22`,
    '--event-text': '#3c4043'
  } as CSSProperties
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
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [viewDate, setViewDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [eventsHidden, setEventsHidden] = useState(false)
  const [completedHidden, setCompletedHidden] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [modeBusy, setModeBusy] = useState(false)
  const [quickEdit, setQuickEdit] = useState<{
    dateKey: string
    date: Date
    anchorRect: AnchorRect | null
  } | null>(null)
  const [dayColors, setDayColors] = useState<Record<string, string>>({})
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    const y = now.getFullYear()
    const m = now.getMonth()
    return [
      {
        id: createId(),
        dateKey: toDateKey(y, m, Math.min(now.getDate() + 1, 28)),
        title: '팀 미팅',
        color: EVENT_PALETTE[0]
      },
      {
        id: createId(),
        dateKey: toDateKey(y, m, Math.min(now.getDate() + 2, 28)),
        title: '완료된 일정',
        color: EVENT_PALETTE[3],
        completed: true
      },
      {
        id: createId(),
        dateKey: toDateKey(y, m, Math.min(now.getDate() + 3, 28)),
        title: 'Neo Calendar',
        color: EVENT_PALETTE[1]
      }
    ]
  })
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const weekStartsOn = settings?.weekStartsOn ?? 0
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

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      if (completedHidden && event.completed) continue
      const list = map.get(event.dateKey) ?? []
      list.push(event)
      map.set(event.dateKey, list)
    }
    return map
  }, [events, completedHidden])

  const periodTitle =
    viewMode === 'year'
      ? `${year}년`
      : viewMode === 'week'
        ? formatWeekTitle(viewDate, weekStartsOn)
        : `${year}년 ${month + 1}월`

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
    const el =
      target instanceof Element ? target.closest('.day-cell') : null
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
    setSelectedKey(cell.dateKey)
    setQuickEdit({
      dateKey: cell.dateKey,
      date: cell.date,
      anchorRect: event ? rectFromTarget(event.currentTarget) : null
    })
  }

  const createEvent = (dateKey: string, title: string): void => {
    const color = EVENT_PALETTE[events.length % EVENT_PALETTE.length]
    setEvents((prev) => [...prev, { id: createId(), dateKey, title, color }])
  }

  const removeEvent = (id: string): void => {
    setEvents((prev) => prev.filter((item) => item.id !== id))
  }

  const toggleCompleted = (id: string, completed?: boolean): void => {
    setEvents((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, completed: typeof completed === 'boolean' ? completed : !item.completed }
          : item
      )
    )
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
    const [y, m, d] = event.dateKey.split('-').map(Number)
    if (!y || !m || !d) return
    setViewDate(new Date(y, m - 1, d))
    setSelectedKey(event.dateKey)
    setViewMode('month')
  }

  const renderDayCell = (cell: DayCell, options?: { tall?: boolean }): ReactElement => {
    const dayEvents = eventsHidden ? [] : (eventsByDate.get(cell.dateKey) ?? [])
    const weekdayClass = cell.weekday === 0 ? 'sunday' : cell.weekday === 6 ? 'saturday' : ''
    const dayColor = dayColors[cell.dateKey]
    const cellStyle = dayColor
      ? ({ '--day-tint': dayColor } as CSSProperties)
      : undefined

    return (
      <div
        key={cell.dateKey}
        className={cn(
          'day-cell',
          cell.inMonth && 'interaction-ui',
          weekdayClass,
          !cell.inMonth && 'other-month',
          cell.isToday && 'today',
          selectedKey === cell.dateKey && 'selected',
          dayColor && 'has-day-color',
          options?.tall && 'day-cell--tall'
        )}
        style={cellStyle}
        onDoubleClick={(event) => {
          if (!cell.inMonth) return
          // Event bars handle their own double-click (complete toggle).
          if ((event.target as Element | null)?.closest?.('.event-bar')) return
          event.preventDefault()
          openQuickEdit(cell, event)
        }}
      >
        <div className="day-number">
          <span className="solar">{cell.day}</span>
        </div>

        <div className={cn('day-events', eventsHidden && 'is-hidden')}>
          {dayEvents.slice(0, options?.tall ? 8 : 3).map((item, lane) => (
            <InteractionUI
              key={item.id}
              as="button"
              className={cn('event-bar event-bar--single', item.completed && 'is-completed')}
              style={
                {
                  ...eventStyle(item.color ?? EVENT_PALETTE[0]),
                  '--event-lane': lane
                } as CSSProperties
              }
              onClick={() => setSelectedKey(cell.dateKey)}
              onDoubleClick={(event) => {
                event.stopPropagation()
                toggleCompleted(item.id)
              }}
              aria-label={item.title}
              title="더블클릭: 완료 토글"
            >
              <span className="event-bar-accent" aria-hidden />
              <span className={cn('event-title', item.completed && 'is-completed')}>{item.title}</span>
              <span
                role="button"
                tabIndex={0}
                className="event-bar-remove"
                aria-label={`${item.title} 삭제`}
                onClick={(e) => {
                  e.stopPropagation()
                  removeEvent(item.id)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    removeEvent(item.id)
                  }
                }}
              >
                ×
              </span>
            </InteractionUI>
          ))}
        </div>

      </div>
    )
  }

  const renderYearView = (): ReactElement => (
    <div className="year-view">
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
                    cell.weekday === 6 && cell.inMonth && 'saturday'
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

  return (
    <div className="neo-cal-shell">
      <AppChrome
        mode={mode}
        user={user}
        searchOpen={searchOpen}
        settingsOpen={settingsOpen}
        modeBusy={modeBusy}
        switchReady={switchReady}
        onOpenSearch={() => {
          setSettingsOpen(false)
          setSearchOpen(true)
        }}
        onOpenSettings={() => {
          setSearchOpen(false)
          setSettingsOpen(true)
        }}
        onEnterDesktop={() => void enterDesktop()}
        onEnterWindow={() => void enterWindow()}
        onAuthToggle={handleAuthToggle}
      />

      <header className="neo-cal-header header-period-row">
        <div className="header-view-modes" role="group" aria-label="보기 모드">
          {VIEW_MODE_OPTIONS.map(({ value, label, Icon }) => (
            <InteractionUI
              key={value}
              as="button"
              className={cn('hdr-btn hdr-btn-view', viewMode === value && 'is-active')}
              aria-label={`${label} 보기`}
              aria-pressed={viewMode === value}
              title={`${label} 보기`}
              onClick={() => setViewMode(value)}
            >
              <Icon />
            </InteractionUI>
          ))}
        </div>

        <div className="header-period-nav">
          {viewMode === 'month' && (
            <InteractionUI
              as="button"
              className="hdr-btn hdr-btn-nav"
              onClick={() => shiftYear(-1)}
              aria-label="이전 연도"
              title="이전 연도"
            >
              <DoubleChevronLeftIcon />
            </InteractionUI>
          )}
          <InteractionUI
            as="button"
            className="hdr-btn hdr-btn-nav hdr-btn-nav-gap-end"
            onClick={onPrev}
            aria-label={viewMode === 'year' ? '이전 연도' : viewMode === 'week' ? '이전 주' : '이전 월'}
            title={viewMode === 'year' ? '이전 연도' : viewMode === 'week' ? '이전 주' : '이전 월'}
          >
            <ChevronLeftIcon />
          </InteractionUI>

          <h1 className="neo-cal-title">{periodTitle}</h1>

          <InteractionUI
            as="button"
            className="hdr-btn hdr-btn-nav hdr-btn-nav-gap-start"
            onClick={onNext}
            aria-label={viewMode === 'year' ? '다음 연도' : viewMode === 'week' ? '다음 주' : '다음 월'}
            title={viewMode === 'year' ? '다음 연도' : viewMode === 'week' ? '다음 주' : '다음 월'}
          >
            <ChevronRightIcon />
          </InteractionUI>
          {viewMode === 'month' && (
            <InteractionUI
              as="button"
              className="hdr-btn hdr-btn-nav"
              onClick={() => shiftYear(1)}
              aria-label="다음 연도"
              title="다음 연도"
            >
              <DoubleChevronRightIcon />
            </InteractionUI>
          )}
        </div>

        <div className="header-period-actions">
          <InteractionUI as="button" className="hdr-btn hdr-btn-today" onClick={goToday}>
            오늘
          </InteractionUI>
          <InteractionUI
            as="button"
            className="hdr-btn hdr-btn-tool"
            onClick={openSite}
            aria-label="인터넷"
            title="사이트 열기"
          >
            <WebBrowserIcon />
          </InteractionUI>
          <InteractionUI
            as="button"
            className={cn('hdr-btn hdr-btn-tool', eventsHidden && 'is-active')}
            onClick={() => setEventsHidden((v) => !v)}
            aria-label={eventsHidden ? '모든 일정 보이기' : '모든 일정 숨기기'}
            aria-pressed={eventsHidden}
            title={eventsHidden ? '일정 다시 보이기' : '모든 일정 숨기기'}
          >
            <HideEventsEyeIcon open={!eventsHidden} />
          </InteractionUI>
          <InteractionUI
            as="button"
            className={cn('hdr-btn hdr-btn-tool', completedHidden && 'is-active')}
            onClick={() => setCompletedHidden((v) => !v)}
            aria-label={completedHidden ? '완료 일정 보이기' : '완료 일정 숨기기'}
            aria-pressed={completedHidden}
            title={completedHidden ? '완료된 일정 다시 보이기' : '완료된 일정만 숨기기'}
          >
            <HideCompletedCheckIcon checked={completedHidden} />
          </InteractionUI>
        </div>
      </header>

      {viewMode === 'year' ? (
        renderYearView()
      ) : viewMode === 'week' ? (
        <div className="month-view hide-week-numbers week-view">
          <div className="month-weekdays">
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
          <div className="month-body">
            <div className="month-week month-week--single">{weekDays.map((cell) => renderDayCell(cell, { tall: true }))}</div>
          </div>
        </div>
      ) : (
        <div className={cn('month-view hide-week-numbers', eventsHidden && 'is-events-hidden')}>
          <div className="month-weekdays">
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
          <div className="month-body">
            {monthWeeks.map((week, wi) => (
              <div key={`week-${wi}`} className="month-week">
                {week.map((cell) => renderDayCell(cell))}
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="neo-cal-footer interaction-ui" data-shell-chrome="footer">
        <InteractionUI
          as="button"
          className="neo-cal-footer-link"
          onClick={openSite}
          title={SITE_URL}
          aria-label={SITE_URL}
        >
          {SITE_URL}
        </InteractionUI>
      </footer>

      <SearchPanel
        open={searchOpen}
        events={events}
        onClose={() => setSearchOpen(false)}
        onSelect={jumpToEvent}
      />
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={onSettingsSaved}
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
          events={events}
          dayColor={dayColors[quickEdit.dateKey] ?? null}
          anchorRect={quickEdit.anchorRect}
          canEdit
          onClose={() => setQuickEdit(null)}
          onCreate={(title) => createEvent(quickEdit.dateKey, title)}
          onToggleCompleted={(id, completed) => toggleCompleted(id, completed)}
          onRemove={removeEvent}
          onDayColorChange={(color) => {
            setDayColors((prev) => {
              const next = { ...prev }
              if (!color) delete next[quickEdit.dateKey]
              else next[quickEdit.dateKey] = color
              return next
            })
          }}
        />
      ) : null}
    </div>
  )
}

export default CalendarGrid
