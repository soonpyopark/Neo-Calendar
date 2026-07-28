import { readFileSync } from 'node:fs'
import { HOLIDAYS_KR_CALENDAR_ID } from '../../shared/calendarDefaults'
import type {
  CalendarEvent,
  SyncHolidaysInput,
  SyncHolidaysResult
} from '../../shared/calendarTypes'
import type { CalendarStore } from './CalendarStore'
import { holidaySeedCandidatePaths } from './holidaySeedPaths'

type SeedFile = {
  events?: CalendarEvent[]
  calendar?: unknown
}

function yearOf(event: Pick<CalendarEvent, 'startDate'>): number | null {
  const start = event.startDate
  if (!start || start.length < 4) return null
  const y = Number(start.slice(0, 4))
  return Number.isFinite(y) ? y : null
}

function encodeServiceKey(serviceKey: string): string {
  return /%[0-9A-Fa-f]{2}/.test(serviceKey) ? serviceKey : encodeURIComponent(serviceKey)
}

function loadSeedEvents(): CalendarEvent[] {
  for (const path of holidaySeedCandidatePaths()) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as SeedFile | CalendarEvent[]
      const events = Array.isArray(raw) ? raw : raw.events
      if (!Array.isArray(events) || events.length === 0) continue
      return events.map((e) => ({
        ...e,
        calendarId: HOLIDAYS_KR_CALENDAR_ID,
        allDay: true
      }))
    } catch {
      /* try next */
    }
  }
  return []
}

function parseXmlHolidays(xml: string): CalendarEvent[] {
  const items: CalendarEvent[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null
  while ((match = itemRe.exec(xml))) {
    const block = match[1]
    const locdate = /<locdate>([^<]*)<\/locdate>/i.exec(block)?.[1] ?? ''
    const dateName = /<dateName>([^<]*)<\/dateName>/i.exec(block)?.[1] ?? '휴일'
    const digits = locdate.replace(/\D/g, '')
    if (digits.length !== 8) continue
    const dateKey = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    items.push({
      id: `kr-holiday-${digits}`,
      calendarId: HOLIDAYS_KR_CALENDAR_ID,
      title: dateName,
      allDay: true,
      startDate: dateKey,
      endDate: dateKey
    })
  }
  return items
}

async function fetchFromApi(serviceKey: string, years: number[]): Promise<CalendarEvent[]> {
  const encoded = encodeServiceKey(serviceKey)
  const list: CalendarEvent[] = []
  const seen = new Set<string>()

  for (const year of years) {
    for (let month = 1; month <= 12; month += 1) {
      const mm = String(month).padStart(2, '0')
      const url =
        `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo` +
        `?serviceKey=${encoded}&solYear=${year}&solMonth=${mm}&numOfRows=100&_type=json`

      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      const text = await res.text()

      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        for (const ev of parseXmlHolidays(text)) {
          if (!seen.has(ev.id)) {
            seen.add(ev.id)
            list.push(ev)
          }
        }
        continue
      }

      const root = parsed as {
        response?: {
          body?: {
            items?: { item?: unknown } | string
          }
        }
      }
      if (!root.response) {
        for (const ev of parseXmlHolidays(text)) {
          if (!seen.has(ev.id)) {
            seen.add(ev.id)
            list.push(ev)
          }
        }
        continue
      }

      const items = root.response.body?.items
      if (!items || typeof items === 'string' || !items.item) continue
      const rawItems = Array.isArray(items.item) ? items.item : [items.item]

      for (const item of rawItems) {
        const row = item as { locdate?: string | number; dateName?: string }
        const locdate = String(row.locdate ?? '')
        const dateName = row.dateName?.trim() || '휴일'
        const digits = locdate.replace(/\D/g, '')
        if (digits.length !== 8) continue
        const dateKey = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
        const id = `kr-holiday-${digits}`
        if (seen.has(id)) continue
        seen.add(id)
        list.push({
          id,
          calendarId: HOLIDAYS_KR_CALENDAR_ID,
          title: dateName,
          allDay: true,
          startDate: dateKey,
          endDate: dateKey
        })
      }
    }
  }

  return list
}

/** Seed `settings.holidaysKr.serviceKey` from `.env` when not already remembered. */
export function applyHolidayKeyFromEnv(store: CalendarStore, serviceKey: string): boolean {
  const key = serviceKey.trim()
  if (!key) return false
  const snap = store.getSnapshot()
  const hk = snap.settings.holidaysKr
  if (hk.rememberKey && hk.serviceKey.trim()) return false
  store.patchStoreSettings({
    holidaysKr: {
      ...hk,
      serviceKey: key,
      rememberKey: true,
      source: hk.source ?? 'env'
    }
  })
  console.log('[holidays-kr] Applied DATA_GO_KR_SERVICE_KEY into settings')
  return true
}

export async function syncKoreanHolidays(
  store: CalendarStore,
  body: SyncHolidaysInput = {}
): Promise<SyncHolidaysResult> {
  const snap = store.getSnapshot()
  const holidaysKr = snap.settings.holidaysKr
  const serviceKey =
    (body.serviceKey ?? '').trim()
    || (holidaysKr.rememberKey ? holidaysKr.serviceKey.trim() : '')
    || ''

  let years = Array.isArray(body.years)
    ? body.years.filter((y) => Number.isFinite(y)).map((y) => Math.trunc(y))
    : []
  if (years.length === 0) {
    const y = new Date().getFullYear()
    years = [y - 1, y, y + 1]
  }

  const seedEvents = loadSeedEvents()
  let events: CalendarEvent[]
  let source: string
  let fallbackMessage: string | null = null

  if (serviceKey) {
    try {
      events = await fetchFromApi(serviceKey, years)
      source = 'api'
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const filtered = seedEvents.filter((e) => {
        const yy = yearOf(e)
        return yy != null && years.includes(yy)
      })
      if (filtered.length === 0) throw error
      events = filtered
      source = 'seed-fallback'
      fallbackMessage = `API 실패(${msg}) — 시드 데이터 사용`
    }
  } else if (seedEvents.length > 0) {
    events = seedEvents.filter((e) => {
      const yy = yearOf(e)
      return yy != null && years.includes(yy)
    })
    if (events.length === 0) events = seedEvents
    source = 'seed'
  } else {
    throw new Error('공공데이터포털 API 키가 없고 시드 데이터도 없습니다.')
  }

  store.ensureHolidaysKrCalendar()
  store.replaceHolidaysKrEvents(events)

  const rememberExplicit = body.rememberKey !== undefined
  const remember = rememberExplicit ? Boolean(body.rememberKey) : Boolean(holidaysKr.rememberKey)
  const keyToStore = remember
    ? serviceKey || holidaysKr.serviceKey.trim()
    : ''

  const message =
    fallbackMessage
    ?? (source === 'api'
      ? `API 동기화 완료 (${events.length}건)`
      : source === 'seed'
        ? '시드 데이터로 동기화했습니다.'
        : fallbackMessage)

  store.patchStoreSettings({
    holidaysKr: {
      ...holidaysKr,
      serviceKey: keyToStore,
      rememberKey: remember && Boolean(keyToStore),
      ok: true,
      skipped: false,
      reason: null,
      message,
      years,
      count: events.length,
      lastSyncedAt: new Date().toISOString(),
      source
    }
  })

  return { ok: true, count: events.length, years, source, message }
}
