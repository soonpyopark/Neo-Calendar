import { toLunar } from 'kor-lunar'
import { getSambokLabel } from './sambok'
import { getSolarTermLabel } from './solarTerms'

const DAY_CACHE_MAX = 400

export type LunarInfo = {
  day: number
  month: number
  year: number
  isLeapMonth: boolean
  secha: string
  wolgeon: string
}

export type DayParts = {
  solar: number
  lunar: string | null
  lunarDay: number | null
  solarTerm: string | null
}

const lunarInfoCache = new Map<string, LunarInfo>()
const dayPartsCache = new Map<string, DayParts>()

function setCapped<T>(cache: Map<string, T>, key: string, value: T): void {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  if (cache.size > DAY_CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest != null) cache.delete(oldest)
  }
}

function computeLunarInfo(year: number, month: number, day: number): LunarInfo {
  try {
    const lunar = toLunar(year, month, day)
    return {
      day: lunar.day,
      month: lunar.month,
      year: lunar.year,
      isLeapMonth: Boolean(lunar.isLeapMonth),
      secha: lunar.secha ?? '',
      wolgeon: lunar.wolgeon ?? ''
    }
  } catch {
    return { day: 0, month: 0, year: 0, isLeapMonth: false, secha: '', wolgeon: '' }
  }
}

export function getLunarInfo(year: number, month: number, day: number): LunarInfo {
  const key = `${year}-${month}-${day}`
  let cached = lunarInfoCache.get(key)
  if (!cached) {
    cached = computeLunarInfo(year, month, day)
    setCapped(lunarInfoCache, key, cached)
  }
  return cached
}

export function formatLunarDayLabel(lunar: Pick<LunarInfo, 'day' | 'month' | 'isLeapMonth'>): string | null {
  if (!lunar?.day) return null
  const month = lunar.isLeapMonth ? `윤${lunar.month}` : `${lunar.month}`
  return `${month}. ${lunar.day}.`
}

function computeDayParts(year: number, month: number, day: number): DayParts {
  const lunar = getLunarInfo(year, month, day)
  const term = getSolarTermLabel(year, month, day)
  const sambok = getSambokLabel(year, month, day)
  const solarTerm = [term, sambok].filter(Boolean).join(' ') || null
  return {
    solar: day,
    lunar: formatLunarDayLabel(lunar),
    lunarDay: lunar.day || null,
    solarTerm
  }
}

/** 양력 일 + 음력 라벨 + 절기/삼복 (MDC getDayParts). */
export function getDayParts(year: number, month: number, day: number): DayParts {
  const key = `${year}-${month}-${day}`
  let cached = dayPartsCache.get(key)
  if (!cached) {
    cached = computeDayParts(year, month, day)
    setCapped(dayPartsCache, key, cached)
  }
  return cached
}

/** 월 헤더용: `병오년 5월 ~ 6월` */
export function getLunarMonthLabel(year: number, month: number): string {
  const start = getLunarInfo(year, month, 1)
  const lastDay = new Date(year, month, 0).getDate()
  const end = getLunarInfo(year, month, lastDay)

  const startMonth = start.isLeapMonth ? `윤${start.month}` : `${start.month}`
  const endMonth = end.isLeapMonth ? `윤${end.month}` : `${end.month}`
  const yearLabel = start.secha ? `${start.secha}년` : ''

  if (startMonth === endMonth) {
    return `${yearLabel} ${startMonth}월`.trim()
  }
  return `${yearLabel} ${startMonth}월 ~ ${endMonth}월`.trim()
}
