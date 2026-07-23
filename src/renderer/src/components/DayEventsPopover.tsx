import type { CSSProperties, ReactElement } from 'react'
import { InteractionUI } from './InteractionUI'
import type { CalendarEvent, CalendarRecord, TagRecord } from '../../../shared/calendarTypes'
import type { AnchorRect } from './DayQuickEditPopover'

export type DayEventsPopoverProps = {
  dateKey: string
  events: CalendarEvent[]
  calendarsById: Map<string, CalendarRecord>
  tags: TagRecord[]
  anchorRect: AnchorRect | null
  canEdit?: boolean
  onClose: () => void
  onSelect: (event: CalendarEvent, rect: AnchorRect | null) => void
  onEdit: (event: CalendarEvent) => void
}

export function DayEventsPopover({
  dateKey,
  events,
  calendarsById,
  anchorRect,
  onClose,
  onSelect,
  onEdit
}: DayEventsPopoverProps): ReactElement {
  const style: CSSProperties = anchorRect
    ? {
        top: Math.min(anchorRect.top + 8, window.innerHeight - 280),
        left: Math.min(Math.max(8, anchorRect.left), window.innerWidth - 300),
        width: Math.max(anchorRect.width, 260)
      }
    : { top: '25%', left: '50%', transform: 'translateX(-50%)', width: 280 }

  return (
    <>
      <div className="day-events-popover-backdrop" onClick={onClose} role="presentation" />
      <InteractionUI className="day-events-popover" style={style} role="dialog" aria-label={`${dateKey} 일정 목록`}>
        <header className="day-events-popover-header">
          <h3>{dateKey}</h3>
          <button type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <ul className="day-events-popover-list">
          {events.length === 0 ? (
            <li className="day-quick-edit-empty">등록된 일정이 없습니다</li>
          ) : (
            events.map((item) => {
              const cal = calendarsById.get(item.calendarId)
              const color = item.color || cal?.color || '#f6bf26'
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`day-events-popover-row${item.completed ? ' is-completed' : ''}`}
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      onSelect(item, {
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height
                      })
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onEdit(item)
                    }}
                  >
                    <span className="day-quick-edit-dot" style={{ backgroundColor: color }} />
                    <span className="day-quick-edit-item-title">{item.title}</span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </InteractionUI>
    </>
  )
}

export default DayEventsPopover
