export type EventMarkerShape = {
  id: string
  label: string
  glyph: string | null
}

export const EVENT_MARKER_SHAPES: EventMarkerShape[] = [
  { id: 'bar', label: '기본 세로선', glyph: null },
  { id: 'bar-round', label: '둥근 세로선', glyph: null },
  { id: 'square-filled', label: '채운 사각형', glyph: '■' },
  { id: 'square-outline', label: '빈 사각형', glyph: '□' },
  { id: 'circle-outline', label: '원', glyph: '○' },
  { id: 'dot', label: '작은 동그라미', glyph: '•' },
  { id: 'star-filled', label: '채운 별', glyph: '★' },
  { id: 'star-outline', label: '빈 별', glyph: '☆' },
  { id: 'reference-mark', label: '참조 표시', glyph: '※' }
]

export const DEFAULT_EVENT_MARKER_SHAPE = 'bar'

export function normalizeMarkerShape(value?: string | null): string {
  return EVENT_MARKER_SHAPES.some((shape) => shape.id === value)
    ? (value as string)
    : DEFAULT_EVENT_MARKER_SHAPE
}

export function getMarkerShapeGlyph(shapeId?: string | null): string | null {
  return EVENT_MARKER_SHAPES.find((shape) => shape.id === shapeId)?.glyph ?? null
}
