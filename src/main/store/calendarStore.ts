/**
 * Neo Calendar main-process data store.
 *
 * Persists everything under a single `dataRoot` directory (typically
 * `app.getPath('userData')/data`):
 *
 *   settings.json                 → { settings, tags, updatedAt }
 *   calendars/{dataKey}.json      → { version: 1, calendar, events }
 *   attachments/{eventId}/...     → copied attachment files
 *
 * Ported (loosely, not line-for-line) from the My Desktop Calendar WPF app's
 * shared/constants.js defaults and calendarInterchange.js import/export rules.
 */

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import type { Attachment, Calendar, CalendarEvent, CalendarFile, Settings, Store, Tag } from './types'

export * from './types'

/**
 * The bundled Korean-holiday seed dataset (shared/seed/holidays-kr.json) lives
 * outside `src/`, so it's loaded via `fs` at runtime instead of a static ESM
 * import — this keeps it out of the tsconfig `include` file list and works
 * both from the bundled `out/main/main.js` (electron-vite) and directly from
 * `src/main/store` during type-checking / ts-node style execution.
 */
function loadHolidaysSeed(): { calendar: Calendar; events: CalendarEvent[] } {
  const candidates = [
    path.join(__dirname, '../../shared/seed/holidays-kr.json'), // bundled: out/main → project root
    path.join(__dirname, '../../../shared/seed/holidays-kr.json'), // source layout: src/main/store → project root
  ]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return JSON.parse(fs.readFileSync(candidate, 'utf-8'))
      }
    } catch (error) {
      console.warn(`[calendarStore] failed to parse holiday seed at ${candidate}:`, error)
    }
  }
  console.warn('[calendarStore] bundled Korean holiday seed data not found; syncKoreanHolidays will rely on the API only.')
  return { calendar: { id: HOLIDAYS_KR_CALENDAR_ID, name: '대한민국의 휴일' }, events: [] }
}

/* ------------------------------------------------------------------------ *
 * Defaults (mirrors shared/constants.js)
 * ------------------------------------------------------------------------ */

export const STORE_VERSION = 2

export const PRIMARY_CALENDAR_ID = 'primary'
export const PRIMARY_CALENDAR_COLOR = '#f6bf26'
export const HOLIDAYS_KR_CALENDAR_ID = 'holidays-kr'

export const CALENDAR_COLORS = [
  '#7986cb',
  '#33b679',
  '#8e24aa',
  '#e67c73',
  '#f6bf26',
  '#f4511e',
  '#039be5',
  '#616161',
  '#3f51b5',
  '#0b8043',
  '#d50000',
]

const DEFAULT_CALENDARS: Calendar[] = [
  { id: PRIMARY_CALENDAR_ID, name: '기본 캘린더', color: PRIMARY_CALENDAR_COLOR, visible: true, owner: 'local', custom: false },
  { id: HOLIDAYS_KR_CALENDAR_ID, name: '대한민국의 휴일', color: '#d50000', visible: true, owner: 'shared', custom: false },
]

/** Lazily-loaded, cached bundled Korean holiday seed (see `loadHolidaysSeed` above). */
const holidaysSeed = loadHolidaysSeed()

const DEFAULT_TAGS: Tag[] = [
  { id: 'tag-admin', name: '행정', color: '#039be5', sortOrder: 0 },
  { id: 'tag-work', name: '작업', color: '#ffe252', sortOrder: 1 },
  { id: 'tag-duty', name: '회의', color: '#8e24aa', sortOrder: 2 },
  { id: 'tag-trip', name: '출장', color: '#f4511e', sortOrder: 3 },
  { id: 'tag-personal', name: '개인', color: '#33b679', sortOrder: 4 },
]

const DEFAULT_WIDGET_SETTINGS = {
  launchMode: 'window',
  enabled: false,
  alwaysOnTop: false,
  chromeTopInset: 0,
  chromeLeftInset: 0,
  chromeRightInset: 0,
  chromeBottomInset: 0,
  bounds: { x: 700, y: 15, width: 1195, height: 1005 },
  margins: { left: 0.2, top: 0.05, right: 0.05, bottom: 0.05 },
}

