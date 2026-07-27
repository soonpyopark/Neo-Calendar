import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement
} from 'react'
import { DayNumber } from './DayNumber'
import { EventAccentGlyph } from './EventAccentGlyph'
import { EventAttachIcon } from './EventAttachIcon'
import { EventLinkIcon } from './EventLinkIcon'
import { EventMoreButton } from './EventMoreButton'
import { EventTagIcons } from './EventTagIcons'
import { getCalendarTheme } from '../lib/colors'
import { getDayParts } from '../lib/lunar'
import { getEventLinks } from '../lib/eventLinks'
import { buildDayReorderPayload, commitDayReorder, type DayReorderItem } from '../lib/dayReorder'
import { resolveDayVisibleEventLimit } from '../hooks/useMaxVisibleEvents'
import { HOLIDAYS_KR_CALENDAR_ID } from '../../../shared/calendarDefaults'
import { getSeriesId } from '../../../shared/mdcExport/eventOccurrences.js'
import type { CalendarEvent, CalendarRecord, TagRecord } from '../../../shared/calendarTypes'

export type DayCellModel = {
  day: number
  dateKey: string
  inMonth: boolean
  isToday: boolean
  weekday: number
  date: Date
}

export type DaySegment = {
  event: CalendarEvent
  segment: 'single' | 'start' | 'middle' | 'end'
  lane: number
  label?: { time?: string; dayIndex?: number | null; title?: string } | null
  continuation?: boolean
}

