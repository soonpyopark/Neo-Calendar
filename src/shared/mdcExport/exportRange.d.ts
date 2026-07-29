export function startOfWeekDateKey(dateKey: string, weekStartsOn?: 0 | 1): string
export function listDateKeysInRange(startDate: string, endDate: string): string[]
export function getRangeWeeksForExport(
  startDate: string,
  endDate: string,
  weekStartsOn?: 0 | 1
): Array<Array<{ date: Date; inRange: boolean }>>
export function getWeekdayHeaders(weekStartsOn?: 0 | 1): string[]
export function formatDayListDateLabel(dateKey: string): string
export function resolveExportRangePreset(
  preset: 'thisMonth' | 'thisWeek' | 'thisYear' | 'custom',
  reference?: Date,
  weekStartsOn?: 0 | 1
): { startDate: string; endDate: string }