const DEFAULT_SETTINGS: Settings = {
  ownerName: '',
  timezone: 'Asia/Seoul',
  timezoneLabel: '(GMT+09:00) 한국 표준시 - 서울',
  notifications: { enabled: 'none', reminderTiming: '1min', playSound: true, onlyYesOrMaybe: false },
  viewOptions: {
    showWeekNumbers: true,
    weekStartsOnSunday: true,
    colorScheme: 'light',
    accentColor: CALENDAR_COLORS[0],
    runAtStartup: true,
    eventsHidden: false,
    completedHidden: false,
  },
  holidaysKr: {
    serviceKey: '',
    rememberKey: false,
    ok: null,
    skipped: false,
    reason: null,
    message: null,
    years: [],
    count: 0,
    lastSyncedAt: null,
  },
  widget: DEFAULT_WIDGET_SETTINGS,
  dayColors: {},
  allowedIpCidrs: [],
}

function cloneDefaultSettings(): Settings {
  return clone(DEFAULT_SETTINGS)
}

function cloneDefaultTags(): Tag[] {
  return clone(DEFAULT_TAGS)
}

function cloneDefaultCalendars(): Calendar[] {
  return clone(DEFAULT_CALENDARS)
}

/* ------------------------------------------------------------------------ *
 * Small fs / misc utilities
 * ------------------------------------------------------------------------ */

