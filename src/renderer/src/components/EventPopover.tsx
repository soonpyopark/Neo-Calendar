import {
  useEffect,
  type CSSProperties,
  type ReactElement,
  type RefObject
} from 'react'
import { useAppDialog } from './AppDialogProvider'
import { EventDetailCalendarFooter, EventDetailContent } from './EventDetailContent'
import {
  getAnchoredPopoverPosition,
  getCenteredPanelStyle,
  resolvePopoverAnchor,
  useAnchoredPopoverStyle
} from '../lib/popoverPosition'
import { setIgnoreMouseEvents } from '../lib/mouseBridge'
import type { CalendarEvent, CalendarRecord, TagRecord } from '../../../shared/calendarTypes'
import type { AnchorRect } from './DayQuickEditPopover'

const toolbarBtnClass =
  'inline-flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-gcal-muted transition-colors hover:bg-gcal-surface-2 hover:text-gcal-heading'

export type EventPopoverAnchor = AnchorRect | { x: number; y: number } | null

export type EventPopoverProps = {
  event: CalendarEvent
  calendar?: CalendarRecord | null
  tags?: TagRecord[]
  dayKey?: string
  anchorRect: EventPopoverAnchor
  surface?: 'inline' | 'floating'
  canEdit?: boolean
  onClose: () => void
  onEdit: (event: CalendarEvent) => void
  onDelete: (event: CalendarEvent) => void
  onToggleCompleted?: (event: CalendarEvent, completed: boolean) => void
}

export function EventPopover({
  event,
  calendar,
  tags = [],
  dayKey,
  anchorRect,
  surface = 'inline',
  canEdit = false,
  onClose,
  onEdit,
  onDelete,
  onToggleCompleted
}: EventPopoverProps): ReactElement | null {
  const isFloating = surface === 'floating'
  const { confirm } = useAppDialog()
  const popoverOptions = { width: 418, estimatedHeight: 360, padding: 12 }
  const resolvedAnchor = resolvePopoverAnchor(anchorRect)
  const { ref, style: anchoredStyle } = useAnchoredPopoverStyle(anchorRect, popoverOptions)

  useEffect(() => {
    if (!event || isFloating) return undefined
    const handlePointerDown = (e: MouseEvent): void => {
      const target = e.target
      if (!(target instanceof Node)) return
      const panel = ref.current as HTMLElement | null
      if (panel?.contains(target)) return
      if (target instanceof Element && target.closest('.day-events-popover')) return
      if (target instanceof Element && target.closest('.app-dialog-root')) return
      onClose()
    }
    document.addEventListener('mousedown', handlePointerDown, true)
    return () => document.removeEventListener('mousedown', handlePointerDown, true)
  }, [event, isFloating, onClose, ref])

  if (!event) return null

  const completed = Boolean(event.completed)

  const handleDeleteClick = (): void => {
    void (async () => {
      const ok = await confirm('이 일정을 정말 삭제하시겠습니까?', {
        variant: 'danger',
        confirmLabel: '삭제'
      })
      if (!ok) return
      onDelete(event)
    })()
  }

  const panelStyle = isFloating
    ? ({ top: 0, left: 0, width: '100%', height: '100%' } as CSSProperties)
    : resolvedAnchor
      ? (anchoredStyle ??
        getAnchoredPopoverPosition(resolvedAnchor.rect, {
          ...popoverOptions,
          anchorMode: resolvedAnchor.mode
        }))
      : getCenteredPanelStyle({ padding: 16, maxWidth: 418 })

  return (
    <div
      className={
        isFloating
          ? 'h-full w-full'
          : anchorRect
            ? 'pointer-events-none fixed inset-0 z-[50]'
            : 'pointer-events-none fixed inset-0 z-[50] flex items-center justify-center overflow-y-auto p-4'
      }
      role="presentation"
    >
      <div
        ref={ref as RefObject<HTMLDivElement | null>}
        className={`interaction-ui event-detail-shell ${isFloating || resolvedAnchor ? 'fixed' : 'relative'} pointer-events-auto z-[51] flex w-[418px] max-w-full flex-col overflow-hidden rounded-xl bg-gcal-surface${isFloating ? '' : ' shadow-g-lg'} ${isFloating ? 'h-full w-full max-w-none' : ''}`}
        style={panelStyle as CSSProperties}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={isFloating ? undefined : () => setIgnoreMouseEvents(false)}
        onMouseLeave={
          isFloating ? undefined : () => setIgnoreMouseEvents(true, { forwardToOverlay: true })
        }
        role="dialog"
        aria-label="일정 상세"
      >
        <div className="search-panel-line-b flex shrink-0 items-center justify-between gap-2 pl-5 pr-3 pt-2">
          <label
            className="inline-flex h-[34px] cursor-pointer items-center"
            title={completed ? '완료 해제' : '완료로 표시'}
          >
            <input
              type="checkbox"
              className="event-popover-check"
              checked={completed}
              disabled={!canEdit}
              aria-label={completed ? '완료 해제' : '완료로 표시'}
              onChange={(e) => {
                if (!canEdit) return
                void onToggleCompleted?.(event, e.target.checked)
              }}
            />
          </label>
          <div className="flex items-center gap-0.5">
            {canEdit ? (
              <>
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => onEdit(event)}
                  aria-label="수정"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={handleDeleteClick}
                  aria-label="삭제"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                    />
                  </svg>
                </button>
              </>
            ) : null}
            <button type="button" className={toolbarBtnClass} onClick={onClose} aria-label="닫기">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>
        </div>

        <div
          className={`settings-scroll min-h-0 flex-1 overflow-y-auto px-5 pt-1${isFloating ? ' pb-0' : ' pb-5'}`}
        >
          <EventDetailContent
            event={event}
            calendar={calendar}
            dayKey={dayKey}
            tags={tags}
            hideCalendarFooter={isFloating}
            onTitleDoubleClick={canEdit ? () => onEdit(event) : undefined}
          />
        </div>
        {isFloating ? (
          <div className="shrink-0 px-5 pb-4">
            <EventDetailCalendarFooter calendar={calendar} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default EventPopover
