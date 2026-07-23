/** Fixed event lane sizing — row height only changes visible count, not bar height. */
export const EVENT_LAYOUT = {
  laneHeight: 18,
  laneGap: 2,
  dayEventGap: 6,
  moreOffset: 4,
  cellPaddingY: 8,
  dayNumberHeight: 28
} as const

export function getEventLaneStep(): number {
  return EVENT_LAYOUT.laneHeight + EVENT_LAYOUT.laneGap
}

export function getEventRowCapacity(rowHeight: number): {
  maxAll: number
  maxWithMore: number
} {
  if (rowHeight <= 0) return { maxAll: 0, maxWithMore: 0 }

  const { cellPaddingY, dayNumberHeight, dayEventGap, moreOffset, laneHeight } = EVENT_LAYOUT
  const laneStep = getEventLaneStep()

  const available = rowHeight - cellPaddingY - dayNumberHeight - dayEventGap
  if (available <= 0) return { maxAll: 0, maxWithMore: 0 }

  const maxAll = Math.max(0, Math.floor(available / laneStep))
  const moreTail = moreOffset + laneHeight
  const maxWithMore = Math.max(
    0,
    Math.min(maxAll - 1, Math.floor((available - moreTail) / laneStep))
  )

  return { maxAll, maxWithMore }
}

export function getEventLayoutCssVars(): Record<string, string> {
  const { laneHeight, dayEventGap, moreOffset } = EVENT_LAYOUT
  return {
    '--event-lane-height': `${laneHeight}px`,
    '--event-lane-step': `${getEventLaneStep()}px`,
    '--day-event-gap': `${dayEventGap}px`,
    '--event-more-offset': `${moreOffset}px`
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
