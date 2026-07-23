import solarLunar from 'solarlunar'

/**
 * 삼복: 하지 뒤 3·4번째 경일 = 초복·중복, 입추 당일 포함 첫 경일 = 말복.
 * MDC sambok.js 이식.
 */

const yearCache = new Map<number, Map<string, string>>()

function dateKey(month: number, day: number): string {
  return `${month}-${day}`
}

function addDays(year: number, month: number, day: number, delta: number): [number, number, number] {
  const dt = new Date(year, month - 1, day + delta)
  return [dt.getFullYear(), dt.getMonth() + 1, dt.getDate()]
}

function isGengDay(year: number, month: number, day: number): boolean {
  try {
    const info = solarLunar.solar2lunar(year, month, day)
    if (info === -1 || !info) return false
    return Boolean(info.gzDay && String(info.gzDay).startsWith('庚'))
  } catch {
    return false
  }
}

function buildYearSambok(year: number): Map<string, string> {
  const map = new Map<string, string>()
  if (year < 1900 || year > 2100) return map

  try {
    const xiaZhiDay = solarLunar.getTerm(year, 12)
    const liQiuDay = solarLunar.getTerm(year, 15)
    if (!xiaZhiDay || !liQiuDay) return map

    const gengAfterXiaZhi: Array<[number, number, number]> = []
    for (let i = 1; i <= 80 && gengAfterXiaZhi.length < 4; i += 1) {
      const [y, m, d] = addDays(year, 6, xiaZhiDay, i)
      if (y !== year) continue
      if (isGengDay(y, m, d)) gengAfterXiaZhi.push([y, m, d])
    }

    const cho = gengAfterXiaZhi[2]
    const jung = gengAfterXiaZhi[3]
    if (cho) map.set(dateKey(cho[1], cho[2]), '초복')
    if (jung) map.set(dateKey(jung[1], jung[2]), '중복')

    for (let i = 0; i <= 40; i += 1) {
      const [y, m, d] = addDays(year, 8, liQiuDay, i)
      if (y !== year) break
      if (isGengDay(y, m, d)) {
        map.set(dateKey(m, d), '말복')
        break
      }
    }
  } catch {
    /* out-of-range */
  }

  return map
}

function getYearMap(year: number): Map<string, string> {
  let cached = yearCache.get(year)
  if (!cached) {
    cached = buildYearSambok(year)
    yearCache.set(year, cached)
    if (yearCache.size > 40) {
      const oldest = yearCache.keys().next().value
      if (oldest != null) yearCache.delete(oldest)
    }
  }
  return cached
}

/** @returns 초복 | 중복 | 말복 | null */
export function getSambokLabel(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100) return null
  return getYearMap(year).get(dateKey(month, day)) ?? null
}
