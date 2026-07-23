export function formatTime24(time: string | null | undefined): string
export function isTimedEvent(event: { allDay?: boolean; startTime?: string | null } | null | undefined): boolean
export function compareEventsForDisplay(a: unknown, b: unknown): number
export function getEventSortOrderForDay(
  event: { sortOrder?: number | null; sortOrderByDay?: Record<string, number> } | null | undefined,
  dayKey?: string
): number | null
export function mergeSortOrderByDay(
  event: { sortOrderByDay?: Record<string, number> } | null | undefined,
  dayKey: string,
  sortOrder: number
): Record<string, number>
