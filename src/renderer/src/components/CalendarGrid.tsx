import { useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { InteractionUI } from './InteractionUI'

export type CalendarEvent = {
  id: string
  dateKey: string
  title: string
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function toDateKey(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  })
}

function buildMonthCells(year: number, month: number): Array<{
  day: number | null
  dateKey: string | null
  isToday: boolean
}> {
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate())

  const cells: Array<{ day: number | null; dateKey: string | null; isToday: boolean }> = []

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ day: null, dateKey: null, isToday: false })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = toDateKey(year, month, day)
    cells.push({
      day,
      dateKey,
      isToday: dateKey === todayKey
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ day: null, dateKey: null, isToday: false })
  }

  return cells
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 7-column monthly calendar.
 * Only interactive controls (nav, add, event cards) are wrapped in InteractionUI.
 * Day labels and empty cells stay pointer-transparent for click-through.
 */
export function CalendarGrid(): ReactElement {
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [events, setEvents] = useState<CalendarEvent[]>([
    {
      id: createId(),
      dateKey: toDateKey(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 1, 28)),
      title: 'Team sync'
    },
    {
      id: createId(),
      dateKey: toDateKey(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 3, 28)),
      title: 'Ship Neo Calendar'
    }
  ])
  const [draftDateKey, setDraftDateKey] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')

  const cells = useMemo(
    () => buildMonthCells(cursor.year, cursor.month),
    [cursor.year, cursor.month]
  )

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const list = map.get(event.dateKey) ?? []
      list.push(event)
      map.set(event.dateKey, list)
    }
    return map
  }, [events])

  const goPrev = (): void => {
    setCursor((prev) => {
      const month = prev.month - 1
      if (month < 0) return { year: prev.year - 1, month: 11 }
      return { ...prev, month }
    })
    setDraftDateKey(null)
  }

  const goNext = (): void => {
    setCursor((prev) => {
      const month = prev.month + 1
      if (month > 11) return { year: prev.year + 1, month: 0 }
      return { ...prev, month }
    })
    setDraftDateKey(null)
  }

  const goToday = (): void => {
    const d = new Date()
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
    setDraftDateKey(null)
  }

  const openComposer = (dateKey: string): void => {
    setDraftDateKey(dateKey)
    setDraftTitle('')
  }

  const submitEvent = (event: FormEvent): void => {
    event.preventDefault()
    const title = draftTitle.trim()
    if (!draftDateKey || !title) return

    setEvents((prev) => [
      ...prev,
      {
        id: createId(),
        dateKey: draftDateKey,
        title
      }
    ])
    setDraftDateKey(null)
    setDraftTitle('')
  }

  const removeEvent = (id: string): void => {
    setEvents((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
      <div className="pointer-events-none flex w-full max-w-5xl flex-col gap-4">
        {/* Header — only buttons are interactive */}
        <div className="pointer-events-none flex items-center justify-between gap-4 px-1">
          <h1 className="text-readable text-3xl font-semibold tracking-tight drop-readable">
            {monthLabel(cursor.year, cursor.month)}
          </h1>

          <div className="pointer-events-none flex items-center gap-2">
            <InteractionUI
              as="button"
              onClick={goPrev}
              className="rounded-md bg-[var(--calendar-surface-strong)] px-3 py-1.5 text-sm text-white ring-1 ring-[var(--calendar-line)] transition hover:bg-[var(--calendar-surface)]"
              aria-label="Previous month"
            >
              <span className="text-readable">←</span>
            </InteractionUI>

            <InteractionUI
              as="button"
              onClick={goToday}
              className="rounded-md bg-[var(--calendar-surface-strong)] px-3 py-1.5 text-sm text-white ring-1 ring-[var(--calendar-line)] transition hover:bg-[var(--calendar-surface)]"
            >
              <span className="text-readable">Today</span>
            </InteractionUI>

            <InteractionUI
              as="button"
              onClick={goNext}
              className="rounded-md bg-[var(--calendar-surface-strong)] px-3 py-1.5 text-sm text-white ring-1 ring-[var(--calendar-line)] transition hover:bg-[var(--calendar-surface)]"
              aria-label="Next month"
            >
              <span className="text-readable">→</span>
            </InteractionUI>
          </div>
        </div>

        {/* Weekday labels — non-interactive, click-through */}
        <div className="pointer-events-none grid grid-cols-7 gap-2 px-1">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-readable text-center text-xs font-medium uppercase tracking-[0.18em] text-[var(--calendar-muted)]"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Month grid — empty cells stay transparent / click-through */}
        <div className="pointer-events-none grid grid-cols-7 gap-2">
          {cells.map((cell, index) => {
            if (!cell.day || !cell.dateKey) {
              return <div key={`empty-${index}`} className="min-h-28" aria-hidden />
            }

            const dayEvents = eventsByDate.get(cell.dateKey) ?? []
            const composing = draftDateKey === cell.dateKey

            return (
              <div
                key={cell.dateKey}
                className="pointer-events-none relative min-h-28 rounded-lg p-2"
              >
                {/* Day number — visual only, not wrapped in InteractionUI */}
                <div
                  className={`text-readable mb-2 text-sm font-semibold ${
                    cell.isToday ? 'text-[var(--calendar-accent)]' : 'text-white'
                  }`}
                >
                  {cell.day}
                  {cell.isToday ? (
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-[var(--calendar-accent)]">
                      Today
                    </span>
                  ) : null}
                </div>

                <div className="pointer-events-none flex flex-col gap-1.5">
                  {dayEvents.map((item) => (
                    <InteractionUI
                      key={item.id}
                      className="group flex items-start justify-between gap-2 rounded-md bg-[var(--calendar-surface-strong)] px-2 py-1.5 ring-1 ring-[var(--calendar-line)] transition hover:bg-[var(--calendar-surface)]"
                    >
                      <span className="text-readable line-clamp-2 text-xs leading-snug text-white">
                        {item.title}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${item.title}`}
                        className="shrink-0 text-xs text-white/70 opacity-0 transition group-hover:opacity-100 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeEvent(item.id)
                        }}
                      >
                        ✕
                      </button>
                    </InteractionUI>
                  ))}

                  {composing ? (
                    <InteractionUI className="rounded-md bg-[var(--calendar-surface-strong)] p-2 ring-1 ring-[var(--calendar-accent)]">
                      <form className="flex flex-col gap-2" onSubmit={submitEvent}>
                        <input
                          autoFocus
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          placeholder="Event title"
                          className="w-full rounded border border-white/20 bg-black/30 px-2 py-1 text-xs text-white outline-none placeholder:text-white/45 focus:border-[var(--calendar-accent)]"
                        />
                        <div className="flex gap-1">
                          <button
                            type="submit"
                            className="rounded bg-[var(--calendar-accent)] px-2 py-1 text-xs font-medium text-black"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            className="rounded bg-white/10 px-2 py-1 text-xs text-white"
                            onClick={() => setDraftDateKey(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </InteractionUI>
                  ) : (
                    <InteractionUI
                      as="button"
                      onClick={() => openComposer(cell.dateKey!)}
                      className="rounded-md px-2 py-1 text-left text-xs text-white/80 ring-1 ring-transparent transition hover:bg-[var(--calendar-surface)] hover:ring-[var(--calendar-line)]"
                      aria-label={`Add event on ${cell.dateKey}`}
                    >
                      <span className="text-readable">+ Add</span>
                    </InteractionUI>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default CalendarGrid
