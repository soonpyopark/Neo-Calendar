import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import { clampFixedPosition } from '../lib/popoverPosition'
import { setIgnoreMouseEvents } from '../lib/mouseBridge'
import { blockPanelOutsideClose } from '../lib/recurrenceComplete'
import { shiftDateKey } from '../lib/shiftEventDates'
import DateInput from './DateInput'
import { InteractionUI } from './InteractionUI'

const FLYOUT_WIDTH = 260
const FLYOUT_HEIGHT = 120

export type EventCopyDateFlyoutProps = {
  open: boolean
  /** Default target date (usually occurrence + 1 day). */
  defaultDate: string
  anchorRef: RefObject<HTMLElement | null>
  busy?: boolean
  onClose: () => void
  onConfirm: (targetDate: string) => void | Promise<void>
}

/** Small date picker to copy an event onto another day. */
export function EventCopyDateFlyout({
  open,
  defaultDate,
  anchorRef,
  busy = false,
  onClose,
  onConfirm
}: EventCopyDateFlyoutProps): ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const [date, setDate] = useState(defaultDate)
  const [style, setStyle] = useState<CSSProperties | null>(null)

  useEffect(() => {
    if (!open) return
    setDate(defaultDate || shiftDateKey(new Date().toISOString().slice(0, 10), 1))
  }, [open, defaultDate])

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }
    const anchor = anchorRef.current?.getBoundingClientRect()
    const left = anchor ? anchor.left : 12
    const top = anchor ? anchor.bottom + 6 : 12
    const clamped = clampFixedPosition({
      left,
      top,
      width: FLYOUT_WIDTH,
      height: FLYOUT_HEIGHT,
      padding: 5
    })
    setStyle({
      position: 'fixed',
      left: clamped.left,
      top: clamped.top,
      width: clamped.width,
      zIndex: 120
    })
  }, [open, anchorRef])

  // Native <input type="date"> showPicker() paints outside the floating panel
  // footprint — keep main from treating those clicks as outside-dismiss.
  useEffect(() => {
    if (!open) return undefined
    const hold = (): void => blockPanelOutsideClose(500)
    hold()
    const id = window.setInterval(hold, 300)
    return () => window.clearInterval(id)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    const onPointer = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      // Chromium date picker UI is not in the page DOM while open.
      const active = document.activeElement
      if (
        active instanceof HTMLInputElement &&
        active.type === 'date' &&
        panelRef.current?.contains(active)
      ) {
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onPointer, true)
    }
  }, [open, onClose, anchorRef])

  if (!open || !style) return null

  return createPortal(
    <InteractionUI
      ref={panelRef}
      className="event-copy-date-flyout interaction-ui"
      style={style}
      role="dialog"
      aria-label="다른 날짜로 복사"
      onMouseDown={(event) => {
        event.stopPropagation()
        setIgnoreMouseEvents(false)
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="event-copy-date-flyout-title">복사할 날짜</p>
      <DateInput
        value={date}
        onChange={setDate}
        aria-label="복사 대상 날짜"
        disabled={busy}
      />
      <div className="event-copy-date-flyout-actions">
        <button
          type="button"
          className="event-copy-date-flyout-cancel"
          disabled={busy}
          onClick={onClose}
        >
          취소
        </button>
        <button
          type="button"
          className="event-copy-date-flyout-confirm"
          disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
          onClick={() => {
            void onConfirm(date)
          }}
        >
          {busy ? '복사 중…' : '복사'}
        </button>
      </div>
    </InteractionUI>,
    document.body
  )
}

export default EventCopyDateFlyout
