import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactElement
} from 'react'

export type EventMoreButtonProps = {
  count: number
  lane: number
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  onDoubleClick?: (event: MouseEvent<HTMLButtonElement>) => void
}

/** MDC EventMoreButton — truncates to "N개 ..." when the cell is too narrow. */
export function EventMoreButton({
  count,
  lane,
  onClick,
  onDoubleClick
}: EventMoreButtonProps): ReactElement {
  const containerRef = useRef<HTMLButtonElement | null>(null)
  const measureRef = useRef<HTMLSpanElement | null>(null)
  const fullLabel = `${count}개 더보기`
  const shortLabel = `${count}개 ...`
  const [useShortLabel, setUseShortLabel] = useState(false)

  const measure = useCallback((): void => {
    const container = containerRef.current
    const measureEl = measureRef.current
    if (!container || !measureEl) return
    setUseShortLabel(measureEl.offsetWidth > container.clientWidth)
  }, [])

  useLayoutEffect(() => {
    measure()
    const container = containerRef.current
    if (!container) return

    let raf = 0
    const schedule = (): void => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        measure()
      })
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    return () => {
      observer.disconnect()
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [measure, fullLabel])

  return (
    <button
      ref={containerRef}
      type="button"
      className="event-more"
      style={{ '--event-lane': lane } as CSSProperties}
      aria-label={fullLabel}
      title={useShortLabel ? fullLabel : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <span ref={measureRef} className="event-more-measure" aria-hidden="true">
        {fullLabel}
      </span>
      {useShortLabel ? shortLabel : fullLabel}
    </button>
  )
}

export default EventMoreButton
