#!/usr/bin/env node
/**
 * 대한민국 공휴일 시드 생성기 — src/shared/seed/holidays-kr.json
 *
 * 실행 시점 연도부터 3년치를 공공데이터포털 특일 정보 API에서 받아 시드에 굽는다.
 * API 키는 빌드 PC의 환경 변수 / .env 에서만 읽고 결과 JSON에는 남지 않으므로,
 * 배포본에는 키 없이 휴일 데이터만 들어간다.
 *
 * 빌드에서는 자동으로 돌지 않는다 — 갱신이 필요할 때만 직접 실행하고, 그 사이 모든 빌드는
 * 커밋된 holidays-kr.json 을 그대로 번들한다.
 *
 * 사용:
 *   node scripts/build-holiday-seed.mjs            # 올해부터 3년
 *   node scripts/build-holiday-seed.mjs --years 5
 *   node scripts/build-holiday-seed.mjs --from 2027 --years 3
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SEED_PATH = path.join(ROOT, 'src', 'shared', 'seed', 'holidays-kr.json')
const CALENDAR_ID = 'holidays-kr'
/** `HOLIDAYS_KR_YEAR_SPAN` (src/shared/calendarDefaults.ts) 과 같은 값이어야 한다. */
const DEFAULT_YEAR_SPAN = 3
const REQUEST_TIMEOUT_MS = 30_000

const DEFAULT_CALENDAR_META = {
  id: CALENDAR_ID,
  name: '대한민국의 휴일',
  description: '공공데이터포털 특일 정보(공휴일·대체공휴일)로 관리자가 동기화할 수 있습니다.',
  color: '#d50000',
  visible: true,
  owner: 'shared',
  custom: false
}

function log(msg) {
  console.log(`[holiday-seed] ${msg}`)
}

function warn(msg) {
  console.warn(`[holiday-seed] ${msg}`)
}

function parseArgs(argv) {
  const args = { from: new Date().getFullYear(), years: DEFAULT_YEAR_SPAN }
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inlineValue] = argv[i].split('=')
    const value = inlineValue ?? argv[i + 1]
    if (flag === '--from' || flag === '--years') {
      const parsed = Number.parseInt(String(value), 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${flag} 값이 올바르지 않습니다: ${value}`)
      }
      args[flag === '--from' ? 'from' : 'years'] = parsed
      if (inlineValue === undefined) i += 1
    }
  }
  return args
}

/** `.env` 는 dotenv 없이 읽는다 (빌드 스크립트는 런타임 의존성을 쓰지 않음). */
function readEnvFile(dir) {
  const envPath = path.join(dir, '.env')
  if (!fs.existsSync(envPath)) return {}

  /** @type {Record<string, string>} */
  const result = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in result)) result[key] = value
  }
  return result
}

/**
 * 빌드 PC에서만 쓰는 키: 환경 변수 → `.env`.
 * data/settings.json 은 더 이상 키를 보관하지 않으므로 참조하지 않는다.
 * 어느 경로든 결과 시드에는 기록되지 않는다.
 */
function resolveServiceKey() {
  const fromProcess = process.env.DATA_GO_KR_SERVICE_KEY ?? process.env.HOLIDAY_API_KEY
  if (String(fromProcess ?? '').trim()) {
    return { key: String(fromProcess).trim(), source: 'process.env' }
  }

  const fileEnv = readEnvFile(ROOT)
  const fromEnvFile = fileEnv.DATA_GO_KR_SERVICE_KEY ?? fileEnv.HOLIDAY_API_KEY
  if (String(fromEnvFile ?? '').trim()) {
    return { key: String(fromEnvFile).trim(), source: '.env' }
  }

  return { key: '', source: '' }
}

function encodeServiceKey(serviceKey) {
  return /%[0-9A-Fa-f]{2}/.test(serviceKey) ? serviceKey : encodeURIComponent(serviceKey)
}

function toDateKey(digits) {
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

/** 특일 정보 API 가 XML 로 답할 때(오류·쿼터 응답 포함)의 보조 파서. */
function parseXmlItems(xml) {
  const rows = []
  const itemRe = /<item>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRe.exec(xml))) {
    const block = match[1]
    rows.push({
      locdate: /<locdate>([^<]*)<\/locdate>/i.exec(block)?.[1] ?? '',
      dateName: /<dateName>([^<]*)<\/dateName>/i.exec(block)?.[1] ?? '휴일'
    })
  }
  return rows
}

function readApiErrorMessage(text) {
  const message =
    /<errMsg>([^<]*)<\/errMsg>/i.exec(text)?.[1]
    ?? /<returnAuthMsg>([^<]*)<\/returnAuthMsg>/i.exec(text)?.[1]
    ?? /"resultMsg"\s*:\s*"([^"]*)"/i.exec(text)?.[1]
  return message?.trim() || null
}

async function fetchMonth(encodedKey, year, month) {
  const mm = String(month).padStart(2, '0')
  const url =
    `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo`
    + `?serviceKey=${encodedKey}&solYear=${year}&solMonth=${mm}&numOfRows=100&_type=json`

  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${year}-${mm} HTTP ${res.status} ${readApiErrorMessage(text) ?? ''}`.trim())
  }

  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    /* XML 응답 */
  }

  if (!parsed?.response) {
    const apiError = readApiErrorMessage(text)
    const rows = parseXmlItems(text)
    if (rows.length === 0 && apiError) throw new Error(`${year}-${mm} ${apiError}`)
    return rows
  }

  const resultCode = String(parsed.response.header?.resultCode ?? '').trim()
  if (resultCode && resultCode !== '00') {
    const message = parsed.response.header?.resultMsg ?? 'API 오류'
    throw new Error(`${year}-${mm} ${message} (resultCode=${resultCode})`)
  }

  const items = parsed.response.body?.items
  if (!items || typeof items === 'string' || !items.item) return []
  return Array.isArray(items.item) ? items.item : [items.item]
}

