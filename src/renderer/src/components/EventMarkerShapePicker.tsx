import type { ReactElement } from 'react'
import { EVENT_MARKER_SHAPES } from '../lib/eventMarkerShapes'

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export type EventMarkerShapePickerProps = {
  value?: string | null
  color?: string
  onChange?: (shapeId: string) => void
  compact?: boolean
  className?: string
}

/** MDC EventMarkerShapePicker — grid of per-event marker shapes. */
export function EventMarkerShapePicker({
  value,
  color = '#1a73e8',
  onChange,
  compact = false,
  className
}: EventMarkerShapePickerProps): ReactElement {
  const selected = value ?? 'bar'
  return (
    <div
      className={cn(
        'marker-shape-palette',
        compact && 'marker-shape-palette--compact',
        className
      )}
      role="listbox"
      aria-label="일정 표시 도형"
    >
      {EVENT_MARKER_SHAPES.map((shape) => (
        <button
          key={shape.id}
          type="button"
          role="option"
          aria-selected={selected === shape.id}
          className={cn('marker-shape-swatch', selected === shape.id && 'active')}
          title={shape.label}
          aria-label={shape.label}
          style={{ color }}
          onClick={() => onChange?.(shape.id)}
        >
          {shape.glyph ? (
            <span className="marker-shape-glyph-preview" aria-hidden>
              {shape.glyph}
            </span>
          ) : (
            <span
              className={cn(
                'marker-shape-bar-preview',
                shape.id === 'bar-round' && 'marker-shape-bar-preview--round'
              )}
              style={{ background: color }}
              aria-hidden
            />
          )}
        </button>
      ))}
    </div>
  )
}

export default EventMarkerShapePicker
