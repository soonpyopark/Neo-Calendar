import type { EventLink } from '../../../shared/calendarTypes'

function makeId(): string {
  return `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** True when the string is a usable http(s) event shortcut URL. */
export function isValidEventLinkUrl(raw: string): boolean {
  return Boolean(normalizeEventLinkUrl(raw))
}

/**
 * Normalize an event link URL for storage.
 * Accepts absolute http(s) URLs, or bare hostnames like `example.com` (https assumed).
 * Rejects empty / non-http(s) / malformed values.
 */
export function normalizeEventLinkUrl(raw: string): string {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[\w.-]+\.[\w.-]+/.test(trimmed)
      ? `https://${trimmed}`
      : ''
  if (!candidate) return ''

  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    if (!parsed.hostname) return ''
    return candidate
  } catch {
    return ''
  }
}

export function normalizeEventLinksArray(links?: EventLink[] | null): EventLink[] {
  if (!Array.isArray(links)) return []
  const next: EventLink[] = []
  for (const item of links) {
    const url = normalizeEventLinkUrl(String(item?.url ?? ''))
    if (!url) continue
    next.push({
      id: item.id || makeId(),
      url,
      ...(item.title ? { title: item.title } : {})
    })
  }
  return next
}

export function getEventLinks(event: { links?: EventLink[]; link?: string } | null | undefined): EventLink[] {
  if (!event) return []
  if (Array.isArray(event.links) && event.links.length) return normalizeEventLinksArray(event.links)
  if (event.link) {
    const url = normalizeEventLinkUrl(event.link)
    return url ? [{ id: makeId(), url }] : []
  }
  return []
}

export function appendEventLink(links: EventLink[], url: string): EventLink[] {
  const normalized = normalizeEventLinkUrl(url)
  if (!normalized) return links
  if (links.some((item) => item.url === normalized)) return links
  return [...links, { id: makeId(), url: normalized }]
}

export function getPrimaryEventLinkUrl(
  event: { links?: EventLink[]; link?: string } | null | undefined
): string {
  return getEventLinks(event)[0]?.url ?? ''
}
