import {
  CALENDAR_EVENT_BG_OPACITY,
  CALENDAR_EVENT_BG_OPACITY_LIGHT,
  CALENDAR_EVENT_INK_DEPTH_LIGHT
} from '../../../shared/calendarColorPalette'

/** Google Calendar 기본 팔레트 (MDC colors.js) */
export const GOOGLE_COLORS = {
  peacock: { base: '#039be5', bg: '#d2e3fc', text: '#174ea6', label: '파랑' },
  blueberry: { base: '#3f51b5', bg: '#d3d9f8', text: '#283593', label: '남색' },
  lavender: { base: '#7986cb', bg: '#e8eaf6', text: '#3949ab', label: '연보라' },
  grape: { base: '#8e24aa', bg: '#f3e5f5', text: '#6a1b9a', label: '자주' },
  flamingo: { base: '#e67c73', bg: '#fce8e6', text: '#c5221f', label: '연분홍' },
  basil: { base: '#0b8043', bg: '#ceead6', text: '#0d652d', label: '진녹색' },
  sage: { base: '#33b679', bg: '#e6f4ea', text: '#137333', label: '녹색' },
  banana: { base: '#f6bf26', bg: '#fef7e0', text: '#b06000', label: '노랑' },
  tangerine: { base: '#f4511e', bg: '#feefe3', text: '#e8710a', label: '주황' },
  tomato: { base: '#d50000', bg: '#fce8e6', text: '#c5221f', label: '빨강' },
  graphite: { base: '#616161', bg: '#f1f3f4', text: '#3c4043', label: '회색' }
} as const

export type CalendarTheme = {
  base: string
  bg: string
  text: string
  accent: string
  label?: string
}

const paletteByBase: Record<string, { base: string; bg: string; text: string; label: string }> =
  Object.fromEntries(Object.values(GOOGLE_COLORS).map((c) => [c.base.toLowerCase(), c]))

function isDarkMode(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
}

function resolveEventBgOpacity(): number {
  return isDarkMode() ? CALENDAR_EVENT_BG_OPACITY : CALENDAR_EVENT_BG_OPACITY_LIGHT
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return null
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  }
}

/** Mix `hex` toward `mix`; `weight` 1 = all hex. */
function mixHex(hex: string, mix: string, weight: number): string {
  const a = hexToRgb(hex)
  const b = hexToRgb(mix)
  if (!a || !b) return hex
  const r = Math.round(a.r * weight + b.r * (1 - weight))
  const g = Math.round(a.g * weight + b.g * (1 - weight))
  const bl = Math.round(a.b * weight + b.b * (1 - weight))
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Darken `hex` toward black by `depth` (1.3 = 130% 진하게 → keep ~77% of original). */
function deepenInk(hex: string, depth = CALENDAR_EVENT_INK_DEPTH_LIGHT): string {
  const safe = Math.max(depth, 1)
  return mixHex(hex, '#000000', 1 / safe)
}

function themeTextForHex(hex: string): string {
  const key = hex.toLowerCase()
  if (key === '#ffffff' || key === '#fff') return '#4a4a4a'
  return hex
}

/**
 * MDC getCalendarTheme — light pastel chip + ink in light mode;
 * dark mode keeps light pastel chips (readable on dark calendar surface).
 */
export function getCalendarTheme(hex = '#039be5'): CalendarTheme {
  const key = hex.toLowerCase()
  const dark = isDarkMode()
  const opacity = resolveEventBgOpacity()

  if (paletteByBase[key]) {
    const preset = paletteByBase[key]
    if (dark) {
      return { ...preset, accent: preset.base }
    }
    return {
      base: preset.base,
      bg: mixHex(hex, '#ffffff', opacity),
      text: deepenInk(preset.text),
      accent: deepenInk(preset.base)
    }
  }

  const text = themeTextForHex(hex)
  return {
    base: hex,
    bg: mixHex(hex, '#ffffff', opacity),
    text: dark ? text : deepenInk(text),
    accent: dark ? hex : deepenInk(hex)
  }
}

/** CSS vars + inline colors for an event bar (MDC MonthView / getEventStyle). */
export function getEventBarStyle(
  hex: string,
  options?: { completed?: boolean; lane?: number }
): Record<string, string | number> {
  const theme = getCalendarTheme(hex)
  const accent = options?.completed ? '#9aa0a6' : (theme.accent ?? theme.base)
  const completed = Boolean(options?.completed)
  return {
    '--event-lane': options?.lane ?? 0,
    '--event-bg': theme.bg,
    '--event-text': completed ? '#80868b' : theme.text,
    '--event-accent': accent,
    backgroundColor: completed ? 'transparent' : theme.bg,
    color: completed ? '#80868b' : theme.text
  }
}
