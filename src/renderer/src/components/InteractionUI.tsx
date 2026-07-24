import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode
} from 'react'
import { setIgnoreMouseEvents } from '../lib/mouseBridge'

type CommonProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

type DivProps = CommonProps &
  Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style' | 'children'> & {
    as?: 'div'
  }

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style' | 'children' | 'type'> & {
    as: 'button'
  }

type SpanProps = CommonProps &
  Omit<HTMLAttributes<HTMLSpanElement>, 'className' | 'style' | 'children'> & {
    as: 'span'
  }

export type InteractionUIProps = DivProps | ButtonProps | SpanProps

/** Portaled menus that live outside their parent InteractionUI box. */
const PORTAL_FLYOUT_SELECTOR = [
  '.quick-edit-calendar-flyout',
  '.day-quick-edit-palette-flyout',
  '.emoji-picker-panel',
  '.event-link-flyout',
  '.marker-shape-flyout-panel',
  '.custom-color-panel'
].join(', ')

function isPortalFlyoutTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(PORTAL_FLYOUT_SELECTOR))
}

function bindInteractionHandlers<T extends HTMLElement>(
  onMouseEnter?: (event: ReactMouseEvent<T>) => void,
  onMouseLeave?: (event: ReactMouseEvent<T>) => void,
  onClick?: (event: ReactMouseEvent<T>) => void
): {
  onMouseEnter: (event: ReactMouseEvent<T>) => void
  onMouseLeave: (event: ReactMouseEvent<T>) => void
  onClick: (event: ReactMouseEvent<T>) => void
} {
  return {
    onMouseEnter: (event: ReactMouseEvent<T>) => {
      event.stopPropagation()
      setIgnoreMouseEvents(false)
      onMouseEnter?.(event)
    },
    onMouseLeave: (event: ReactMouseEvent<T>) => {
      event.stopPropagation()
      // Moving into a portaled flyout must not re-enable desktop click-through,
      // or the flyout never receives the enter/click (ignore already on).
      if (!isPortalFlyoutTarget(event.relatedTarget)) {
        setIgnoreMouseEvents(true, { forwardToOverlay: true })
      }
      onMouseLeave?.(event)
    },
    onClick: (event: ReactMouseEvent<T>) => {
      event.stopPropagation()
      onClick?.(event)
    }
  }
}

/**
 * Interactive hotspot wrapper.
 * On hover, re-enables mouse capture so buttons / events receive clicks.
 * Empty desktop areas outside these wrappers remain click-through.
 */
export function InteractionUI(props: InteractionUIProps): ReactElement {
  const className = `interaction-ui ${props.className ?? ''}`.trim()

  if (props.as === 'button') {
    const {
      children,
      style,
      className: _className,
      onMouseEnter,
      onMouseLeave,
      onClick,
      as: _as,
      ...rest
    } = props
    const handlers = bindInteractionHandlers<HTMLButtonElement>(onMouseEnter, onMouseLeave, onClick)

    return (
      <button type="button" className={className} style={style} {...rest} {...handlers}>
        {children}
      </button>
    )
  }

  if (props.as === 'span') {
    const {
      children,
      style,
      className: _className,
      onMouseEnter,
      onMouseLeave,
      onClick,
      as: _as,
      ...rest
    } = props
    const handlers = bindInteractionHandlers<HTMLSpanElement>(onMouseEnter, onMouseLeave, onClick)

    return (
      <span className={className} style={style} {...rest} {...handlers}>
        {children}
      </span>
    )
  }

  const {
    children,
    style,
    className: _className,
    onMouseEnter,
    onMouseLeave,
    onClick,
    as: _as,
    ...rest
  } = props
  const handlers = bindInteractionHandlers<HTMLDivElement>(onMouseEnter, onMouseLeave, onClick)

  return (
    <div className={className} style={style} {...rest} {...handlers}>
      {children}
    </div>
  )
}

export default InteractionUI
