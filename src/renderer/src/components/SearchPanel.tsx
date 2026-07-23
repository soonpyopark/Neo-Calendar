import { useMemo, useState, type ReactElement } from 'react'
import { InteractionUI } from './InteractionUI'
import {
  getDefaultSearchRange,
  normalizeSearchRange,
  searchEvents,
  type SearchHit
} from '../lib/searchEvents'
import type { CalendarEvent, CalendarRecord, TagRecord } from '../../../shared/calendarTypes'

export type SearchPanelProps = {
  open: boolean
  events: CalendarEvent[]
  calendars: CalendarRecord[]
  tags: TagRecord[]
  onClose: () => void
  onSelect: (event: CalendarEvent) => void
}

export function SearchPanel({
  open,
  events,
  calendars,
  tags,
  onClose,
  onSelect
}: SearchPanelProps): ReactElement | null {
  const defaults = useMemo(() => getDefaultSearchRange(), [])
  const [query, setQuery] = useState('')
  const [rangeStart, setRangeStart] = useState(defaults.start)
  const [rangeEnd, setRangeEnd] = useState(defaults.end)

  const results = useMemo((): SearchHit[] => {
    const range = normalizeSearchRange(rangeStart, rangeEnd)
    const q = query.trim()
    if (!q) {
      return events
        .filter((e) => {
          const day = e.occurrenceDate || e.startDate
          return day >= range.start && day <= range.end
        })
        .slice(0, 40)
        .map((e) => ({
          ...e,
          occurrenceDate: e.occurrenceDate || e.startDate,
          calendarName: calendars.find((c) => c.id === e.calendarId)?.name
        }))
    }
    return searchEvents({ events, calendars, tags, query: q, range, limit: 80 })
  }, [events, calendars, tags, query, rangeStart, rangeEnd])

  if (!open) return null

  return (
    <div className="panel-backdrop interaction-ui" role="presentation" onClick={onClose}>
      <InteractionUI
        className="panel-card search-panel"
        role="dialog"
        aria-label="일정 검색"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-card-header">
          <h2>검색</h2>
          <button type="button" className="panel-close" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <input
          autoFocus
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목, 설명, 태그, 캘린더, 링크…"
          aria-label="검색어 입력"
        />
        <div className="search-range-row">
          <label>
            시작
            <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
          </label>
          <label>
            종료
            <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
          </label>
        </div>
        <p className="search-hint">결과를 클릭하면 해당 날짜로 이동합니다.</p>
        <ul className="search-results">
          {results.length === 0 ? (
            <li className="search-empty">검색 결과가 없습니다.</li>
          ) : (
            results.map((item) => (
              <li key={`${item.id}-${item.occurrenceDate}`}>
                <button
                  type="button"
                  className="search-result-item"
                  onClick={() => {
                    onSelect(item)
                    onClose()
                  }}
                >
                  <span className="search-result-date">{item.occurrenceDate}</span>
                  <span className={`search-result-title${item.completed ? ' is-completed' : ''}`}>
                    {item.title}
                    {item.calendarName ? (
                      <span className="search-result-cal"> · {item.calendarName}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </InteractionUI>
    </div>
  )
}

export default SearchPanel
