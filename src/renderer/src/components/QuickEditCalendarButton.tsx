import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { HOLIDAYS_KR_CALENDAR_ID } from '../../../shared/calendarDefaults'
import type { CalendarRecord } from '../../../shared/calendarTypes'
import { setIgnoreMouseEvents } from '../lib/mouseBridge'
import { InteractionUI } from './InteractionUI'

export type QuickEditCalendarButtonProps = {
  calendars: CalendarRecord[]
  value: string
  onChange: (calendarId: string) => void
  disabled?: boolean
  title?: string
  buttonClassName?: string
}

export function QuickEditCalendarButton({
  calendars,
  value,
  onChange,
  disabled = false,
  title = '캘린더 선택',
  buttonClassName
}: QuickEditCalendarButtonProps): ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<React.CSSProperties | undefined>()

  const editable = useMemo(
    () =>
      calendars.filter((c) => c.id !== HOLIDAYS_KR_CALENDAR_ID && c.visible !== false),
    [calendars]
  )
  const selected = editable.find((c) => c.id === value) ?? editable[0] ?? null

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  useEffect(() => {
    if (!open) return
    setIgnoreMouseEvents(false)
    const place = (): void => {
      const btn = rootRef.current?.querySelector('button')
      if (!btn) return
      const ar = btn.getBoundingClientRect()
      const width = 200
      const height = 180
      const left = Math.min(Math.max(8, ar.left), window.innerWidth - width - 8)
      const top = Math.min(Math.max(8, ar.bottom + 8), window.innerHeight - height - 8)
      setStyle({
        position: 'fixed',
        left,
        top,
        zIndex: 80
      })
    }
    place()
    const onDown = (e: PointerEvent): void => {
      const t = e.target
      if (!(t instanceof Element)) return
      if (t.closest('.quick-edit-calendar-root') || t.closest('.quick-edit-calendar-flyout')) return
      setOpen(false)
    }
    window.addEventListener('resize', place)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  return (
    <div ref={rootRef} className="quick-edit-calendar-root">
      <button
        type="button"
        className={['quick-edit-calendar-trigger', buttonClassName].filter(Boolean).join(' ')}
        title={title}
        aria-label={title}
        aria-expanded={open}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path
            fill="currentColor"
            d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"
          />
        </svg>
        {selected ? (
          <span
            className="quick-edit-calendar-trigger-dot"
            style={{ backgroundColor: selected.color }}
          />
        ) : null}
      </button>
      {open && !disabled
        ? createPortal(
            <InteractionUI
              className="quick-edit-calendar-flyout"
              style={style}
              role="listbox"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {editable.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`quick-edit-calendar-option${c.id === selected?.id ? ' is-active' : ''}`}
                  onClick={() => {
                    onChange(c.id)
                    setOpen(false)
                  }}
                >
                  <span className="quick-edit-calendar-swatch" style={{ backgroundColor: c.color }} />
                  <span className="quick-edit-calendar-name">{c.name}</span>
                </button>
              ))}
            </InteractionUI>,
            document.body
          )
        : null}
    </div>
  )
}

export default QuickEditCalendarButton
