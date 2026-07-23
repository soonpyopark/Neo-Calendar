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
