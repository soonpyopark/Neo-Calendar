import type { RefObject } from 'react'

export type UseMonthWeekScrollOptions = {
  scrollRef: RefObject<HTMLElement | null>
  weeks: Array<Array<{ date: Date }>>
  weeksInViewport?: number
  onVisibleMonthChange?: (year: number, month1Based: number) => void
  onVisibleWeekChange?: (weekStart: Date) => void
  wheelLocked?: boolean
}

export function useMonthWeekScroll(options: UseMonthWeekScrollOptions): {
  setWeekRef: (weekStartKey: string, node: HTMLElement | null) => void
  scrollToMonth: (
    year: number,
    monthIndex: number,
    weekStartsOn: number,
    behavior?: ScrollBehavior
  ) => void
  scrollToDate: (date: Date, weekStartsOn: number, behavior?: ScrollBehavior) => void
  scrollToDateInViewport: (date: Date, offsetWeeks?: number, behavior?: ScrollBehavior) => void
  scrollToWeekStart: (weekStartKey: string, behavior?: ScrollBehavior) => void
  scrollByWeek: (direction: number, behavior?: ScrollBehavior, weekStep?: number) => void
  consumeSkipScroll: () => boolean
}
