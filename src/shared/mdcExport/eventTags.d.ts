export function normalizeTagIds(value: unknown): string[]
export function resolveEventTags(
  event: { tagIds?: string[] } | null | undefined,
  tags: Array<{ id: string; name?: string; color?: string }>
): Array<{ id: string; name?: string; color?: string }>
