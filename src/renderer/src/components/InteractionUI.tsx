import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref
} from 'react'
import { setIgnoreMouseEvents } from '../lib/mouseBridge'

type CommonProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** When false, skip hover-based click-through wake (embedded toolbar buttons). */
  captureOnHover?: boolean
}

type DivProps = CommonProps &
  Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style' | 'children'> & {
    as?: 'div'
  }

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style' | 'children'> & {
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
  captureOnHover: boolean,
  onMouseEnter?: (event: ReactMouseEvent<T>) => void,
  onMouseLeave?: (event: ReactMouseEvent<T>) => void,
  onClick?: (event: ReactMouseEvent<T>) => void
): {
  onMouseEnter?: (event: ReactMouseEvent<T>) => void
  onMouseLeave?: (event: ReactMouseEvent<T>) => void
  onClick: (event: ReactMouseEvent<T>) => void
} {
  return {
    onMouseEnter: captureOnHover
      ? (event: ReactMouseEvent<T>) => {
          event.stopPropagation()
          setIgnoreMouseEvents(false)
          onMouseEnter?.(event)
        }
      : onMouseEnter,
    onMouseLeave: captureOnHover
      ? (event: ReactMouseEvent<T>) => {
          event.stopPropagation()
          if (!isPortalFlyoutTarget(event.relatedTarget)) {
            setIgnoreMouseEvents(true, { forwardToOverlay: true })
          }
          onMouseLeave?.(event)
        }
      : onMouseLeave,
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
export const InteractionUI = forwardRef<HTMLElement, InteractionUIProps>(function InteractionUI(
  props,
  ref
): ReactElement {
  const className = `interaction-ui ${props.className ?? ''}`.trim()

  if (props.as === 'button') {
    const {
      children,
      style,
      className: _className,
      captureOnHover = true,
      onMouseEnter,
      onMouseLeave,
      onClick,
      as: _as,
      type = 'button',
      ...rest
    } = props
    const handlers = bindInteractionHandlers<HTMLButtonElement>(
      captureOnHover,
      onMouseEnter,
      onMouseLeave,
      onClick
    )

    return (
      <button ref={ref as Ref<HTMLButtonElement>} type={type} className={className} style={style} {...rest} {...handlers}>
        {children}
      </button>
    )
  }

  if (props.as === 'span') {
    const {
      children,
      style,
      className: _className,
      captureOnHover = true,
      onMouseEnter,
      onMouseLeave,
      onClick,
      as: _as,
      ...rest
    } = props
    const handlers = bindInteractionHandlers<HTMLSpanElement>(
      captureOnHover,
      onMouseEnter,
      onMouseLeave,
      onClick
    )

    return (
      <span ref={ref as Ref<HTMLSpanElement>} className={className} style={style} {...rest} {...handlers}>
        {children}
      </span>
    )
  }

  const {
    children,
    style,
    className: _className,
    captureOnHover = true,
    onMouseEnter,
    onMouseLeave,
    onClick,
    as: _as,
    ...rest
  } = props
  const handlers = bindInteractionHandlers<HTMLDivElement>(
    captureOnHover,
    onMouseEnter,
    onMouseLeave,
    onClick
  )

  return (
    <div ref={ref as Ref<HTMLDivElement>} className={className} style={style} {...rest} {...handlers}>
      {children}
    </div>
  )
})

export default InteractionUI
