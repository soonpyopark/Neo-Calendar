import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement
} from 'react'
import { createPortal } from 'react-dom'
import { clampFixedPosition } from '../lib/popoverPosition'
import { setIgnoreMouseEvents } from '../lib/mouseBridge'
import {
  copyImageFromDataUrl,
  downloadImageFromDataUrl,
  sanitizeImageDownloadName
} from '../lib/imageClipboard'
import { useAppDialog } from './AppDialogProvider'

const MENU_WIDTH = 168
const MENU_HEIGHT = 76

export type ImageActionMenuState = {
  left: number
  top: number
  dataUrl: string
  filename: string
}

export function openImageActionMenuFromEvent(
  event: ReactMouseEvent | MouseEvent,
  payload: { dataUrl: string; filename: string }
): ImageActionMenuState | null {
  const dataUrl = String(payload.dataUrl ?? '').trim()
  if (!dataUrl) return null
  const pos = clampFixedPosition({
    left: event.clientX,
    top: event.clientY,
    width: MENU_WIDTH,
    height: MENU_HEIGHT,
    padding: 5
  })
  return {
    left: pos.left,
    top: pos.top,
    dataUrl,
    filename: sanitizeImageDownloadName(payload.filename)
  }
}

export type ImageActionMenuProps = {
  menu: ImageActionMenuState | null
  onClose: () => void
}

/** Right-click flyout: clipboard copy + download for an image data URL. */
export function ImageActionMenu({ menu, onClose }: ImageActionMenuProps): ReactElement | null {
  const { alert } = useAppDialog()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return undefined
    const close = (event?: Event): void => {
      if (event?.target instanceof Node && menuRef.current?.contains(event.target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
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
  }, [menu, onClose])

  if (!menu) return null

  return createPortal(
    <div
      ref={menuRef}
      className="interaction-ui event-detail-copy-menu fixed z-[130]"
      style={{ left: menu.left, top: menu.top, width: MENU_WIDTH }}
      role="menu"
      aria-label="이미지 작업"
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
          void (async () => {
            try {
              await copyImageFromDataUrl(menu.dataUrl)
              onClose()
            } catch (error) {
              onClose()
              await alert(error instanceof Error ? error.message : '클립보드 복사에 실패했습니다.')
            }
          })()
        }}
      >
        <span>클립보드 복사</span>
        <kbd>Ctrl+C</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        className="event-detail-copy-menu-item"
        onClick={() => {
          try {
            downloadImageFromDataUrl(menu.dataUrl, menu.filename)
            onClose()
          } catch (error) {
            onClose()
            void alert(error instanceof Error ? error.message : '다운로드에 실패했습니다.')
          }
        }}
      >
        <span>다운로드</span>
      </button>
    </div>,
    document.body
  )
}

/** Hook for components that host an image and need context-menu + Ctrl+C. */
export function useImageActionMenu(): {
  menu: ImageActionMenuState | null
  closeMenu: () => void
  openMenu: (
    event: ReactMouseEvent | MouseEvent,
    payload: { dataUrl: string; filename: string }
  ) => void
  copyCurrent: (payload: { dataUrl: string; filename?: string } | null) => Promise<boolean>
  Menu: ReactElement | null
} {
  const { alert } = useAppDialog()
  const [menu, setMenu] = useState<ImageActionMenuState | null>(null)
  const closeMenu = (): void => setMenu(null)

  return {
    menu,
    closeMenu,
    openMenu: (event, payload) => {
      event.preventDefault()
      event.stopPropagation()
      const next = openImageActionMenuFromEvent(event, payload)
      if (next) setMenu(next)
    },
    copyCurrent: async (payload) => {
      if (!payload?.dataUrl) return false
      try {
        await copyImageFromDataUrl(payload.dataUrl)
        return true
      } catch (error) {
        await alert(error instanceof Error ? error.message : '클립보드 복사에 실패했습니다.')
        return false
      }
    },
    Menu: <ImageActionMenu menu={menu} onClose={closeMenu} />
  }
}
