import type { HeaderTitleOptions } from './calendarTypes'
import { DEFAULT_ACCENT_COLOR } from './calendarColorPalette'

/** Room for Korean copy plus a couple of emoji (UTF-16 units). */
export const HEADER_TITLE_MAX_LEN = 32
export const HEADER_TITLE_FONT_MIN = 14
export const HEADER_TITLE_FONT_MAX = 28
export const HEADER_TITLE_FONT_DEFAULT = 20
/** Matches default viewOptions.accentColor (테마 색상). */
export const HEADER_TITLE_COLOR_DEFAULT = DEFAULT_ACCENT_COLOR
export const HEADER_TITLE_TEXT_DEFAULT = '😎 당신을 위한 데스크톱 캘린더'

export const DEFAULT_HEADER_TITLE: HeaderTitleOptions = {
  enabled: true,
  text: HEADER_TITLE_TEXT_DEFAULT,
  color: HEADER_TITLE_COLOR_DEFAULT,
  fontSizePx: HEADER_TITLE_FONT_DEFAULT
}

function clampFontSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return HEADER_TITLE_FONT_DEFAULT
  return Math.min(HEADER_TITLE_FONT_MAX, Math.max(HEADER_TITLE_FONT_MIN, Math.round(n)))
}

function normalizeColor(value: unknown): string {
  if (typeof value !== 'string') return HEADER_TITLE_COLOR_DEFAULT
  const t = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    const a = t[1]
    const b = t[2]
    const c = t[3]
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase()
  }
  return HEADER_TITLE_COLOR_DEFAULT
}

/** First-iteration placeholder (disabled + empty) → promote to current defaults. */
function isLegacyUnsetHeaderTitle(raw: Partial<HeaderTitleOptions>): boolean {
  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  const color = typeof raw.color === 'string' ? raw.color.trim().toLowerCase() : ''
  return (
    raw.enabled === false
    && text === ''
    && (color === '' || color === '#5f6368')
  )
}

/** Sanitize persisted / patched header title options. */
export function normalizeHeaderTitle(input: unknown): HeaderTitleOptions {
  if (!input || typeof input !== 'object') return { ...DEFAULT_HEADER_TITLE }
  const raw = input as Partial<HeaderTitleOptions>
  if (isLegacyUnsetHeaderTitle(raw)) return { ...DEFAULT_HEADER_TITLE }
  let text =
    typeof raw.text === 'string'
      ? raw.text.replace(/\s+/g, ' ').trim().slice(0, HEADER_TITLE_MAX_LEN)
      : DEFAULT_HEADER_TITLE.text
  // Previous factory defaults → current copy (emoji + wording).
  if (
    text === '나를 위한 데스크톱 캘린더'
    || text === '당신을 위한 데스크톱 캘린더'
    || text === '😎당신을 위한 데스크톱 캘린더'
  ) {
    text = HEADER_TITLE_TEXT_DEFAULT
  }
  return {
    enabled: raw.enabled === undefined ? DEFAULT_HEADER_TITLE.enabled : Boolean(raw.enabled),
    text: text || DEFAULT_HEADER_TITLE.text,
    color: normalizeColor(raw.color),
    fontSizePx: clampFontSize(raw.fontSizePx)
  }
}
