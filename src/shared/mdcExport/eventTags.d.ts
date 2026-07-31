export const COMPLETED_LABEL: '(완료)'
export const COMPLETED_LABEL_COLOR: '#0070CE'

export function normalizeTagIds(value: unknown): string[]
export function sortTags<T extends { sortOrder?: number; name?: string }>(tags: T[] | null | undefined): T[]
export function resolveEventTags(
  event: { tagIds?: string[] } | null | undefined,
  tags: Array<{ id: string; name?: string; color?: string }>
): Array<{ id: string; name?: string; color?: string }>
export function formatEventTagPrefix(
  event: { tagIds?: string[] } | null | undefined,
  tags: Array<{ id: string; name?: string }>
): string
export function formatTaggedEventTitle(
  event: { title?: string; tagIds?: string[]; completed?: boolean } | null | undefined,
  tags: Array<{ id: string; name?: string }>
): string
export function splitEventTitleRuns(text: string): Array<{ text: string; completed: boolean }>
