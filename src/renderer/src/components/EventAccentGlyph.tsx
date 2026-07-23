import type { CSSProperties, ReactElement } from 'react'
import { getMarkerShapeGlyph, normalizeMarkerShape } from '../lib/eventMarkerShapes'

export type EventAccentGlyphProps = {
  shapeId?: string | null
  color: string
  className?: string
}

/** Compact leading accent for quick-edit rows (MDC EventAccentGlyph variant=dot). */
export function EventAccentGlyph({
  shapeId,
  color,
  className
}: EventAccentGlyphProps): ReactElement {
  const shape = normalizeMarkerShape(shapeId)
  const glyph = getMarkerShapeGlyph(shape)
  const style = { color, '--accent': color } as CSSProperties

  if (glyph) {
    return (
      <span className={`event-accent-glyph${className ? ` ${className}` : ''}`} style={style} aria-hidden>
        {glyph}
      </span>
    )
  }

  return (
    <span
      className={`event-accent-glyph event-accent-glyph--bar${
        shape === 'bar-round' ? ' event-accent-glyph--round' : ''
      }${className ? ` ${className}` : ''}`}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  )
}

export default EventAccentGlyph