async function fetchYear(encodedKey, year) {
  /** @type {Map<string, string>} 날짜 → 휴일명 */
  const byDate = new Map()
  for (let month = 1; month <= 12; month += 1) {
    const rows = await fetchMonth(encodedKey, year, month)
    for (const row of rows) {
      const digits = String(row.locdate ?? '').replace(/\D/g, '')
      if (digits.length !== 8) continue
      const title = String(row.dateName ?? '').trim() || '휴일'
      const dateKey = toDateKey(digits)
      if (!byDate.has(dateKey)) byDate.set(dateKey, title)
    }
  }
  return byDate
}

function readExistingSeed() {
  if (!fs.existsSync(SEED_PATH)) return { calendar: null, events: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'))
    const events = Array.isArray(parsed) ? parsed : (parsed.events ?? [])
    return {
      calendar: Array.isArray(parsed) ? null : (parsed.calendar ?? null),
      events: Array.isArray(events) ? events : []
    }
  } catch (error) {
    warn(`기존 시드를 읽지 못했습니다 (${error.message ?? error}) — 새로 만듭니다.`)
    return { calendar: null, events: [] }
  }
}

function yearOf(event) {
  return String(event?.startDate ?? '').slice(0, 4)
}

function toSeedEvent(dateKey, title, stamp) {
  return {
    id: `kr-holiday-${dateKey.replace(/-/g, '')}`,
    calendarId: CALENDAR_ID,
    title,
    description: '대한민국 공휴일',
    location: '',
    startDate: dateKey,
    endDate: dateKey,
    allDay: true,
    startTime: null,
    endTime: null,
    repeat: 'none',
    repeatUntil: null,
    repeatCount: null,
    exdates: [],
    color: null,
    guests: [],
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: 'holidays-kr-sync'
  }
}

async function main() {
  const { from, years: yearSpan } = parseArgs(process.argv.slice(2))
  const targetYears = Array.from({ length: yearSpan }, (_, i) => from + i)
  const existing = readExistingSeed()
  const stamp = new Date().toISOString()

  log(`대상 연도: ${targetYears.join(', ')}`)

  const { key, source } = resolveServiceKey()
  /** @type {Map<number, Map<string, string>>} */
  const fetched = new Map()

  if (key) {
    log(`API 키 사용 (출처: ${source}) — 키는 시드에 기록되지 않습니다.`)
    const encodedKey = encodeServiceKey(key)
    for (const year of targetYears) {
      try {
        const byDate = await fetchYear(encodedKey, year)
        fetched.set(year, byDate)
        log(`${year}년: ${byDate.size}건 수신`)
      } catch (error) {
        warn(`${year}년 조회 실패 — ${error.message ?? error}`)
      }
    }
  } else {
    warn('API 키를 찾지 못했습니다 (.env DATA_GO_KR_SERVICE_KEY). 기존 시드를 그대로 사용합니다.')
  }

  /** @type {typeof existing.events} */
  const events = []
  /** @type {number[]} */
  const emptyYears = []

  for (const year of targetYears) {
    const byDate = fetched.get(year)
    if (byDate && byDate.size > 0) {
      for (const dateKey of Array.from(byDate.keys()).sort()) {
        events.push(toSeedEvent(dateKey, byDate.get(dateKey), stamp))
      }
      continue
    }

    // 아직 관보에 없거나 조회가 실패한 연도는 기존 시드 값을 유지해 후퇴를 막는다.
    const carried = existing.events.filter((event) => yearOf(event) === String(year))
    if (carried.length > 0) {
      events.push(...carried)
      warn(`${year}년: 기존 시드 ${carried.length}건 유지`)
    } else {
      emptyYears.push(year)
    }
  }

  if (events.length === 0) {
    throw new Error(
      '휴일 데이터를 한 건도 확보하지 못했습니다. .env 의 DATA_GO_KR_SERVICE_KEY 를 확인하세요.'
    )
  }

  events.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))

  const payload = {
    calendar: existing.calendar ?? DEFAULT_CALENDAR_META,
    events
  }
  fs.mkdirSync(path.dirname(SEED_PATH), { recursive: true })
  fs.writeFileSync(SEED_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const counts = targetYears
    .map((year) => `${year}: ${events.filter((e) => yearOf(e) === String(year)).length}건`)
    .join(', ')
  log(`저장: ${path.relative(ROOT, SEED_PATH)} (총 ${events.length}건 — ${counts})`)

  if (emptyYears.length > 0) {
    // 정부가 이듬해 공휴일을 아직 고시하지 않으면 흔히 발생한다 — 빌드는 계속한다.
    warn(`데이터가 없는 연도: ${emptyYears.join(', ')} — 고시 후 다시 실행하세요.`)
  }
}

try {
  await main()
} catch (error) {
  console.error('[holiday-seed] failed:', error.message ?? error)
  process.exit(1)
}
