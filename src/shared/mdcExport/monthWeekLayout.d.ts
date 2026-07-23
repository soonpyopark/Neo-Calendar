export function buildWeekEventLayout(
  week: Array<{ date: Date }>,
  events: unknown[],
  tags?: unknown[]
): Record<string, unknown[]>

export function buildAllWeekEventLayouts(
  weeks: Array<Array<{ date: Date }>>,
  events: unknown[],
  tags?: unknown[]
): Map<string, Record<string, unknown[]>>

export function countHiddenWeekEvents(
  segments: Array<{ event: { id?: string }; lane: number }>,
  maxVisible: number
): number
