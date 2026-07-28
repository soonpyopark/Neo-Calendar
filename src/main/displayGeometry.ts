import { screen, type Display } from 'electron'
import { MIN_WIDGET_HEIGHT, MIN_WIDGET_WIDTH } from '../shared/constants'
import type { WidgetBounds, WidgetDisplayPlacement } from '../shared/ipc'

export type Point = { x: number; y: number }

export type ResolvePlacementResult = {
  bounds: WidgetBounds
  /** True when the preferred `displayId` is currently attached. */
  matchedPreferredDisplay: boolean
  displayId: number
}

/** Round so the last digit is 0 (multiples of 10). */
export function snapToTen(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value / 10) * 10
}

export function displayForPoint(pt: Point): Display {
  return screen.getDisplayNearestPoint(pt)
}

export function displayForBounds(bounds: WidgetBounds): Display {
  return displayForPoint({
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2)
  })
}

export function findDisplayById(displayId: number | null | undefined): Display | null {
  if (displayId == null || !Number.isFinite(displayId)) return null
  return screen.getAllDisplays().find((d) => d.id === displayId) ?? null
}

/** Clamp widget bounds into a specific display's full bounds (DIP). */
export function clampBoundsToDisplay(bounds: WidgetBounds, display: Display): WidgetBounds {
  const area = display.bounds
  const width = Math.min(Math.max(MIN_WIDGET_WIDTH, snapToTen(bounds.width)), area.width)
  const height = Math.min(Math.max(MIN_WIDGET_HEIGHT, snapToTen(bounds.height)), area.height)
  const maxX = area.x + Math.max(0, area.width - width)
  const maxY = area.y + Math.max(0, area.height - height)
  return {
    x: Math.min(Math.max(snapToTen(bounds.x), area.x), maxX),
    y: Math.min(Math.max(snapToTen(bounds.y), area.y), maxY),
    width,
    height
  }
}

/** Clamp widget bounds into the nearest display's full bounds (DIP). */
export function normalizeBoundsToDisplay(bounds: WidgetBounds): WidgetBounds {
  return clampBoundsToDisplay(bounds, displayForBounds(bounds))
}

/** Capture preferred monitor + offsets from absolute DIP bounds. */
export function captureDisplayPlacement(bounds: WidgetBounds): WidgetDisplayPlacement {
  const display = displayForBounds(bounds)
  const clamped = clampBoundsToDisplay(bounds, display)
  return {
    displayId: display.id,
    offsetX: clamped.x - display.bounds.x,
    offsetY: clamped.y - display.bounds.y,
    width: clamped.width,
    height: clamped.height
  }
}

/**
 * Restore absolute bounds from a saved placement.
 * Prefer the stored displayId; if that monitor is missing, fall back to nearest-display clamp.
 */
export function resolveDisplayPlacement(
  placement: WidgetDisplayPlacement | null | undefined,
  fallbackBounds?: WidgetBounds | null
): ResolvePlacementResult {
  const preferred = findDisplayById(placement?.displayId)
  if (placement && preferred) {
    const raw: WidgetBounds = {
      x: preferred.bounds.x + placement.offsetX,
      y: preferred.bounds.y + placement.offsetY,
      width: placement.width,
      height: placement.height
    }
    const bounds = clampBoundsToDisplay(raw, preferred)
    return {
      bounds,
      matchedPreferredDisplay: true,
      displayId: preferred.id
    }
  }

  const absolute =
    fallbackBounds ??
    (placement
      ? {
          // Last-known absolute guess: primary-relative offsets (best effort).
          x: placement.offsetX,
          y: placement.offsetY,
          width: placement.width,
          height: placement.height
        }
      : null)

  if (!absolute) {
    const primary = screen.getPrimaryDisplay()
    const bounds = clampBoundsToDisplay(
      {
        x: primary.bounds.x,
        y: primary.bounds.y,
        width: MIN_WIDGET_WIDTH,
        height: MIN_WIDGET_HEIGHT
      },
      primary
    )
    return { bounds, matchedPreferredDisplay: false, displayId: primary.id }
  }

  const nearest = displayForBounds(absolute)
  const bounds = clampBoundsToDisplay(absolute, nearest)
  return {
    bounds,
    matchedPreferredDisplay: false,
    displayId: nearest.id
  }
}

/** Center on the display under the cursor (fallback: primary). */
export function centerOnCursorDisplay(width: number, height: number): WidgetBounds {
  const pt = screen.getCursorScreenPoint()
  const area = displayForPoint(pt).workArea
  const w = Math.min(Math.max(MIN_WIDGET_WIDTH, snapToTen(width)), area.width)
  const h = Math.min(Math.max(MIN_WIDGET_HEIGHT, snapToTen(height)), area.height)
  return {
    x: snapToTen(area.x + Math.round((area.width - w) / 2)),
    y: snapToTen(area.y + Math.round((area.height - h) / 2)),
    width: w,
    height: h
  }
}

/** Center on the display that best matches saved bounds. */
export function centerOnBoundsDisplay(bounds: WidgetBounds): WidgetBounds {
  const area = displayForBounds(bounds).workArea
  const w = Math.min(Math.max(MIN_WIDGET_WIDTH, snapToTen(bounds.width)), area.width)
  const h = Math.min(Math.max(MIN_WIDGET_HEIGHT, snapToTen(bounds.height)), area.height)
  return {
    x: snapToTen(area.x + Math.round((area.width - w) / 2)),
    y: snapToTen(area.y + Math.round((area.height - h) / 2)),
    width: w,
    height: h
  }
}

export function placeAwayFromCursor(bounds: WidgetBounds): WidgetBounds {
  const pt = screen.getCursorScreenPoint()
  const chrome = { x: bounds.x, y: bounds.y, width: bounds.width, height: 72 }
  const overChrome =
    pt.x >= chrome.x &&
    pt.x < chrome.x + chrome.width &&
    pt.y >= chrome.y &&
    pt.y < chrome.y + chrome.height
  if (!overChrome) return normalizeBoundsToDisplay(bounds)

  const area = displayForBounds(bounds).workArea
  const nextY = Math.min(bounds.y + 96, area.y + area.height - bounds.height)
  return normalizeBoundsToDisplay({ ...bounds, y: Math.max(area.y, nextY) })
}

/** DIP screen rect → physical pixels (multi-monitor / per-display DPI safe). */
export function dipBoundsToPhysical(bounds: WidgetBounds): WidgetBounds {
  try {
    const physical = screen.dipToScreenRect(null, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    })
    return {
      x: Math.round(physical.x),
      y: Math.round(physical.y),
      width: Math.round(physical.width),
      height: Math.round(physical.height)
    }
  } catch {
    // Older Electron fallback — approximate with nearest display scale.
    const display = displayForBounds(bounds)
    const s = display.scaleFactor || 1
    return {
      x: Math.round(bounds.x * s),
      y: Math.round(bounds.y * s),
      width: Math.round(bounds.width * s),
      height: Math.round(bounds.height * s)
    }
  }
}

export function containsPoint(bounds: WidgetBounds, pt: Point): boolean {
  return (
    pt.x >= bounds.x &&
    pt.y >= bounds.y &&
    pt.x < bounds.x + bounds.width &&
    pt.y < bounds.y + bounds.height
  )
}
