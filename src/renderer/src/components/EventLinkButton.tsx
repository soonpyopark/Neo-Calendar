import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { EventLink } from '../../../shared/calendarTypes'
import { appendEventLink, normalizeEventLinkUrl, normalizeEventLinksArray } from '../lib/eventLinks'

export type EventLinkButtonProps = {
  links?: EventLink[]
  onChange: (links: EventLink[]) => void
  disabled?: boolean
  title?: string
}

export function EventLinkButton({
  links = [],
  onChange,
  disabled = false,
  title = '바로가기 추가'
}: EventLinkButtonProps): ReactElement {
  const resolved = normalizeEventLinksArray(links)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<React.CSSProperties | undefined>()
  const hasLink = resolved.length > 0

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  useEffect(() => {
    if (open) setDraft('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const place = (): void => {
      const btn = rootRef.current?.querySelector('button')
      if (!btn) return
      const ar = btn.getBoundingClientRect()
      setStyle({
        position: 'fixed',
        left: Math.min(ar.left, window.innerWidth - 300),
        top: Math.min(ar.bottom + 8, window.innerHeight - 180),
        zIndex: 80
      })
    }
    place()
    const onDown = (e: PointerEvent): void => {
      const t = e.target
      if (!(t instanceof Element)) return
      if (t.closest('.event-link-picker-root') || t.closest('.event-link-flyout')) return
      setOpen(false)
    }
    window.addEventListener('resize', place)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  const addDraft = (e?: FormEvent): void => {
    e?.preventDefault()
    const url = normalizeEventLinkUrl(draft)
    if (!url) return
    onChange(appendEventLink(resolved, url))
    setDraft('')
  }

  return (
    <div ref={rootRef} className="event-link-picker-root">
      <button
        type="button"
        className={`event-link-picker-trigger${hasLink ? ' has-link' : ''}`}
        title={title}
        aria-label={title}
        aria-expanded={open}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!disabled) setOpen((v) => !v)
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path
            fill="currentColor"
            d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
          />
        </svg>
        {hasLink ? <span className="event-link-picker-badge">{resolved.length > 9 ? '9+' : resolved.length}</span> : null}
      </button>
      {open && !disabled
        ? createPortal(
            <div className="event-link-flyout" style={style} onClick={(e) => e.stopPropagation()}>
              <form className="event-link-flyout-form" onSubmit={addDraft}>
                <input
                  type="url"
                  className="event-link-flyout-input"
                  placeholder="https://"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="event-link-flyout-add">
                  추가
                </button>
              </form>
              <ul className="event-link-flyout-list">
                {resolved.length === 0 ? (
                  <li className="event-link-flyout-empty">등록된 바로가기가 없습니다</li>
                ) : (
                  resolved.map((item) => (
                    <li key={item.id} className="event-link-flyout-item">
                      <a href={item.url} target="_blank" rel="noreferrer" className="event-link-flyout-url">
                        {item.url}
                      </a>
                      <button
                        type="button"
                        className="event-link-flyout-remove"
                        aria-label="삭제"
                        onClick={() => onChange(resolved.filter((link) => link.id !== item.id))}
                      >
                        ×
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

export default EventLinkButton
