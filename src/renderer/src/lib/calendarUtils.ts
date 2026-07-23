/** Format a Date (or Date-like) as YYYY-MM-DD — MDC calendarUtils.toDateKey. */
export function toDateKey(date: Date | string | number | null | undefined): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const d = date instanceof Date ? date : new Date(date ?? Date.now())
  if (Number.isNaN(d.getTime())) {
    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    return `${now.getFullYear()}-${mm}-${dd}`
  }
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = String(key).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function eventOnDay(
  event: { startDate?: string; endDate?: string } | null | undefined,
  dayKey: string
): boolean {
  if (!event?.startDate || !dayKey) return false
  const end = event.endDate || event.startDate
  return dayKey >= event.startDate && dayKey <= end
}

export function startOfWeek(date: Date, weekStartsOn: 0 | 1 = 0): Date {
  const aligned = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const offset = (aligned.getDay() - weekStartsOn + 7) % 7
  aligned.setDate(aligned.getDate() - offset)
  return aligned
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() + days)
  return next
}

export function buildWeekFromStart(weekStart: Date): Array<{ date: Date; inMonth: boolean }> {
  return Array.from({ length: 7 }, (_, index) => ({
    date: addDays(weekStart, index),
    inMonth: true
  }))
}

/** MDC infinite month buffer: weeksBefore + 1 + weeksAfter. */
export function generateWeekRange(
  anchorDate: Date,
  weekStartsOn: 0 | 1,
  weeksBefore: number,
  weeksAfter: number
): Array<Array<{ date: Date; inMonth: boolean }>> {
  const anchorWeekStart = startOfWeek(anchorDate, weekStartsOn)
  const rangeStart = addDays(anchorWeekStart, -weeksBefore * 7)
  const totalWeeks = weeksBefore + weeksAfter + 1
  return Array.from({ length: totalWeeks }, (_, index) => {
    const weekStart = addDays(rangeStart, index * 7)
    return buildWeekFromStart(weekStart)
  })
}

export function getWeekDisplayMonth(week: Array<{ date: Date }>): { year: number; month: number } {
  for (const { date } of week) {
    if (date.getDate() === 1) {
      return { year: date.getFullYear(), month: date.getMonth() + 1 }
    }
  }
  const counts = new Map<string, number>()
  for (const { date } of week) {
    const key = `${date.getFullYear()}-${date.getMonth()}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let bestKey = `${week[0].date.getFullYear()}-${week[0].date.getMonth()}`
  let bestCount = -1
  for (const [key, count] of Array.from(counts.entries())) {
    if (count > bestCount) {
      bestCount = count
      bestKey = key
    }
  }
  const [year, month] = bestKey.split('-').map(Number)
  return { year, month: month + 1 }
}

export function getWeekStartContainingMonth(
  year: number,
  month: number,
  weekStartsOn: 0 | 1 = 0
): Date {
  return startOfWeek(new Date(year, month, 1), weekStartsOn)
}

export function getWeeksInMonth(year: number, month: number, weekStartsOn: 0 | 1 = 0): number {
  const firstWeekdayOffset = (new Date(year, month, 1).getDay() - weekStartsOn + 7) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return Math.ceil((firstWeekdayOffset + daysInMonth) / 7)
}