function ensureDirSync(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch (error) {
    console.warn(`[calendarStore] failed to read ${filePath}:`, error)
    return fallback
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  ensureDirSync(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function nowIso(): string {
  return new Date().toISOString()
}

function nowStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
}

function toDataKey(calendarId: string): string {
  const key = String(calendarId ?? '').replace(/[^a-zA-Z0-9_-]+/g, '_')
  return key || 'calendar'
}

function mergeSettings(current: Settings, patch: Record<string, any>): Settings {
  const next: Settings = { ...current }
  for (const [key, value] of Object.entries(patch ?? {})) {
    const currentValue = (current as Record<string, any>)[key]
    const isPlainObjectValue = value && typeof value === 'object' && !Array.isArray(value)
    const isPlainObjectCurrent = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
    if (isPlainObjectValue && isPlainObjectCurrent) {
      next[key] = { ...currentValue, ...value }
    } else {
      next[key] = value
    }
  }
  return next
}

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.json': 'application/json',
}

function guessMimeType(fileName: string): string {
  return MIME_TYPES[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream'
}

/* ------------------------------------------------------------------------ *
 * CalendarStore
 * ------------------------------------------------------------------------ */

export class CalendarStore {
  private readonly dataRoot: string
  private readonly settingsPath: string
  private readonly calendarsDir: string
  private readonly attachmentsDir: string

  private loaded = false
  private settings: Settings = cloneDefaultSettings()
  private tags: Tag[] = cloneDefaultTags()
  private updatedAt: string = nowIso()
  private calendarFiles: Map<string, CalendarFile> = new Map()

  constructor(dataRoot: string) {
    this.dataRoot = dataRoot
    this.settingsPath = path.join(dataRoot, 'settings.json')
    this.calendarsDir = path.join(dataRoot, 'calendars')
    this.attachmentsDir = path.join(dataRoot, 'attachments')
  }

  /* -------------------------- load / persist -------------------------- */

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loadSync()
  }

  private loadSync(): void {
    ensureDirSync(this.dataRoot)
    ensureDirSync(this.calendarsDir)
    ensureDirSync(this.attachmentsDir)

    const settingsFile = readJsonFile<{ settings?: Settings; tags?: Tag[]; updatedAt?: string } | null>(
      this.settingsPath,
      null,
    )
    if (settingsFile) {
      this.settings = mergeSettings(cloneDefaultSettings(), settingsFile.settings ?? {})
      this.tags = Array.isArray(settingsFile.tags) && settingsFile.tags.length ? settingsFile.tags : cloneDefaultTags()
      this.updatedAt = settingsFile.updatedAt ?? nowIso()
    } else {
      this.settings = cloneDefaultSettings()
      this.tags = cloneDefaultTags()
      this.updatedAt = nowIso()
      this.persistSettingsSync()
    }

    this.calendarFiles = new Map()
    const entries = fs.existsSync(this.calendarsDir)
      ? fs.readdirSync(this.calendarsDir).filter((entry) => entry.toLowerCase().endsWith('.json'))
      : []
    for (const entry of entries) {
      const full = path.join(this.calendarsDir, entry)
      const data = readJsonFile<CalendarFile | null>(full, null)
      if (data?.calendar?.id) {
        this.calendarFiles.set(data.calendar.id, {
          version: data.version ?? 1,
          calendar: data.calendar,
          events: Array.isArray(data.events) ? data.events : [],
        })
      }
    }

    for (const defaultCalendar of cloneDefaultCalendars()) {
      if (!this.calendarFiles.has(defaultCalendar.id)) {
        this.calendarFiles.set(defaultCalendar.id, { version: 1, calendar: defaultCalendar, events: [] })
        this.persistCalendarFileSync(defaultCalendar.id)
      }
    }

    this.loaded = true
  }

  private persistSettingsSync(): void {
    writeJsonFile(this.settingsPath, { settings: this.settings, tags: this.tags, updatedAt: this.updatedAt })
  }

  private persistCalendarFileSync(calendarId: string): void {
    const file = this.calendarFiles.get(calendarId)
    if (!file) return
    writeJsonFile(path.join(this.calendarsDir, `${toDataKey(calendarId)}.json`), {
      version: file.version,
      calendar: file.calendar,
      events: file.events,
    })
  }

  private touch(): void {
    this.updatedAt = nowIso()
    this.persistSettingsSync()
  }

  private assertEventsMutable(calendarId: string, allowSync = false): void {
    if (!allowSync && calendarId === HOLIDAYS_KR_CALENDAR_ID) {
      throw new Error('공휴일 캘린더의 일정은 동기화(syncKoreanHolidays)를 통해서만 변경할 수 있습니다.')
    }
  }

  private locateEvent(eventId: string): { calendarId: string; file: CalendarFile; index: number } | null {
    for (const [calendarId, file] of this.calendarFiles) {
      const index = file.events.findIndex((event) => event.id === eventId)
      if (index !== -1) return { calendarId, file, index }
    }
    return null
  }

  private listCalendarsInternal(): Calendar[] {
    return [...this.calendarFiles.values()].map((file) => clone(file.calendar))
  }

  private listAllEventsInternal(): CalendarEvent[] {
    const events: CalendarEvent[] = []
    for (const file of this.calendarFiles.values()) events.push(...file.events)
    return clone(events)
  }

  private removeAttachmentsDirSync(eventId: string): void {
    try {
      fs.rmSync(path.join(this.attachmentsDir, eventId), { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }

  /* ------------------------------- store -------------------------------- */

  readStore(): Store {
    this.ensureLoaded()
    return {
      version: STORE_VERSION,
      settings: clone(this.settings),
      calendars: this.listCalendarsInternal(),
      events: this.listAllEventsInternal(),
      tags: clone(this.tags),
      updatedAt: this.updatedAt,
    }
  }

  /* ------------------------------- events -------------------------------- */

  createEvent(payload: Record<string, any> = {}): CalendarEvent {
    this.ensureLoaded()
    const calendarId = String(payload.calendarId ?? PRIMARY_CALENDAR_ID)
    this.assertEventsMutable(calendarId)
    const file = this.calendarFiles.get(calendarId)
    if (!file) throw new Error(`존재하지 않는 캘린더입니다: ${calendarId}`)
    if (!payload.startDate) throw new Error('startDate는 필수입니다.')

    const now = nowIso()
    const allDay = payload.allDay !== false
    const event: CalendarEvent = {
      id: randomUUID(),
      calendarId,
      title: String(payload.title ?? '(제목 없음)'),
      description: payload.description ?? '',
      location: payload.location ?? '',
      startDate: payload.startDate,
      endDate: payload.endDate ?? payload.startDate,
      allDay,
      startTime: allDay ? null : (payload.startTime ?? null),
      endTime: allDay ? null : (payload.endTime ?? null),
      repeat: payload.repeat ?? 'none',
      repeatUntil: payload.repeatUntil ?? null,
      repeatCount: payload.repeatCount ?? null,
      exdates: Array.isArray(payload.exdates) ? payload.exdates : [],
      color: payload.color ?? null,
      guests: Array.isArray(payload.guests) ? payload.guests : [],
      completed: Boolean(payload.completed ?? false),
      markerShape: payload.markerShape ?? null,
      links: Array.isArray(payload.links) ? payload.links : [],
      link: payload.link ?? '',
      sortOrder: payload.sortOrder ?? null,
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      attachments: [],
      createdAt: now,
      updatedAt: now,
      createdBy: payload.createdBy ?? 'user',
    }

    file.events.push(event)
    this.persistCalendarFileSync(calendarId)
    this.touch()
    return clone(event)
  }

  updateEvent(id: string, payload: Record<string, any> = {}): CalendarEvent {
    this.ensureLoaded()
    const located = this.locateEvent(id)
    if (!located) throw new Error(`일정을 찾을 수 없습니다: ${id}`)
    const { calendarId: currentCalendarId, file, index } = located
    this.assertEventsMutable(currentCalendarId)

    const targetCalendarId = payload.calendarId ? String(payload.calendarId) : currentCalendarId
    if (targetCalendarId !== currentCalendarId) {
      this.assertEventsMutable(targetCalendarId)
      if (!this.calendarFiles.has(targetCalendarId)) throw new Error(`존재하지 않는 캘린더입니다: ${targetCalendarId}`)
    }

    const existing = file.events[index]
    const merged: CalendarEvent = {
      ...existing,
      ...payload,
      id: existing.id,
      calendarId: targetCalendarId,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    }

    file.events.splice(index, 1)
    this.persistCalendarFileSync(currentCalendarId)

    const targetFile = this.calendarFiles.get(targetCalendarId)!
    targetFile.events.push(merged)
    this.persistCalendarFileSync(targetCalendarId)

    this.touch()
    return clone(merged)
  }

  deleteEvent(id: string): { ok: true } {
    this.ensureLoaded()
    const located = this.locateEvent(id)
    if (!located) throw new Error(`일정을 찾을 수 없습니다: ${id}`)
    this.assertEventsMutable(located.calendarId)

    located.file.events.splice(located.index, 1)
    this.persistCalendarFileSync(located.calendarId)
    this.removeAttachmentsDirSync(id)
    this.touch()
    return { ok: true }
  }

  /* ----------------------------- calendars ------------------------------- */

  createCalendar(payload: Record<string, any> = {}): Calendar {
    this.ensureLoaded()
    const id = payload.id ? String(payload.id) : randomUUID()
    if (this.calendarFiles.has(id)) throw new Error(`이미 존재하는 캘린더입니다: ${id}`)

    const colorIndex = this.calendarFiles.size % CALENDAR_COLORS.length
    const calendar: Calendar = {
      id,
      name: String(payload.name ?? '새 캘린더'),
      description: payload.description ?? '',
      color: payload.color ?? CALENDAR_COLORS[colorIndex],
      visible: payload.visible !== false,
      owner: payload.owner ?? 'local',
      ownerLoginId: payload.ownerLoginId ?? null,
      custom: true,
    }

    this.calendarFiles.set(id, { version: 1, calendar, events: [] })
    this.persistCalendarFileSync(id)
    this.touch()
    return clone(calendar)
  }

  patchCalendar(id: string, payload: Record<string, any> = {}): Calendar {
    this.ensureLoaded()
    const file = this.calendarFiles.get(id)
    if (!file) throw new Error(`존재하지 않는 캘린더입니다: ${id}`)

    const { id: _ignoredId, ...rest } = payload
    file.calendar = { ...file.calendar, ...rest, id: file.calendar.id }
    this.persistCalendarFileSync(id)
    this.touch()
    return clone(file.calendar)
  }

  deleteCalendar(id: string): { ok: true } {
    this.ensureLoaded()
    if (id === PRIMARY_CALENDAR_ID || id === HOLIDAYS_KR_CALENDAR_ID) {
      throw new Error('기본 제공 캘린더는 삭제할 수 없습니다.')
    }
    const file = this.calendarFiles.get(id)
    if (!file) throw new Error(`존재하지 않는 캘린더입니다: ${id}`)

    const eventIds = file.events.map((event) => event.id)
    this.calendarFiles.delete(id)
    try {
      fs.rmSync(path.join(this.calendarsDir, `${toDataKey(id)}.json`), { force: true })
    } catch {
      /* best effort */
    }
    for (const eventId of eventIds) this.removeAttachmentsDirSync(eventId)

    this.touch()
    return { ok: true }
  }

  clearCalendarEvents(calendarId: string): { ok: true } {
    this.ensureLoaded()
    this.assertEventsMutable(calendarId)
    const file = this.calendarFiles.get(calendarId)
    if (!file) throw new Error(`존재하지 않는 캘린더입니다: ${calendarId}`)

    const eventIds = file.events.map((event) => event.id)
    file.events = []
    this.persistCalendarFileSync(calendarId)
    for (const eventId of eventIds) this.removeAttachmentsDirSync(eventId)

    this.touch()
    return { ok: true }
  }

  /* -------------------------------- tags ---------------------------------- */

  createTag(payload: Record<string, any> = {}): Tag {
    this.ensureLoaded()
    const tag: Tag = {
      id: payload.id ? String(payload.id) : randomUUID(),
      name: String(payload.name ?? '새 태그'),
      color: payload.color ?? CALENDAR_COLORS[this.tags.length % CALENDAR_COLORS.length],
      sortOrder: Number.isFinite(payload.sortOrder) ? Number(payload.sortOrder) : this.tags.length,
    }
    this.tags.push(tag)
    this.touch()
    return clone(tag)
  }

  patchTag(id: string, payload: Record<string, any> = {}): Tag {
    this.ensureLoaded()
    const index = this.tags.findIndex((tag) => tag.id === id)
    if (index === -1) throw new Error(`존재하지 않는 태그입니다: ${id}`)

    const { id: _ignoredId, ...rest } = payload
    this.tags[index] = { ...this.tags[index], ...rest, id: this.tags[index].id }
    this.touch()
    return clone(this.tags[index])
  }

  deleteTag(id: string): { ok: true } {
    this.ensureLoaded()
    const next = this.tags.filter((tag) => tag.id !== id)
    if (next.length === this.tags.length) throw new Error(`존재하지 않는 태그입니다: ${id}`)
    this.tags = next

    for (const file of this.calendarFiles.values()) {
      let changed = false
      for (const event of file.events) {
        if (Array.isArray(event.tags) && event.tags.includes(id)) {
          event.tags = event.tags.filter((tagId) => tagId !== id)
          changed = true
        }
      }
      if (changed) this.persistCalendarFileSync(file.calendar.id)
    }

    this.touch()
    return { ok: true }
  }

  /* ------------------------------ settings -------------------------------- */

  patchSettings(payload: Record<string, any> = {}): Settings {
    this.ensureLoaded()
    this.settings = mergeSettings(this.settings, payload)
    this.touch()
    return clone(this.settings)
  }

  /* ------------------------------ import/export ---------------------------- */

  importStore(payload: Record<string, any>): Store {
    this.ensureLoaded()
    if (!payload || typeof payload !== 'object') throw new Error('가져올 데이터 형식이 올바르지 않습니다.')

    if (Array.isArray(payload.calendars)) {
      this.replaceEntireStore(payload)
    } else if (payload.calendar && typeof payload.calendar === 'object') {
      this.mergeCalendarImport(payload)
    } else {
      throw new Error('알 수 없는 가져오기 형식입니다.')
    }

    this.touch()
    return this.readStore()
  }

  private replaceEntireStore(payload: Record<string, any>): void {
    const incomingCalendars: Calendar[] = Array.isArray(payload.calendars) ? payload.calendars : []
    const incomingEvents: CalendarEvent[] = Array.isArray(payload.events) ? payload.events : []

    const nextMap = new Map<string, CalendarFile>()
    for (const calendar of incomingCalendars) {
      if (!calendar?.id) continue
      nextMap.set(calendar.id, { version: 1, calendar, events: [] })
    }
    for (const event of incomingEvents) {
      const file = nextMap.get(event.calendarId)
      if (file) file.events.push(event)
    }

    for (const defaultCalendar of cloneDefaultCalendars()) {
      if (!nextMap.has(defaultCalendar.id)) {
        nextMap.set(
          defaultCalendar.id,
          this.calendarFiles.get(defaultCalendar.id) ?? { version: 1, calendar: defaultCalendar, events: [] },
        )
      }
    }

    for (const existingId of this.calendarFiles.keys()) {
      if (!nextMap.has(existingId)) {
        try {
          fs.rmSync(path.join(this.calendarsDir, `${toDataKey(existingId)}.json`), { force: true })
        } catch {
          /* best effort */
        }
      }
    }

    this.calendarFiles = nextMap
    for (const id of this.calendarFiles.keys()) this.persistCalendarFileSync(id)

    if (payload.settings && typeof payload.settings === 'object') {
      this.settings = mergeSettings(cloneDefaultSettings(), payload.settings)
    }
    if (Array.isArray(payload.tags) && payload.tags.length) {
      this.tags = payload.tags
    }
  }

  private mergeCalendarImport(payload: Record<string, any>): void {
    const incomingCalendar = payload.calendar as Calendar
    const incomingEvents: CalendarEvent[] = Array.isArray(payload.events) ? payload.events : []

    const targetId = incomingCalendar.id && !this.calendarFiles.has(incomingCalendar.id)
      ? incomingCalendar.id
      : randomUUID()

    const calendar: Calendar = {
      ...incomingCalendar,
      id: targetId,
      owner: incomingCalendar.owner ?? 'local',
      custom: true,
    }

    const now = nowIso()
    const events: CalendarEvent[] = incomingEvents
      .filter((event) => event && event.calendarId !== HOLIDAYS_KR_CALENDAR_ID)
      .map((event) => ({
        ...event,
        id: randomUUID(),
        calendarId: targetId,
        createdAt: event.createdAt ?? now,
        updatedAt: now,
      }))

    this.calendarFiles.set(targetId, { version: 1, calendar, events })
    this.persistCalendarFileSync(targetId)
  }

  async exportBackupZip(): Promise<{ type: 'zip' | 'json'; buffer: Buffer; filename: string }> {
    this.ensureLoaded()
    const store = this.readStore()
    const timestamp = nowStamp()

    if (process.platform === 'win32') {
      try {
        return await this.exportBackupZipViaPowerShell(store, timestamp)
      } catch (error) {
        console.warn('[calendarStore] zip export failed, falling back to JSON backup:', error)
      }
    }

    return {
      type: 'json',
      buffer: Buffer.from(JSON.stringify(store, null, 2), 'utf-8'),
      filename: `neo-calendar-backup-${timestamp}.json`,
    }
  }

  private async exportBackupZipViaPowerShell(
    store: Store,
    timestamp: string,
  ): Promise<{ type: 'zip'; buffer: Buffer; filename: string }> {
    const stagingDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'neo-calendar-export-'))
    const zipPath = path.join(os.tmpdir(), `neo-calendar-backup-${timestamp}.zip`)
    try {
      await fsp.writeFile(path.join(stagingDir, 'store.json'), JSON.stringify(store, null, 2), 'utf-8')
      if (fs.existsSync(this.attachmentsDir)) {
        await fsp.cp(this.attachmentsDir, path.join(stagingDir, 'attachments'), { recursive: true, force: true })
      }
      await fsp.rm(zipPath, { force: true })
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipPath}' -Force`,
        ],
        { stdio: 'ignore', timeout: 20000 },
      )
      const buffer = await fsp.readFile(zipPath)
      return { type: 'zip', buffer, filename: `neo-calendar-backup-${timestamp}.zip` }
    } finally {
      await fsp.rm(stagingDir, { recursive: true, force: true }).catch(() => {})
      await fsp.rm(zipPath, { force: true }).catch(() => {})
    }
  }

  async importBackupZip(buffer: Buffer): Promise<Store> {
    this.ensureLoaded()

    try {
      const parsed = JSON.parse(buffer.toString('utf-8'))
      if (parsed && typeof parsed === 'object') {
        return this.importStore(parsed)
      }
    } catch {
      /* not a raw JSON backup — fall through to zip handling below */
    }

    if (process.platform !== 'win32') {
      throw new Error('압축(.zip) 백업 파일은 Windows에서만 가져올 수 있습니다.')
    }

    const stagingZip = path.join(os.tmpdir(), `neo-calendar-import-${Date.now()}.zip`)
    const extractDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'neo-calendar-import-'))
    try {
      await fsp.writeFile(stagingZip, buffer)
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -Path '${stagingZip}' -DestinationPath '${extractDir}' -Force`,
        ],
        { stdio: 'ignore', timeout: 20000 },
      )

      const storeJsonPath = path.join(extractDir, 'store.json')
      if (!fs.existsSync(storeJsonPath)) throw new Error('백업 파일에서 store.json을 찾을 수 없습니다.')
      const parsed = JSON.parse(await fsp.readFile(storeJsonPath, 'utf-8'))

      const extractedAttachments = path.join(extractDir, 'attachments')
      if (fs.existsSync(extractedAttachments)) {
        await fsp.cp(extractedAttachments, this.attachmentsDir, { recursive: true, force: true })
      }

      return this.importStore(parsed)
    } finally {
      await fsp.rm(stagingZip, { force: true }).catch(() => {})
      await fsp.rm(extractDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /* ------------------------------ attachments ------------------------------ */

  async addAttachments(eventId: string, filePaths: string[]): Promise<CalendarEvent> {
    this.ensureLoaded()
    const located = this.locateEvent(eventId)
    if (!located) throw new Error(`일정을 찾을 수 없습니다: ${eventId}`)
    this.assertEventsMutable(located.calendarId)

    const event = located.file.events[located.index]
    const destDir = path.join(this.attachmentsDir, eventId)
    await fsp.mkdir(destDir, { recursive: true })

    const attachments: Attachment[] = Array.isArray(event.attachments) ? event.attachments : []
    for (const filePath of filePaths ?? []) {
      try {
        const stat = await fsp.stat(filePath)
        if (!stat.isFile()) continue
        const id = randomUUID()
        const originalName = path.basename(filePath)
        const storedName = `${id}__${originalName}`
        await fsp.copyFile(filePath, path.join(destDir, storedName))
        attachments.push({
          id,
          name: originalName,
          storedName,
          size: stat.size,
          mimeType: guessMimeType(originalName),
          addedAt: nowIso(),
        })
      } catch (error) {
        console.warn(`[calendarStore] failed to attach file: ${filePath}`, error)
      }
    }

    event.attachments = attachments
    event.updatedAt = nowIso()
    this.persistCalendarFileSync(located.calendarId)
    this.touch()
    return clone(event)
  }

  async removeAttachment(eventId: string, attachmentId: string): Promise<CalendarEvent> {
    this.ensureLoaded()
    const located = this.locateEvent(eventId)
    if (!located) throw new Error(`일정을 찾을 수 없습니다: ${eventId}`)
    this.assertEventsMutable(located.calendarId)

    const event = located.file.events[located.index]
    const attachments: Attachment[] = Array.isArray(event.attachments) ? event.attachments : []
    const target = attachments.find((attachment) => attachment.id === attachmentId)
    if (target) {
      const filePath = path.join(this.attachmentsDir, eventId, target.storedName ?? target.name)
      await fsp.rm(filePath, { force: true }).catch(() => {})
    }

    event.attachments = attachments.filter((attachment) => attachment.id !== attachmentId)
    event.updatedAt = nowIso()
    this.persistCalendarFileSync(located.calendarId)
    this.touch()
    return clone(event)
  }

  getAttachmentPath(eventId: string, attachmentId: string): string | null {
    this.ensureLoaded()
    const located = this.locateEvent(eventId)
    if (!located) return null

    const event = located.file.events[located.index]
    const attachments: Attachment[] = Array.isArray(event.attachments) ? event.attachments : []
    const target = attachments.find((attachment) => attachment.id === attachmentId)
    if (!target) return null

    const filePath = path.join(this.attachmentsDir, eventId, target.storedName ?? target.name)
    return fs.existsSync(filePath) ? filePath : null
  }

  /* --------------------------- Korean holiday sync -------------------------- */

  async syncKoreanHolidays(
    payload: Record<string, any> = {},
  ): Promise<{ ok: boolean; count: number; years: number[]; source: 'api' | 'seed'; message: string }> {
    this.ensureLoaded()
    const file = this.calendarFiles.get(HOLIDAYS_KR_CALENDAR_ID)
    if (!file) throw new Error('공휴일 캘린더를 찾을 수 없습니다.')

    const currentYear = new Date().getFullYear()
    const years: number[] = (Array.isArray(payload.years) && payload.years.length
      ? payload.years
      : [payload.year ?? currentYear]
    )
      .map((year: any) => Number(year))
      .filter((year: number) => Number.isFinite(year))

    const serviceKey = typeof payload.serviceKey === 'string' ? payload.serviceKey.trim() : ''
    let source: 'api' | 'seed' = 'seed'
    const collected: CalendarEvent[] = []

    for (const year of years) {
      let yearHolidays: Array<{ title: string; date: string }> | null = null
      if (serviceKey) {
        yearHolidays = await this.fetchHolidaysFromApi(serviceKey, year).catch(() => null)
        if (yearHolidays && yearHolidays.length) source = 'api'
      }
      if (!yearHolidays || !yearHolidays.length) {
        yearHolidays = this.getSeedHolidaysForYear(year)
      }

      const now = nowIso()
      for (const holiday of yearHolidays) {
        collected.push({
          id: randomUUID(),
          calendarId: HOLIDAYS_KR_CALENDAR_ID,
          title: holiday.title,
          description: '대한민국 공휴일',
          location: '',
          startDate: holiday.date,
          endDate: holiday.date,
          allDay: true,
          startTime: null,
          endTime: null,
          repeat: 'none',
          repeatUntil: null,
          repeatCount: null,
          exdates: [],
          color: null,
          guests: [],
          attachments: [],
          createdAt: now,
          updatedAt: now,
          createdBy: 'holidays-kr-sync',
        })
      }
    }

    const yearKeys = new Set(years.map((year) => String(year)))
    file.events = [
      ...file.events.filter((event) => !yearKeys.has(String(event.startDate).slice(0, 4))),
      ...collected,
    ].sort((a, b) => a.startDate.localeCompare(b.startDate))
    this.persistCalendarFileSync(HOLIDAYS_KR_CALENDAR_ID)

    const syncedYears = new Set<number>(
      Array.isArray(this.settings.holidaysKr?.years) ? this.settings.holidaysKr.years : [],
    )
    years.forEach((year) => syncedYears.add(year))

    const message = `${years.join(', ')}년 공휴일 ${collected.length}건을 동기화했습니다. (${
      source === 'api' ? 'data.go.kr' : '내장 데이터'
    })`

    this.settings = mergeSettings(this.settings, {
      holidaysKr: {
        serviceKey: payload.rememberKey ? serviceKey : '',
        rememberKey: Boolean(payload.rememberKey),
        ok: true,
        skipped: false,
        reason: null,
        message,
        years: [...syncedYears].sort((a, b) => a - b),
        count: file.events.length,
        lastSyncedAt: nowIso(),
      },
    })
    this.touch()

    return { ok: true, count: collected.length, years, source, message }
  }

  private async fetchHolidaysFromApi(
    serviceKey: string,
    year: number,
  ): Promise<Array<{ title: string; date: string }> | null> {
    if (typeof fetch !== 'function') return null
    try {
      const url =
        `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo` +
        `?solYear=${year}&ServiceKey=${encodeURIComponent(serviceKey)}&_type=json&numOfRows=100`
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) return null
      const json: any = await response.json()
      const items = json?.response?.body?.items?.item
      const list = Array.isArray(items) ? items : items ? [items] : []
      if (!list.length) return null
      return list.map((item: any) => ({
        title: String(item.dateName ?? '공휴일'),
        date: String(item.locdate).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      }))
    } catch {
      return null
    }
  }

  private getSeedHolidaysForYear(year: number): Array<{ title: string; date: string }> {
    const yearPrefix = String(year)
    return (holidaysSeed.events ?? [])
      .filter((event) => String(event.startDate).startsWith(yearPrefix))
      .map((event) => ({ title: event.title, date: event.startDate }))
  }
}
