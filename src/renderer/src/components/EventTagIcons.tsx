import type { ReactElement } from 'react'
import type { CalendarEvent, TagRecord } from '../../../shared/calendarTypes'

export type EventTagIconsProps = {
  event: CalendarEvent
  tags: TagRecord[]
}

export function EventTagIcons({ event, tags }: EventTagIconsProps): ReactElement | null {
  const ids = event.tagIds ?? []
  if (!ids.length) return null
  const matched = tags.filter((tag) => ids.includes(tag.id)).slice(0, 3)
  if (!matched.length) return null
  return (
    <span className="event-tag-icons" aria-hidden>
      {matched.map((tag) => (
        <span
          key={tag.id}
          className="event-tag-icon"
          style={{ backgroundColor: tag.color || '#9aa0a6' }}
          title={tag.name}
        />
      ))}
    </span>
  )
}

export default EventTagIcons
