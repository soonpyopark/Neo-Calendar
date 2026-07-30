import { useState, type MouseEvent, type ReactElement } from 'react'
import { getSeriesId } from '../../../shared/mdcExport/eventOccurrences.js'
import {
  getEventLinks,
  getPrimaryEventLinkUrl,
  normalizeEventLinkUrl
} from '../lib/eventLinks'
import { openExternalUrl } from '../lib/openExternal'
import { openEventResourceListPanel } from '../lib/openEventResourceList'
import { cn } from '../lib/cn'
import type { CalendarEvent } from '../../../shared/calendarTypes'
import { EventResourceListDialog } from './EventResourceListDialog'
import { LinkChainIcon } from './LinkChainIcon'

export type EventLinkIconProps = {
  event?: CalendarEvent | null
  url?: string
  className?: string
  title?: string
}

export function EventLinkIcon({
  event,
  url,
  className,
  title
}: EventLinkIconProps): ReactElement | null {
  const [listOpen, setListOpen] = useState(false)
  const links = event
    ? getEventLinks(event)
    : normalizeEventLinkUrl(url ?? '')
      ? [{ url: normalizeEventLinkUrl(url ?? '') }]
      : []
  const href = links[0]?.url || getPrimaryEventLinkUrl(event) || normalizeEventLinkUrl(url ?? '')
  if (!href) return null

  const count = links.length
  const canShowList = Boolean(event)
  const eventId = event ? getSeriesId(event) || event.id : ''
  const resolvedTitle =
    title ??
    (canShowList
      ? count > 1
        ? `바로가기 ${count}개 (클릭: 목록에서 선택)`
        : '바로가기 (클릭: 목록에서 열기)'
      : '바로가기 열기')

  return (
    <>
      <span
        className={cn('event-link-icon', className)}
        role="button"
        tabIndex={-1}
        title={resolvedTitle}
        aria-label={resolvedTitle}
        onClick={(e: MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          if (!canShowList || !eventId) {
            void openExternalUrl(href)
            return
          }
          void (async () => {
            const opened = await openEventResourceListPanel('links', eventId)
            if (!opened) setListOpen(true)
          })()
        }}
      >
        <LinkChainIcon size={11} />
      </span>
      {listOpen && event ? (
        <EventResourceListDialog
          type="links"
          event={event}
          surface="inline"
          onClose={() => setListOpen(false)}
        />
      ) : null}
    </>
  )
}

export default EventLinkIcon
