import type { CSSProperties, ReactElement } from 'react'
import { InteractionUI } from './InteractionUI'
import { EventDetailContent } from './EventDetailContent'
import type { CalendarEvent, CalendarRecord, TagRecord } from '../../../shared/calendarTypes'
import type { AnchorRect } from './DayQuickEditPopover'

export type EventPopoverProps = {
  event: CalendarEvent
  calendar?: CalendarRecord | null
  tags: TagRecord[]
  anchorRect: AnchorRect | null
  canEdit?: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleCompleted: (completed: boolean) => void
}

export function EventPopover({
  event,
  calendar,
  tags,
  anchorRect,
  canEdit = false,
  onClose,
  onEdit,
  onDelete,
  onToggleCompleted
}: EventPopoverProps): ReactElement {
  const style = anchorRect
    ? {
        top: Math.min(anchorRect.top + anchorRect.height + 6, window.innerHeight - 320),
        left: Math.min(Math.max(8, anchorRect.left), window.innerWidth - 360)
      }
    : { top: '20%', left: '50%', transform: 'translateX(-50%)' }

  return (
    <>
      <div className="event-popover-backdrop" onClick={onClose} role="presentation" />
      <InteractionUI className="event-popover" style={style as CSSProperties} role="dialog">
        <header className="event-popover-header">
          <button type="button" className="event-popover-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <EventDetailContent
          event={event}
          calendar={calendar}
          tags={tags}
          canEdit={canEdit}
          onToggleCompleted={onToggleCompleted}
        />
        {canEdit ? (
          <footer className="event-popover-actions">
            <button type="button" onClick={onEdit}>
              편집
            </button>
            <button type="button" className="is-danger" onClick={onDelete}>
              삭제
            </button>
          </footer>
        ) : null}
      </InteractionUI>
    </>
  )
}

export default EventPopover
