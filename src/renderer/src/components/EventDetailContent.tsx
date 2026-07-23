import type { ReactElement } from 'react'
import type { CalendarEvent, CalendarRecord, TagRecord } from '../../../shared/calendarTypes'

export type EventDetailContentProps = {
  event: CalendarEvent
  calendar?: CalendarRecord | null
  tags: TagRecord[]
  canEdit?: boolean
  onToggleCompleted?: (completed: boolean) => void
}

export function EventDetailContent({
  event,
  calendar,
  tags,
  canEdit = false,
  onToggleCompleted
}: EventDetailContentProps): ReactElement {
  const day = event.occurrenceDate || event.startDate
  const tagList = tags.filter((t) => event.tagIds?.includes(t.id))
  const links = event.links?.length
    ? event.links
    : event.link
      ? [{ id: 'legacy', url: event.link, title: event.link }]
      : []

  return (
    <div className="event-detail-content">
      <div className="event-detail-title-row">
        <span
          className="event-detail-swatch"
          style={{ background: event.color || calendar?.color || '#f6bf26' }}
        />
        <h3 className="event-detail-title">{event.title}</h3>
      </div>
      <p className="event-detail-meta">
        {day}
        {event.endDate && event.endDate !== event.startDate ? ` ~ ${event.endDate}` : ''}
        {!event.allDay && event.startTime ? ` · ${event.startTime}` : ' · 종일'}
        {calendar ? ` · ${calendar.name}` : ''}
      </p>
      {canEdit ? (
        <label className="event-detail-check">
          <input
            type="checkbox"
            checked={Boolean(event.completed)}
            onChange={(e) => onToggleCompleted?.(e.target.checked)}
          />
          완료
        </label>
      ) : event.completed ? (
        <p className="event-detail-meta">완료됨</p>
      ) : null}
      {event.description ? <p className="event-detail-desc">{event.description}</p> : null}
      {tagList.length > 0 ? (
        <div className="event-detail-tags">
          {tagList.map((t) => (
            <span key={t.id} className="event-tag-chip" style={{ background: t.color }}>
              {t.name}
            </span>
          ))}
        </div>
      ) : null}
      {links.length > 0 ? (
        <ul className="event-detail-links">
          {links.map((l) => (
            <li key={l.id}>
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.title || l.url}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {(event.attachments?.length ?? 0) > 0 ? (
        <ul className="event-detail-attachments">
          {event.attachments!.map((a) => (
            <li key={a.id}>{a.name}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default EventDetailContent
