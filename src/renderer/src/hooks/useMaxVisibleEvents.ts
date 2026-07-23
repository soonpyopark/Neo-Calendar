import { useEffect, useState, type RefObject } from 'react'
import {
  getEventLayoutCssVars,
  getEventRowCapacity,
  resolveDayVisibleEventLimit
} from '../../../shared/eventLayoutMetrics'

export { getEventRowCapacity, resolveDayVisibleEventLimit, getEventLayoutCssVars }

/**
 * Measure month-body height / weeks-in-viewport → how many event bars fit
 * before showing "N개 더보기" (MDC useMaxVisibleEvents).
 */
export function useMaxVisibleEvents(
  containerRef: RefObject<HTMLElement | null>,
  weeksInViewport = 5
): { maxAll: number; maxWithMore: number } {
  const [capacity, setCapacity] = useState(() => getEventRowCapacity(0))

  useEffect(() => {
    const container = containerRef.current
    if (!container || weeksInViewport <= 0) return

    let raf = 0
    const update = (): void => {
      const rowHeight = container.clientHeight / weeksInViewport
      setCapacity(getEventRowCapacity(rowHeight))
    }
    const schedule = (): void => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        update()
      })
    }

    update()
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    window.addEventListener('resize', schedule)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [containerRef, weeksInViewport])

  return capacity
}

export function useEventLayoutCssVars(): Record<string, string> {
  return getEventLayoutCssVars()
}
