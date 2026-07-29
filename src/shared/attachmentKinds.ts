import type { EventAttachment } from './calendarTypes'

/**
 * Formats the in-app viewer can render. SVG is left out on purpose — it is a
 * document, not a bitmap, and we do not want it rendered from our own origin.
 */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif'])

function extensionOf(name: string): string {
  const dot = String(name ?? '').lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

/** Viewable image? `mime` wins; older records without it fall back to the extension. */
export function isImageAttachment(
  meta: Pick<EventAttachment, 'mime' | 'name' | 'storedName'> | null | undefined
): boolean {
  if (!meta) return false
  const mime = String(meta.mime ?? '').toLowerCase()
  if (mime.startsWith('image/')) return mime !== 'image/svg+xml'
  if (mime && mime !== 'application/octet-stream') return false
  return (
    IMAGE_EXTENSIONS.has(extensionOf(meta.name ?? ''))
    || IMAGE_EXTENSIONS.has(extensionOf(meta.storedName ?? ''))
  )
}
