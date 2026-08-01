/** Base event lane sizing at density 1 — row height + density decide visible count. */
export const EVENT_LAYOUT = {
  laneHeight: 18,
  laneGap: 2,
  dayEventGap: 6,
  moreOffset: 4,
  cellPaddingY: 8,
  dayNumberHeight: 28
} as const

export const EVENT_DENSITY_MIN = 0.75
export const EVENT_DENSITY_MAX = 1.25
export const EVENT_DENSITY_STEP = 0.1
export const EVENT_DENSITY_DEFAULT = 1

/** Clamp + round density to one decimal (0.75 … 1.25). */
export function normalizeEventDensity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return EVENT_DENSITY_DEFAULT
  const clamped = Math.min(EVENT_DENSITY_MAX, Math.max(EVENT_DENSITY_MIN, n))
  return Math.round(clamped * 10) / 10
}

export function stepEventDensity(current: unknown, delta: number): number {
  return normalizeEventDensity(normalizeEventDensity(current) + delta)
}

export type ScaledEventLayout = {
  laneHeight: number
  laneGap: number
  dayEventGap: number
  moreOffset: number
  cellPaddingY: number
  dayNumberHeight: number
  density: number
}

/** Layout metrics scaled by density ([-] smaller → more bars fit). */
export function getScaledEventLayout(density: unknown = EVENT_DENSITY_DEFAULT): ScaledEventLayout {
  const d = normalizeEventDensity(density)
  const scale = (base: number, min: number): number => Math.max(min, Math.round(base * d))
  return {
    laneHeight: scale(EVENT_LAYOUT.laneHeight, 12),
    laneGap: scale(EVENT_LAYOUT.laneGap, 1),
    dayEventGap: scale(EVENT_LAYOUT.dayEventGap, 3),
    moreOffset: scale(EVENT_LAYOUT.moreOffset, 2),
    cellPaddingY: scale(EVENT_LAYOUT.cellPaddingY, 4),
    dayNumberHeight: scale(EVENT_LAYOUT.dayNumberHeight, 18),
    density: d
  }
}

export function getEventLaneStep(density: unknown = EVENT_DENSITY_DEFAULT): number {
  const layout = getScaledEventLayout(density)
  return layout.laneHeight + layout.laneGap
}

export function getEventRowCapacity(
  rowHeight: number,
  density: unknown = EVENT_DENSITY_DEFAULT
): {
  maxAll: number
  maxWithMore: number
} {
  if (rowHeight <= 0) return { maxAll: 0, maxWithMore: 0 }

  const layout = getScaledEventLayout(density)
  const laneStep = layout.laneHeight + layout.laneGap

  const available =
    rowHeight - layout.cellPaddingY - layout.dayNumberHeight - layout.dayEventGap
  if (available <= 0) return { maxAll: 0, maxWithMore: 0 }

  const maxAll = Math.max(0, Math.floor(available / laneStep))
  const moreTail = layout.moreOffset + layout.laneHeight
  const maxWithMore = Math.max(
    0,
    Math.min(maxAll - 1, Math.floor((available - moreTail) / laneStep))
  )

  return { maxAll, maxWithMore }
}

export function getEventLayoutCssVars(
  density: unknown = EVENT_DENSITY_DEFAULT
): Record<string, string> {
  const layout = getScaledEventLayout(density)
  const laneStep = layout.laneHeight + layout.laneGap
  return {
    '--event-density': String(layout.density),
    '--event-lane-height': `${layout.laneHeight}px`,
    '--event-lane-step': `${laneStep}px`,
    '--day-event-gap': `${layout.dayEventGap}px`,
    '--event-more-offset': `${layout.moreOffset}px`
  }
}

export function resolveDayVisibleEventLimit(
  daySegments: Array<{ lane: number }>,
  capacity: { maxAll: number; maxWithMore: number }
): { visibleCount: number; hiddenEventCount: number } {
  const sortedSegments = [...daySegments].sort((a, b) => a.lane - b.lane)
  const eventCount = sortedSegments.length

  if (eventCount <= capacity.maxAll) {
    return {
      visibleCount: eventCount,
      hiddenEventCount: 0
    }
  }

  const visibleCount = Math.max(1, capacity.maxWithMore)
  return {
    visibleCount,
    hiddenEventCount: eventCount - visibleCount
  }
}
