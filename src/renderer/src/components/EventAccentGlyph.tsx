import type { CSSProperties, ReactElement } from 'react'
import { getMarkerShapeGlyph } from '../lib/eventMarkerShapes'
import { cn } from '../lib/cn'

export type EventAccentGlyphProps = {
  shapeId?: string | null
  color?: string
  variant?: 'bar' | 'dot'
  className?: string
}

/**
 * Leading indicator: bar (month event) or dot (day list). Custom markerShape glyphs supported.
 */
export function EventAccentGlyph({
  shapeId,
  color,
  variant = 'bar',
  className
}: EventAccentGlyphProps): ReactElement {
  const glyph = getMarkerShapeGlyph(shapeId)

  if (!glyph) {
    if (variant === 'dot') {
      return (
        <span className={cn('event-dot', className)} style={{ background: color }} aria-hidden="true" />
      )
    }
    return (
      <span
        className={cn(
          'event-bar-accent',
          shapeId === 'bar-round' && 'event-bar-accent--round',
          className
        )}
        aria-hidden="true"
      />
    )
  }

  return (
    <span
      className={cn(variant === 'dot' ? 'event-dot-glyph' : 'event-bar-glyph', className)}
      style={{ color } as CSSProperties}
      aria-hidden="true"
    >
      {glyph}
    </span>
  )
}

export default EventAccentGlyph
