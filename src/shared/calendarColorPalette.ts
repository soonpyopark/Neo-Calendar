/** MDC calendar / accent color palette (8-column grid). */
export const CALENDAR_COLOR_PALETTE = [
  '#1976d2',
  '#2196f3',
  '#3f51b5',
  '#388e3c',
  '#8bc34a',
  '#009688',
  '#9c27b0',
  '#673ab7',
  '#ba68c8',
  '#e53935',
  '#c62828',
  '#ff5722',
  '#ff9800',
  '#ffc107',
  '#ffeb3b',
  '#e91e63',
  '#d81b60',
  '#f06292',
  '#00bcd4',
  '#4dd0e1',
  '#795548',
  '#a1887f',
  '#bdbdbd'
] as const

export function getDefaultCalendarColor(index = 0): string {
  return CALENDAR_COLOR_PALETTE[Math.abs(index) % CALENDAR_COLOR_PALETTE.length] ?? '#1976d2'
}

/** 캘린더 일정 바 배경: 팔레트 색상을 흰색 위 혼합 (다크 모드) — MDC */
export const CALENDAR_EVENT_BG_OPACITY = 0.05

/** 라이트 모드 일정 바 배경 혼합 비율 — MDC */
export const CALENDAR_EVENT_BG_OPACITY_LIGHT = 0.15

/** 라이트 모드 글자·마크를 원색 대비 얼마나 진하게 (1.3 = 130%) — MDC */
export const CALENDAR_EVENT_INK_DEPTH_LIGHT = 1.3
