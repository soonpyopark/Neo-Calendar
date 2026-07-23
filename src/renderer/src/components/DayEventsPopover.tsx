import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement
} from 'react'
import { HOLIDAYS_KR_CALENDAR_ID } from '../../../shared/calendarDefaults'
import { getSeriesId } from '../../../shared/mdcExport/eventOccurrences.js'
import { formatEventBarLabel } from '../lib/eventFormat'
import { formatDayHeaderTitle } from '../lib/dayHeaderFormat'
import { getAnchoredPopoverPosition, useAnchoredPopoverStyle } from '../lib/popoverPosition'
import { getEventLinks } from '../lib/eventLinks'
import { cn } from '../lib/cn'
import { setIgnoreMouseEvents } from '../lib/mouseBridge'
import { EventAccentGlyph } from './EventAccentGlyph'
import { EventAttachIcon } from './EventAttachIcon'
import { EventLinkIcon } from './EventLinkIcon'
import { EventTagIcons } from './EventTagIcons'
import type { CalendarEvent, CalendarRecord, TagRecord } from '../../../shared/calendarTypes'
import type { AnchorRect } from './DayQuickEditPopover'

export type DayDisplayEvent = {
  event: CalendarEvent
  label: { time: string | null; title: string }
}

export type DayEventsPopoverProps = {
  date: Date
  dayKey: string
  events: DayDisplayEvent[]
  calendars: CalendarRecord[]
  tags?: TagRecord[]
  anchorRect: AnchorRect | null
  canEdit?: boolean
  onClose: () => void
  onEventDetail?: (
    event: CalendarEvent,
    clientX: number,
    clientY: number,
    dayKey: string,
    pointerAnchor: { x: number; y: number }
  ) => void
  onEventEdit?: (event: CalendarEvent, dayKey: string) => void
  onReorderEvents?: (
    ordered: Array<{ event: CalendarEvent; sortOrder: number }>,
    dayKey: string
  ) => void | Promise<void>
}

