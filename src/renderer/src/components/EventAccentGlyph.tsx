import type { CSSProperties, ReactElement } from 'react'
import { getMarkerShapeGlyph } from '../lib/eventMarkerShapes'
import { cn } from '../lib/cn'

export type EventAccentGlyphProps = {
  shapeId?: string | null
  color?: string
  variant?: 'bar' | 'dot'
  className?: string
  /** Hover tooltip (e.g. calendar name); also exposes the glyph to screen readers. */
  title?: string
}

/**
 * Leading indicator: bar (month event) or dot (day list). Custom markerShape glyphs supported.
 */
export function EventAccentGlyph({
  shapeId,
  color,
  variant = 'bar',
  className,
  title
}: EventAccentGlyphProps): ReactElement {
  const glyph = getMarkerShapeGlyph(shapeId)
  const labelProps = title
    ? ({ title, role: 'img', 'aria-label': title } as const)
    : ({ 'aria-hidden': 'true' } as const)

  if (!glyph) {
    if (variant === 'dot') {
      return (
        <span className={cn('event-dot', className)} style={{ background: color }} {...labelProps} />
      )
    }
    return (
      <span
        className={cn(
          'event-bar-accent',
          shapeId === 'bar-round' && 'event-bar-accent--round',
          className
        )}
        {...labelProps}
      />
    )
  }

  return (
    <span
      className={cn(variant === 'dot' ? 'event-dot-glyph' : 'event-bar-glyph', className)}
      style={{ color } as CSSProperties}
      {...labelProps}
    >
      {glyph}
    </span>
  )
}

export default EventAccentGlyph
