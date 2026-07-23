import solarLunar from 'solarlunar'

/**
 * 24절기 — solarlunar 한자명 → 한글 (MDC solarTerms.js).
 */
const SOLAR_TERM_KO: Record<string, string> = {
  小寒: '소한',
  大寒: '대한',
  立春: '입춘',
  雨水: '우수',
  惊蛰: '경칩',
  春分: '춘분',
  清明: '청명',
  谷雨: '곡우',
  立夏: '입하',
  小满: '소만',
  芒种: '망종',
  夏至: '하지',
  小暑: '소서',
  大暑: '대서',
  立秋: '입추',
  处暑: '처서',
  白露: '백로',
  秋分: '추분',
  寒露: '한로',
  霜降: '상강',
  立冬: '입동',
  小雪: '소설',
  大雪: '대설',
  冬至: '동지'
}

/** @returns 절기 시작일이면 한글명, 아니면 null (1900–2100). */
export function getSolarTermLabel(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100) return null
  try {
    const info = solarLunar.solar2lunar(year, month, day)
    if (info === -1 || !info) return null
    if (info.isTerm && info.term) {
      return SOLAR_TERM_KO[info.term] ?? null
    }
  } catch {
    /* out-of-range */
  }
  return null
}
