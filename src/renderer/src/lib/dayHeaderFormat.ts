import { formatLunarDayLabel, getLunarInfo } from './lunar'

export const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'] as const

/** Compact day header: "7. 9.(목)" or "7. 9.(목) (음 6.5)". */
export function formatDayHeaderTitle(date: Date): string {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const weekday = WEEKDAY_SHORT[date.getDay()]
  const lunarLabel = formatLunarDayLabel(getLunarInfo(y, m, d))
  const solar = `${m}. ${d}.(${weekday})`
  return lunarLabel ? `${solar} (음 ${lunarLabel})` : solar
}
