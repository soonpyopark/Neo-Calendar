import { useCallback, useLayoutEffect, useRef, useState, type ReactElement } from 'react'

export type DayNumberProps = {
  solar: number
  lunarLabel: string | null
  lunarDay: number | null
  solarTerm: string | null
}

/** MDC DayNumber — 양력 + 음력(+좁은 칸 축약) + 절기/삼복. */
export function DayNumber({
  solar,
  lunarLabel,
  lunarDay,
  solarTerm
}: DayNumberProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLSpanElement | null>(null)
  const termSuffix = solarTerm ? ` ${solarTerm}` : ''
  const fullDisplay = `(${lunarLabel})${termSuffix}`
  const [useShortLabel, setUseShortLabel] = useState(false)

  const measure = useCallback(() => {
    const root = rootRef.current
    const measureEl = measureRef.current
    if (!root || !measureEl || lunarLabel == null) return

    const solarEl = root.querySelector('.solar')
    if (!(solarEl instanceof HTMLElement)) return

    const gap =
      Number.parseFloat(getComputedStyle(root).columnGap || getComputedStyle(root).gap) || 0
    setUseShortLabel(solarEl.offsetWidth + gap + measureEl.offsetWidth > root.clientWidth)
  }, [lunarLabel, termSuffix])

  useLayoutEffect(() => {
    measure()
    const root = rootRef.current
    if (!root) return

    let raf = 0
    const schedule = (): void => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        measure()
      })
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(root)
    return () => {
      observer.disconnect()
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [measure, solar, lunarLabel, termSuffix])

  return (
    <div className="day-number" ref={rootRef}>
      <span className="solar">{solar}</span>
      {lunarLabel != null && lunarDay != null ? (
        <>
          <span ref={measureRef} className="lunar-measure" aria-hidden>
            {fullDisplay}
          </span>
          <span className="lunar" title={useShortLabel ? fullDisplay : undefined}>
            ({useShortLabel ? lunarDay : lunarLabel})
          </span>
          {solarTerm ? <span className="solar-term">{solarTerm}</span> : null}
        </>
      ) : null}
    </div>
  )
}

export default DayNumber
