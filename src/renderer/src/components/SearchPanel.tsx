import { useMemo, useState, type ReactElement } from 'react'
import { InteractionUI } from './InteractionUI'
import type { CalendarEvent } from './CalendarGrid'

export type SearchPanelProps = {
  open: boolean
  events: CalendarEvent[]
  onClose: () => void
  onSelect: (event: CalendarEvent) => void
}

export function SearchPanel({ open, events, onClose, onSelect }: SearchPanelProps): ReactElement | null {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return events.slice(0, 40)
    return events.filter((item) => item.title.toLowerCase().includes(q)).slice(0, 80)
  }, [events, query])

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
          placeholder="검색어 입력"
          aria-label="검색어 입력"
        />
        <p className="search-hint">제목으로 검색합니다. 결과를 클릭하면 해당 날짜로 이동합니다.</p>
        <ul className="search-results">
          {results.length === 0 ? (
            <li className="search-empty">검색 결과가 없습니다.</li>
          ) : (
            results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="search-result-item"
                  onClick={() => {
                    onSelect(item)
                    onClose()
                  }}
                >
                  <span className="search-result-date">{item.dateKey}</span>
                  <span className={`search-result-title${item.completed ? ' is-completed' : ''}`}>
                    {item.title}
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
