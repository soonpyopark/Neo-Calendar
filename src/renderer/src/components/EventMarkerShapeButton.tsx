import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement
} from 'react'
import { createPortal } from 'react-dom'
import { InteractionUI } from './InteractionUI'
import { EventMarkerShapePicker } from './EventMarkerShapePicker'

const PANEL_PAD = 8
const PANEL_FALLBACK_WIDTH = 130
const PANEL_FALLBACK_HEIGHT = 130

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

function ListIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"
      />
    </svg>
  )
}

function resolveBounds(anchorEl: HTMLElement | null): {
  left: number
  top: number
  right: number
  bottom: number
} {
  const host = anchorEl?.closest('[role="dialog"]') ?? null
  if (host) {
    const rect = host.getBoundingClientRect()
    return {
      left: rect.left + PANEL_PAD,
      top: rect.top + PANEL_PAD,
      right: rect.right - PANEL_PAD,
      bottom: rect.bottom - PANEL_PAD
    }
  }
  return {
    left: PANEL_PAD,
    top: PANEL_PAD,
    right: window.innerWidth - PANEL_PAD,
    bottom: window.innerHeight - PANEL_PAD
  }
}

export type EventMarkerShapeButtonProps = {
  value?: string | null
  color?: string
  onChange: (shapeId: string) => void
  className?: string
  buttonClassName?: string
  title?: string
  disabled?: boolean
}

/**
 * MDC EventMarkerShapeButton — trigger + portaled shape grid.
 * Portal is wrapped in InteractionUI so desktop click-through still receives clicks.
 */
export function EventMarkerShapeButton({
  value,
  color = '#1a73e8',
  onChange,
  className,
  buttonClassName,
  title = '일정 표시 도형',
  disabled = false
}: EventMarkerShapeButtonProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelId = useId()

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null)
      return undefined
    }

    const place = (): void => {
      const anchor = rootRef.current?.querySelector('button')
      const panel = panelRef.current
      if (!anchor) return

      const bounds = resolveBounds(rootRef.current)
      const ar = anchor.getBoundingClientRect()
      const width = panel?.offsetWidth || PANEL_FALLBACK_WIDTH
      const height = panel?.offsetHeight || PANEL_FALLBACK_HEIGHT

      let left = ar.left
      let top = ar.bottom + PANEL_PAD

      const maxLeft = bounds.right - width
      const minLeft = bounds.left
      left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft))

      if (top + height > bounds.bottom) {
        top = ar.top - height - PANEL_PAD
      }
      const maxTop = bounds.bottom - height
      top = Math.min(Math.max(top, bounds.top), Math.max(bounds.top, maxTop))

      setPanelStyle({
        position: 'fixed',
        left: `${Math.round(left)}px`,
        top: `${Math.round(top)}px`,
        right: 'auto',
        bottom: 'auto',
        zIndex: 80
      })
    }

    place()
    const raf = window.requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const panel = open ? (
    <div
      ref={panelRef}
      id={panelId}
      style={panelStyle ?? { position: 'fixed', visibility: 'hidden', zIndex: 80 }}
    >
      <InteractionUI
        className="marker-shape-flyout-panel"
        role="dialog"
        aria-label="일정 표시 도형 선택"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <EventMarkerShapePicker
          value={value}
          color={color}
          onChange={(shapeId) => {
            onChange(shapeId)
            setOpen(false)
          }}
        />
      </InteractionUI>
    </div>
  ) : null

  return (
    <div ref={rootRef} className={cn('marker-shape-picker-root', className)}>
      <button
        type="button"
        className={cn('marker-shape-picker-trigger', buttonClassName)}
        title={
          disabled
            ? '일정을 선택한 뒤 표시 도형을 바꿀 수 있습니다'
            : title
        }
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (disabled) return
          setOpen((prev) => !prev)
        }}
      >
        <ListIcon />
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  )
}

export default EventMarkerShapeButton
