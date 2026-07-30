import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactElement
} from 'react'
import { createPortal } from 'react-dom'
import type { EventLink } from '../../../shared/calendarTypes'
import {
  appendEventLink,
  normalizeEventLinkUrl,
  normalizeEventLinksArray
} from '../lib/eventLinks'
import { clampFixedPosition } from '../lib/popoverPosition'
import { setIgnoreMouseEvents } from '../lib/mouseBridge'
import { InteractionUI } from './InteractionUI'
import { LinkChainIcon } from './LinkChainIcon'

const FLYOUT_GAP = 8
const VIEWPORT_PAD = 5

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
  const flyoutRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<CSSProperties | undefined>()
  const hasLink = resolved.length > 0

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  useEffect(() => {
    if (open) setDraft('')
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      setStyle(undefined)
      return
    }
    setIgnoreMouseEvents(false)

    const place = (): void => {
      const btn = rootRef.current?.querySelector('button')
      if (!btn) return
      const ar = btn.getBoundingClientRect()
      // Match color-palette left: align to the day-color trigger in the same footer.
      const footerLeft = btn.closest('.day-quick-edit-footer-left')
      const colorTrigger = footerLeft?.querySelector(
        '.day-quick-edit-color-trigger'
      ) as HTMLElement | null
      const alignLeft = (colorTrigger?.getBoundingClientRect() ?? ar).left
      const footer = btn.closest('.day-quick-edit-footer')?.getBoundingClientRect()
      const flyout = flyoutRef.current
      const width = flyout?.offsetWidth || Math.min(280, window.innerWidth - VIEWPORT_PAD * 2)
      const height = flyout?.offsetHeight || 120
      let left = alignLeft
      let top = (footer?.top ?? ar.top) - height - FLYOUT_GAP
      if (top < VIEWPORT_PAD) top = ar.bottom + FLYOUT_GAP
      const clamped = clampFixedPosition({
        left,
        top,
        width,
        height,
        padding: VIEWPORT_PAD
      })
      setStyle({
        position: 'fixed',
        left: Math.round(clamped.left),
        top: Math.round(clamped.top),
        zIndex: 80
      })
    }

    place()
    // Remeasure after layout — height depends on empty vs listed links.
    const raf = requestAnimationFrame(place)

    const onDown = (e: PointerEvent): void => {
      const t = e.target
      if (!(t instanceof Element)) return
      if (t.closest('.event-link-picker-root') || t.closest('.event-link-flyout')) return
      setOpen(false)
    }
    window.addEventListener('resize', place)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open, resolved.length])

  const addDraft = (e?: FormEvent): void => {
    e?.preventDefault()
    const form = e?.currentTarget
    const input =
      form instanceof HTMLFormElement
        ? form.elements.namedItem('event-link-url')
        : null
    const url = normalizeEventLinkUrl(draft)
    if (!url) {
      if (input instanceof HTMLInputElement) {
        input.setCustomValidity('올바른 URL을 입력하세요. 예: example.com 또는 https://example.com')
        input.reportValidity()
        input.setCustomValidity('')
      }
      return
    }
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
        <LinkChainIcon size={16} />
        {hasLink ? <span className="event-link-picker-badge">{resolved.length > 9 ? '9+' : resolved.length}</span> : null}
      </button>
      {open && !disabled
        ? createPortal(
            <InteractionUI
              ref={flyoutRef}
              className="event-link-flyout"
              style={style}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <form className="event-link-flyout-form" onSubmit={addDraft}>
                <input
                  type="text"
                  name="event-link-url"
                  className="event-link-flyout-input"
                  placeholder="example.com"
                  value={draft}
                  onChange={(e) => {
                    e.target.setCustomValidity('')
                    setDraft(e.target.value)
                  }}
                  autoFocus
                />
                <button type="submit" className="event-link-flyout-add" disabled={!draft.trim()}>
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
            </InteractionUI>,
            document.body
          )
        : null}
    </div>
  )
}

export default EventLinkButton
