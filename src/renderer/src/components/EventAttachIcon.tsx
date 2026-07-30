import { useState, type MouseEvent, type ReactElement } from 'react'
import { getSeriesId } from '../../../shared/mdcExport/eventOccurrences.js'
import { openEventResourceListPanel } from '../lib/openEventResourceList'
import { cn } from '../lib/cn'
import type { CalendarEvent } from '../../../shared/calendarTypes'
import { EventResourceListDialog } from './EventResourceListDialog'

export type EventAttachIconProps = {
  event: CalendarEvent
  className?: string
  title?: string
}

export function EventAttachIcon({
  event,
  className,
  title
}: EventAttachIconProps): ReactElement | null {
  const [listOpen, setListOpen] = useState(false)
  const attachments = Array.isArray(event?.attachments) ? event.attachments : []
  if (attachments.length === 0) return null

  const count = attachments.length
  const eventId = getSeriesId(event) || event?.id
  const resolvedTitle =
    title ??
    (count > 1
      ? `첨부파일 ${count}개 (클릭: 목록에서 선택)`
      : '첨부파일 (클릭: 목록에서 열기)')

  return (
    <>
      <span
        className={cn('event-attach-icon', className)}
        role="button"
        tabIndex={-1}
        title={resolvedTitle}
        aria-label={resolvedTitle}
        onClick={(e: MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          if (!eventId) return
          void (async () => {
            const opened = await openEventResourceListPanel('attachments', eventId)
            if (!opened) setListOpen(true)
          })()
        }}
      >
        <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
          <path
            fill="currentColor"
            d="M16.5 6.5v10.25a4.25 4.25 0 0 1-8.5 0V6.75a2.75 2.75 0 0 1 5.5 0v9.5a1.25 1.25 0 0 1-2.5 0V7.5H9.5v8.75a2.75 2.75 0 0 0 5.5 0V6.75a4.25 4.25 0 0 0-8.5 0v10a5.75 5.75 0 0 0 11.5 0V6.5h-1.5z"
          />
        </svg>
      </span>
      {listOpen ? (
        <EventResourceListDialog
          type="attachments"
          event={event}
          surface="inline"
          onClose={() => setListOpen(false)}
        />
      ) : null}
    </>
  )
}

export default EventAttachIcon
