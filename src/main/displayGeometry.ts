import { screen, type Display } from 'electron'
import type { WidgetBounds } from '../shared/ipc'

export type Point = { x: number; y: number }

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

/** Clamp widget bounds into the nearest display's full bounds (DIP). */
export function normalizeBoundsToDisplay(bounds: WidgetBounds): WidgetBounds {
  const display = displayForBounds(bounds)
  const area = display.bounds
  const width = Math.min(Math.max(320, snapToTen(bounds.width)), area.width)
  const height = Math.min(Math.max(240, snapToTen(bounds.height)), area.height)
  const maxX = area.x + Math.max(0, area.width - width)
  const maxY = area.y + Math.max(0, area.height - height)
  return {
    x: Math.min(Math.max(snapToTen(bounds.x), area.x), maxX),
    y: Math.min(Math.max(snapToTen(bounds.y), area.y), maxY),
    width,
    height
  }
}

/** Center on the display under the cursor (fallback: primary). */
export function centerOnCursorDisplay(width: number, height: number): WidgetBounds {
  const pt = screen.getCursorScreenPoint()
  const area = displayForPoint(pt).workArea
  const w = Math.min(Math.max(640, snapToTen(width)), area.width)
  const h = Math.min(Math.max(480, snapToTen(height)), area.height)
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
  const w = Math.min(Math.max(640, snapToTen(bounds.width)), area.width)
  const h = Math.min(Math.max(480, snapToTen(bounds.height)), area.height)
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
