import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode
} from 'react'
import { setIgnoreMouseEvents } from './mouseBridge'

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

export type InteractionUIProps = DivProps | ButtonProps

function bindHandlers<T extends HTMLElement>(
  onMouseEnter?: (event: ReactMouseEvent<T>) => void,
  onMouseLeave?: (event: ReactMouseEvent<T>) => void,
  onClick?: (event: ReactMouseEvent<T>) => void
) {
  return {
    onMouseEnter: (event: ReactMouseEvent<T>) => {
      event.stopPropagation()
      setIgnoreMouseEvents(false)
      onMouseEnter?.(event)
    },
    onMouseLeave: (event: ReactMouseEvent<T>) => {
      event.stopPropagation()
      setIgnoreMouseEvents(true, { forwardToOverlay: true })
      onMouseLeave?.(event)
    },
    onClick: (event: ReactMouseEvent<T>) => {
      event.stopPropagation()
      onClick?.(event)
    }
  }
}

export function InteractionUI(props: InteractionUIProps): ReactElement {
  const className = `interaction-ui ${props.className ?? ''}`.trim()

  if (props.as === 'button') {
    const {
      children,
      style,
      className: _c,
      onMouseEnter,
      onMouseLeave,
      onClick,
      as: _as,
      ...rest
    } = props
    const handlers = bindHandlers<HTMLButtonElement>(onMouseEnter, onMouseLeave, onClick)
    return (
      <button type="button" className={className} style={style} {...rest} {...handlers}>
        {children}
      </button>
    )
  }

  const {
    children,
    style,
    className: _c,
    onMouseEnter,
    onMouseLeave,
    onClick,
    as: _as,
    ...rest
  } = props
  const handlers = bindHandlers<HTMLDivElement>(onMouseEnter, onMouseLeave, onClick)
  return (
    <div className={className} style={style} {...rest} {...handlers}>
      {children}
    </div>
  )
}

export default InteractionUI