export function DayEventsPopover({
  date,
  dayKey,
  events,
  calendars,
  tags = [],
  anchorRect,
  canEdit = false,
  onClose,
  onEventDetail,
  onEventEdit,
  onReorderEvents
}: DayEventsPopoverProps): ReactElement | null {
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null)
  const [dragSeriesId, setDragSeriesId] = useState<string | null>(null)
  const [dropSeriesId, setDropSeriesId] = useState<string | null>(null)
  const suppressClickRef = useRef(false)

  const displayEvents = useMemo(() => {
    if (!orderOverride?.length) return events ?? []
    const byId = new Map(
      (events ?? []).map((row) => [getSeriesId(row.event) || row.event.id, row])
    )
    const ordered: DayDisplayEvent[] = []
    for (const id of orderOverride) {
      const row = byId.get(id)
      if (row) {
        ordered.push(row)
        byId.delete(id)
      }
    }
    Array.from(byId.values()).forEach((row) => ordered.push(row))
    return ordered
  }, [events, orderOverride])

  useEffect(() => {
    setOrderOverride(null)
    setDragSeriesId(null)
    setDropSeriesId(null)
  }, [dayKey])

  useEffect(() => {
    if (!orderOverride) return
    const current = (events ?? []).map((row) => getSeriesId(row.event) || row.event.id)
    if (
      current.length === orderOverride.length &&
      current.every((id, index) => id === orderOverride[index])
    ) {
      setOrderOverride(null)
    }
  }, [events, orderOverride])

  const popoverOptions = useMemo(
    () => ({
      width: Math.min(280, window.innerWidth - 24),
      estimatedHeight: 48 + Math.min(displayEvents.length * 40, 280) + 12,
      padding: 12
    }),
    [displayEvents.length]
  )
  const { ref, style: anchoredStyle } = useAnchoredPopoverStyle(anchorRect, popoverOptions)

  const clickTimerRef = useRef<number | null>(null)
  const clearClickTimer = useCallback(() => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
  }, [])

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCloseRef.current?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(
    () => () => {
      clearClickTimer()
    },
    [clearClickTimer]
  )

  const reorderMovable = (fromSeriesId: string, toSeriesId: string): void => {
    if (!canEdit || !onReorderEvents || !fromSeriesId || !toSeriesId || fromSeriesId === toSeriesId) {
      return
    }
    const movable = displayEvents.filter(
      (row) => row.event.calendarId !== HOLIDAYS_KR_CALENDAR_ID
    )
    const fromIndex = movable.findIndex(
      (row) => (getSeriesId(row.event) || row.event.id) === fromSeriesId
    )
    const toIndex = movable.findIndex(
      (row) => (getSeriesId(row.event) || row.event.id) === toSeriesId
    )
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return

    const next = [...movable]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)

    const holidays = displayEvents.filter(
      (row) => row.event.calendarId === HOLIDAYS_KR_CALENDAR_ID
    )
    const merged = [...holidays, ...next]
    setOrderOverride(merged.map((row) => getSeriesId(row.event) || row.event.id))
    void onReorderEvents(
      next.map((row, index) => ({ event: row.event, sortOrder: index })),
      dayKey
    )
  }

  if (!date || !anchorRect) return null

  const style = anchoredStyle ?? getAnchoredPopoverPosition(anchorRect, popoverOptions)

  return (
    <>
      <div
        className="interaction-ui fixed inset-0 z-[24]"
        onClick={onClose}
        role="presentation"
        onMouseEnter={() => setIgnoreMouseEvents(false)}
        onMouseLeave={() => setIgnoreMouseEvents(true, { forwardToOverlay: true })}
      />
      <div
        ref={ref}
        className="day-events-popover interaction-ui fixed z-[46] flex w-[min(280px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl bg-gcal-surface shadow-g-lg"
        style={style as CSSProperties}
        role="dialog"
        aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일 일정`}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setIgnoreMouseEvents(false)}
        onMouseLeave={() => setIgnoreMouseEvents(true, { forwardToOverlay: true })}
      >
        <div className="day-quick-edit-header">
          <h2 className="day-quick-edit-title">{formatDayHeaderTitle(date)}</h2>
          <button type="button" className="day-quick-edit-close" onClick={onClose} aria-label="닫기">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>
        </div>

        <ul className="settings-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {displayEvents.map(({ event, label }) => {
            const cal = calendars.find((c) => c.id === event.calendarId)
            const completed = Boolean(event.completed)
            const color = completed ? '#9aa0a6' : (cal?.color ?? '#f6bf26')
            const hasLinkOrAttach =
              getEventLinks(event).length > 0 ||
              (Array.isArray(event.attachments) && event.attachments.length > 0)
            const seriesId = getSeriesId(event) || event.id
            const isHoliday = event.calendarId === HOLIDAYS_KR_CALENDAR_ID
            const canDrag = canEdit && Boolean(onReorderEvents) && !isHoliday
            const isDragging = dragSeriesId === seriesId
            const isDropTarget = Boolean(
              canDrag && dropSeriesId === seriesId && dragSeriesId && dragSeriesId !== seriesId
            )

            return (
              <li
                key={`${seriesId}-${dayKey}`}
                className={cn(isDragging && 'is-dragging', isDropTarget && 'is-drop-target')}
              >
                <button
                  type="button"
                  draggable={canDrag}
                  className={cn(
                    'day-events-popover-item',
                    completed && 'is-completed',
                    canDrag && 'is-draggable'
                  )}
                  onDragStart={(e) => {
                    if (!canDrag) return
                    clearClickTimer()
                    suppressClickRef.current = false
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', seriesId)
                    setDragSeriesId(seriesId)
                    setDropSeriesId(null)
                  }}
                  onDragEnd={() => {
                    suppressClickRef.current = true
                    setDragSeriesId(null)
                    setDropSeriesId(null)
                  }}
                  onDragOver={(e) => {
                    if (!canDrag || !dragSeriesId || dragSeriesId === seriesId) return
                    e.preventDefault()
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
                    setDragSeriesId(null)
                    setDropSeriesId(null)
                    if (fromId) reorderMovable(fromId, seriesId)
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false
                      return
                    }
                    const { clientX, clientY } = e
                    clearClickTimer()
                    clickTimerRef.current = window.setTimeout(() => {
                      clickTimerRef.current = null
                      onEventDetail?.(event, clientX, clientY, dayKey, { x: clientX, y: clientY })
                    }, 250)
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    clearClickTimer()
                    if (event.calendarId === HOLIDAYS_KR_CALENDAR_ID) return
                    onEventEdit?.(event, dayKey)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onEventDetail?.(event, e.clientX, e.clientY, dayKey, {
                      x: e.clientX,
                      y: e.clientY
                    })
                  }}
                >
                  <EventAccentGlyph
                    shapeId={event.markerShape}
                    color={color}
                    variant="dot"
                    className="shrink-0"
                  />
                  {label.time ? <span className="shrink-0 text-gcal-muted">{label.time}</span> : null}
                  <EventTagIcons event={event} tags={tags} />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-gcal-heading',
                      completed && 'line-through opacity-70'
                    )}
                  >
                    {label.title}
                  </span>
                  {hasLinkOrAttach ? (
                    <span className="event-bar-trailing">
                      <EventLinkIcon event={event} />
                      <EventAttachIcon event={event} />
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

export function buildDayDisplayEvents(
  dayEvents: CalendarEvent[],
  _dayKey: string,
  tags?: TagRecord[]
): DayDisplayEvent[] {
  return dayEvents
    .map((event) => {
      const label = formatEventBarLabel(event, true, tags)
      if (!label) return null
      return { event, label }
    })
    .filter((row): row is DayDisplayEvent => Boolean(row))
}

export default DayEventsPopover
