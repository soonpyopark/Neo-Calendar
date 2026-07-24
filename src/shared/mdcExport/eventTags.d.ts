export function normalizeTagIds(value: unknown): string[]
export function sortTags<T extends { sortOrder?: number; name?: string }>(tags: T[] | null | undefined): T[]
export function resolveEventTags(
  event: { tagIds?: string[] } | null | undefined,
  tags: Array<{ id: string; name?: string; color?: string }>
): Array<{ id: string; name?: string; color?: string }>