export type MonthDayCellProps = {
  cell: DayCellModel
  segments: DaySegment[]
  calendarsById: Map<string, CalendarRecord>
  tags: TagRecord[]
  selected: boolean
  isKrHoliday: boolean
  dayColor?: string | null
  eventCapacity: { maxAll: number; maxWithMore: number }
  eventsHidden?: boolean
  completedHidden?: boolean
  canEdit?: boolean
  tall?: boolean
  /** WorkerW embedded: quick edit via main-process header hit zones, not whole cell. */
  desktopEmbedded?: boolean
  themeEpoch?: number
  onDaySelect: (date: Date) => void
  onDayQuickEdit: (date: Date, anchorRect: DOMRect) => void
  onEventDetail: (
    event: CalendarEvent,
    clientX: number,
    clientY: number,
    dayKey: string
  ) => void
  onEventEdit: (event: CalendarEvent, dayKey: string) => void
  onReorderEvents?: (ordered: DayReorderItem[], dayKey: string) => void | Promise<void>
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * MDC MonthView day cell: select / QE / rich bars / drag-reorder / deferred clicks.
 */
export function MonthDayCell({
  cell,
  segments,
  calendarsById,
  tags,
  selected,
  isKrHoliday,
  dayColor = null,
  eventCapacity,
  eventsHidden = false,
  completedHidden = false,
  canEdit = true,
  tall = false,
  desktopEmbedded = false,
  themeEpoch = 0,
  onDaySelect,
  onDayQuickEdit,
  onEventDetail,
  onEventEdit,
  onReorderEvents
}: MonthDayCellProps): ReactElement {
  const interactive = true
  const dayKey = cell.dateKey
  const [dragSeriesId, setDragSeriesId] = useState<string | null>(null)
  const [dragDayKey, setDragDayKey] = useState<string | null>(null)
  const [dropSeriesId, setDropSeriesId] = useState<string | null>(null)
  const eventClickTimerRef = useRef<number | null>(null)
  const suppressEventClickRef = useRef(false)

  const clearEventClickTimer = (): void => {
    if (eventClickTimerRef.current != null) {
      window.clearTimeout(eventClickTimerRef.current)
      eventClickTimerRef.current = null
    }
  }

  useEffect(
    () => () => {
      clearEventClickTimer()
    },
    []
  )

  const uiSegments = completedHidden
    ? segments.filter((segment) => !segment.event?.completed)
    : segments
  const { visibleCount, hiddenEventCount } = resolveDayVisibleEventLimit(uiSegments, eventCapacity)
  const visibleSegments = eventsHidden ? [] : uiSegments.slice(0, visibleCount)
  const displayDayColor = eventsHidden ? null : (dayColor ?? null)

  const weekdayClass = cell.weekday === 0 ? 'sunday' : cell.weekday === 6 ? 'saturday' : ''
  const cellStyle = displayDayColor
    ? ({ '--day-cell-bg': displayDayColor } as CSSProperties)
    : undefined
  const { solar, lunar, lunarDay, solarTerm } = getDayParts(
    cell.date.getFullYear(),
    cell.date.getMonth() + 1,
    cell.day
  )

  const openQuickEditFromCell = (target: HTMLElement): void => {
    const cellEl = target.closest('.day-cell') as HTMLElement | null
    const rect = (cellEl ?? target).getBoundingClientRect()
    onDayQuickEdit(cell.date, rect)
  }

  return (
    <div
      className={cn(
        'day-cell',
        'interaction-ui',
        weekdayClass,
        isKrHoliday && 'holiday',
        !cell.inMonth && 'other-month',
        cell.isToday && 'today',
        selected && 'selected',
        displayDayColor && 'has-day-color',
        tall && 'day-cell--tall'
      )}
      style={cellStyle}
      data-date-key={dayKey}
      onClick={interactive ? () => onDaySelect(cell.date) : undefined}
      onDoubleClick={
        interactive && !desktopEmbedded
          ? (event) => {
              if ((event.target as Element | null)?.closest?.('.event-bar, .event-more')) return
              event.preventDefault()
              event.stopPropagation()
              openQuickEditFromCell(event.currentTarget)
            }
          : undefined
      }
      onKeyDown={
        interactive
          ? (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key === 'Enter') {
                openQuickEditFromCell(e.currentTarget)
              }
            }
          : undefined
      }
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <DayNumber
        solar={solar}
        lunarLabel={lunar}
        lunarDay={lunarDay}
        solarTerm={solarTerm}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={
          !desktopEmbedded
            ? (e) => {
                e.preventDefault()
                e.stopPropagation()
                openQuickEditFromCell(e.currentTarget)
              }
            : undefined
        }
      />

      <div className={cn('day-events', eventsHidden && 'is-hidden')}>
        {visibleSegments.map(({ event, segment, label, continuation, lane }) => {
          const cal = calendarsById.get(event.calendarId)
          const color = cal?.color ?? '#f6bf26'
          const theme = getCalendarTheme(color)
          const accent = event.completed ? '#9aa0a6' : (theme.accent ?? theme.base)
          const hasLinkOrAttach =
            getEventLinks(event).length > 0 ||
            (Array.isArray(event.attachments) && event.attachments.length > 0)
          const seriesId = getSeriesId(event) || event.id
          const canDrag = Boolean(
            canEdit && onReorderEvents && event.calendarId !== HOLIDAYS_KR_CALENDAR_ID
          )
          const isDragging = dragSeriesId === seriesId && dragDayKey === dayKey
          const isDropTarget = Boolean(
            canDrag &&
              dropSeriesId === seriesId &&
              dragDayKey === dayKey &&
              dragSeriesId &&
              dragSeriesId !== seriesId
          )

          return (
            <button
              key={`${event.id}-${dayKey}-${themeEpoch}`}
              type="button"
              data-event-id={seriesId}
              data-day-key={dayKey}
              data-editable={event.calendarId === HOLIDAYS_KR_CALENDAR_ID ? '0' : '1'}
              draggable={canDrag}
              className={cn(
                'event-bar',
                segment === 'single' && 'event-bar--single',
                segment === 'start' && 'event-bar--start',
                segment === 'middle' && 'event-bar--middle',
                segment === 'end' && 'event-bar--end',
                continuation && 'event-bar--continuation',
                event.completed && 'is-completed',
                canDrag && 'is-draggable',
                isDragging && 'is-dragging',
                isDropTarget && 'is-drop-target'
              )}
              style={
                {
                  '--event-lane': Number.isFinite(lane) ? lane : 0,
                  '--event-accent': accent,
                  backgroundColor: event.completed ? 'transparent' : theme.bg,
                  color: event.completed ? '#80868b' : theme.text
                } as CSSProperties
              }
              onDragStart={(e) => {
                if (!canDrag) return
                clearEventClickTimer()
                suppressEventClickRef.current = false
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', seriesId)
                e.dataTransfer.setData('application/x-day-key', dayKey)
                setDragSeriesId(seriesId)
                setDragDayKey(dayKey)
                setDropSeriesId(null)
              }}
              onDragEnd={() => {
                suppressEventClickRef.current = true
                setDragSeriesId(null)
                setDragDayKey(null)
                setDropSeriesId(null)
              }}
              onDragOver={(e) => {
                if (!canDrag || dragDayKey !== dayKey || !dragSeriesId || dragSeriesId === seriesId) {
                  return
                }
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'move'
                if (dropSeriesId !== seriesId) setDropSeriesId(seriesId)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropSeriesId((current) => (current === seriesId ? null : current))
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const fromId = e.dataTransfer.getData('text/plain') || dragSeriesId
                const fromDay = e.dataTransfer.getData('application/x-day-key') || dragDayKey
                setDragSeriesId(null)
                setDragDayKey(null)
                setDropSeriesId(null)
                if (fromDay !== dayKey) return
                commitDayReorder(
                  onReorderEvents,
                  buildDayReorderPayload(uiSegments, fromId, seriesId),
                  dayKey
                )
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (suppressEventClickRef.current) {
                  suppressEventClickRef.current = false
                  return
                }
                const { clientX, clientY } = e
                clearEventClickTimer()
                eventClickTimerRef.current = window.setTimeout(() => {
                  eventClickTimerRef.current = null
                  onEventDetail(event, clientX, clientY, dayKey)
                }, 250)
              }}
              onDoubleClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                clearEventClickTimer()
                if (!canEdit) return
                if (event.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
                onEventEdit(event, dayKey)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                clearEventClickTimer()
                onEventDetail(event, e.clientX, e.clientY, dayKey)
              }}
            >
              <EventAccentGlyph shapeId={event.markerShape} color={accent} variant="bar" />
              {label?.time ? <span className="event-time">{label.time}</span> : null}
              {label?.dayIndex != null ? (
                <span className="event-day-index">({label.dayIndex})</span>
              ) : null}
              <EventTagIcons event={event} tags={tags} />
              {label ? (
                <span className={cn('event-title', event.completed && 'line-through opacity-70')}>
                  {label.title}
                </span>
              ) : null}
              {hasLinkOrAttach ? (
                <span className="event-bar-trailing">
                  <EventLinkIcon event={event} />
                  <EventAttachIcon event={event} />
                </span>
              ) : null}
            </button>
          )
        })}
        {!eventsHidden && hiddenEventCount > 0 ? (
          <EventMoreButton
            count={hiddenEventCount}
            lane={visibleSegments.length}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openQuickEditFromCell(e.currentTarget)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

export default MonthDayCell
