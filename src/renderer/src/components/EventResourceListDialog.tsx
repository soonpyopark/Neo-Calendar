import { useEffect, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { getSeriesId } from '../../../shared/mdcExport/eventOccurrences.js'
import type { CalendarEvent, EventLink } from '../../../shared/calendarTypes'
import { getEventLinks } from '../lib/eventLinks'
import { openExternalUrl } from '../lib/openExternal'
import { cn } from '../lib/cn'
import { useOpenAttachment } from './AttachmentViewerProvider'
import { InteractionUI } from './InteractionUI'
import { LinkChainIcon } from './LinkChainIcon'

export type EventResourceListKind = 'links' | 'attachments'

export type EventResourceListDialogProps = {
  type: EventResourceListKind
  event: CalendarEvent
  onClose: () => void
  /**
   * `floating` — own BrowserWindow (fills the panel shell).
   * `inline` — portaled overlay (browser / fallback when panels are unavailable).
   */
  surface?: 'inline' | 'floating'
}

function LinkGlyph({ className }: { className?: string }): ReactElement {
  return <LinkChainIcon size={16} className={className} />
}

function AttachGlyph({ className }: { className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.5 6.5v10.25a4.25 4.25 0 0 1-8.5 0V6.75a2.75 2.75 0 0 1 5.5 0v9.5a1.25 1.25 0 0 1-2.5 0V7.5H9.5v8.75a2.75 2.75 0 0 0 5.5 0V6.75a4.25 4.25 0 0 0-8.5 0v10a5.75 5.75 0 0 0 11.5 0V6.5h-1.5z"
      />
    </svg>
  )
}

/**
 * Chooser for an event's links or attachments.
 * Prefer the floating panel window; `inline` is the browser / no-panel fallback.
 */
export function EventResourceListDialog({
  type,
  event,
  onClose,
  surface = 'inline'
}: EventResourceListDialogProps): ReactElement {
  const isFloating = surface === 'floating'
  const openAttachment = useOpenAttachment()
  const isLinks = type === 'links'
  const links = getEventLinks(event)
  const attachments = Array.isArray(event.attachments) ? event.attachments : []
  const items = isLinks ? links : attachments
  const eventId = getSeriesId(event) || event?.id
  const title = isLinks ? '링크 목록' : '첨부파일 목록'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const shell = (
    <div
      className={cn(
        'neo-modal-shell overflow-hidden',
        isFloating ? 'flex h-full w-full flex-col rounded-xl' : 'w-full max-w-md'
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={isFloating ? undefined : (event) => event.stopPropagation()}
    >
      <div className="neo-modal-shell-header flex flex-shrink-0 items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-gcal-heading">
          {title}
          <span className="ml-1.5 font-normal text-gcal-muted">({items.length})</span>
        </h2>
        <button
          type="button"
          className="rounded-full px-2.5 py-1 text-sm font-medium text-gcal-blue transition-colors hover:bg-gcal-blue-soft"
          onClick={() => {
            window.neoCalendar?.blockPanelOutsideClose?.(450)
            onClose()
          }}
        >
          닫기
        </button>
      </div>
      <ul
        className={cn(
          'settings-scroll space-y-1.5 overflow-y-auto p-3',
          isFloating ? 'min-h-0 flex-1' : 'max-h-[min(50vh,360px)]'
        )}
      >
        {items.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-gcal-muted">항목이 없습니다.</li>
        ) : null}
        {isLinks
          ? (links as EventLink[]).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 rounded-lg border border-gcal-border-light bg-gcal-page px-3 py-2.5 text-left transition-colors hover:bg-gcal-surface"
                  onClick={(clickEvent) => {
                    clickEvent.preventDefault()
                    clickEvent.stopPropagation()
                    window.neoCalendar?.blockPanelOutsideClose?.(800)
                    void openExternalUrl(item.url)
                  }}
                >
                  <LinkGlyph className="mt-0.5 shrink-0 text-sky-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gcal-heading">
                      {item.title || item.url}
                    </span>
                    {item.title ? (
                      <span className="mt-0.5 block truncate text-xs text-gcal-muted">
                        {item.url}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))
          : attachments.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-gcal-border-light bg-gcal-page px-3 py-2.5 text-left transition-colors hover:bg-gcal-surface disabled:opacity-50"
                  disabled={!eventId || !item?.id}
                  onClick={(clickEvent) => {
                    clickEvent.preventDefault()
                    clickEvent.stopPropagation()
                    if (!eventId || !item?.id) return
                    window.neoCalendar?.blockPanelOutsideClose?.(800)
                    void openAttachment(eventId, item.id)
                  }}
                >
                  <AttachGlyph className="shrink-0 text-sky-500" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gcal-heading">
                    {item.name || '(파일)'}
                  </span>
                </button>
              </li>
            ))}
      </ul>
    </div>
  )

  if (isFloating) {
    return (
      <InteractionUI className="event-resource-list-root flex h-full w-full p-0" role="presentation">
        {shell}
      </InteractionUI>
    )
  }

  const overlay = (
    <InteractionUI
      className="event-resource-list-root fixed inset-0 z-[90] flex items-center justify-center bg-transparent px-4"
      role="presentation"
      onClick={() => {
        window.neoCalendar?.blockPanelOutsideClose?.(450)
        onClose()
      }}
    >
      {shell}
    </InteractionUI>
  )

  return createPortal(overlay, document.body)
}
