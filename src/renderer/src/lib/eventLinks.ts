import type { EventLink } from '../../../shared/calendarTypes'

function makeId(): string {
  return `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeEventLinkUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[\w.-]+\.[\w.-]+/.test(trimmed)) return `https://${trimmed}`
  return trimmed
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
