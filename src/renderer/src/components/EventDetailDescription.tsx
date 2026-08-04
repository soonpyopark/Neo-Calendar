import {
  useEffect,
  useRef,
  useState,
  type ReactElement
} from 'react'
import { createPortal } from 'react-dom'
import { clampFixedPosition } from '../lib/popoverPosition'
import { setIgnoreMouseEvents } from '../lib/mouseBridge'
import { LinkifiedText } from './LinkifiedText'

const MENU_WIDTH = 128
const MENU_HEIGHT = 40

async function writeClipboardText(text: string): Promise<void> {
  const value = text.trimEnd()
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    const el = document.createElement('textarea')
    el.value = value
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
}

function getSelectedTextIn(container: HTMLElement | null): string {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !container) return ''
  const { anchorNode, focusNode } = sel
  if (!anchorNode || !container.contains(anchorNode)) return ''
  if (focusNode && !container.contains(focusNode)) return ''
  return sel.toString()
}

export type EventDetailDescriptionProps = {
  text: string
}

/** Selectable event description with Ctrl+C / right-click copy. */
export function EventDetailDescription({ text }: EventDetailDescriptionProps): ReactElement {
  const rootRef = useRef<HTMLParagraphElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ left: number; top: number; text: string } | null>(null)

  useEffect(() => {
    if (!menu) return undefined
    const close = (event?: Event): void => {
      if (
        event?.target instanceof Node &&
        menuRef.current?.contains(event.target)
      ) {
        return
      }
      setMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', close, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  return (
    <>
      <p
        ref={rootRef}
        className="event-detail-description mt-3 w-full max-w-full overflow-x-hidden whitespace-pre-wrap break-all text-sm leading-relaxed text-gcal-body"
        title="드래그로 선택 후 Ctrl+C 또는 우클릭으로 복사"
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const selected = getSelectedTextIn(rootRef.current)
          const copyText = selected || text
          if (!copyText.trim()) return
          const pos = clampFixedPosition({
            left: event.clientX,
            top: event.clientY,
            width: MENU_WIDTH,
            height: MENU_HEIGHT,
            padding: 5
          })
          setMenu({ left: pos.left, top: pos.top, text: copyText })
        }}
      >
        <LinkifiedText text={text} />
      </p>
      {menu
        ? createPortal(
            <div
              ref={menuRef}
              className="interaction-ui event-detail-copy-menu fixed z-[120]"
              style={{ left: menu.left, top: menu.top, width: MENU_WIDTH }}
              role="menu"
              aria-label="설명 복사"
              onMouseDown={(event) => {
                event.stopPropagation()
                setIgnoreMouseEvents(false)
              }}
              onMouseEnter={() => setIgnoreMouseEvents(false)}
            >
              <button
                type="button"
                role="menuitem"
                className="event-detail-copy-menu-item"
                onClick={() => {
                  void writeClipboardText(menu.text)
                  setMenu(null)
                }}
              >
                <span>복사</span>
                <kbd>Ctrl+C</kbd>
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  )
}

export default EventDetailDescription
