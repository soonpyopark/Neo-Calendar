import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  copyFileSync,
  unlinkSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import {
  createDefaultSettings,
  createEmptySnapshot,
  DEFAULT_CALENDARS,
  DEFAULT_TAGS,
  HOLIDAYS_KR_CALENDAR_ID,
  PRIMARY_CALENDAR_ID
} from '../../shared/calendarDefaults'
import type {
  CalendarEvent,
  CalendarRecord,
  CalendarStoreSnapshot,
  EventInput,
  StoreSettings,
  TagRecord
} from '../../shared/calendarTypes'
import type { AppSettings, LaunchMode, WidgetBounds } from '../../shared/ipc'
import { resolveDataRoot, sanitizeDataKey } from './paths'

type SettingsFile = {
  version: number
  settings: StoreSettings
  tags: TagRecord[]
  updatedAt: string
  /** Neo legacy migration */
  authToken?: string | null
  authLoginId?: string | null
}

type CalendarFile = {
  version: number
  calendar: CalendarRecord
  events: CalendarEvent[]
  updatedAt: string
}

function deepMergeSettings(base: StoreSettings, patch: Partial<StoreSettings>): StoreSettings {
  return {
    ...base,
    ...patch,
    notifications: { ...base.notifications, ...(patch.notifications ?? {}) },
    viewOptions: { ...base.viewOptions, ...(patch.viewOptions ?? {}) },
    holidaysKr: { ...base.holidaysKr, ...(patch.holidaysKr ?? {}) },
    widget: {
      ...base.widget,
      ...(patch.widget ?? {}),
      bounds: patch.widget?.bounds ? { ...patch.widget.bounds } : { ...base.widget.bounds }
    },
    dayColors: patch.dayColors ? { ...patch.dayColors } : { ...base.dayColors },
    dayColorsByLoginId: patch.dayColorsByLoginId
      ? { ...patch.dayColorsByLoginId }
      : { ...(base.dayColorsByLoginId ?? {}) },
    hiddenCalendarIdsByLoginId: patch.hiddenCalendarIdsByLoginId
      ? { ...patch.hiddenCalendarIdsByLoginId }
      : { ...(base.hiddenCalendarIdsByLoginId ?? {}) },
    allowedIpCidrs: patch.allowedIpCidrs ?? [...base.allowedIpCidrs]
  }
}

export class CalendarStore {
  readonly dataRoot: string
  private readonly settingsPath: string
  private readonly calendarsDir: string
  private readonly attachmentsDir: string
  private readonly sessionPath: string
  private cache: CalendarStoreSnapshot | null = null
  private authToken: string | null = null
  private authLoginId: string | null = null

  constructor(dataRoot = resolveDataRoot()) {
    this.dataRoot = dataRoot
    this.settingsPath = join(dataRoot, 'settings.json')
    this.calendarsDir = join(dataRoot, 'calendars')
    this.attachmentsDir = join(dataRoot, 'attachments')
    this.sessionPath = join(dataRoot, 'admin-sessions.json')
    mkdirSync(this.calendarsDir, { recursive: true })
    mkdirSync(this.attachmentsDir, { recursive: true })
    this.migrateLegacyNeoSettings()
    this.ensureSeeded()
    this.loadSession()
  }

  getSnapshot(): CalendarStoreSnapshot {
    if (!this.cache) this.cache = this.readFromDisk()
    return structuredClone(this.cache)
  }

  /** Neo AppSettings projection for desktopMode / App.tsx */
  getAppSettings(): AppSettings {
    const s = this.getSnapshot().settings
    return {
      widget: {
        launchMode: s.widget.launchMode === 'desktop' ? 'desktop' : 'window',
        bounds: { ...s.widget.bounds }
      },
      weekStartsOn: s.viewOptions.weekStartsOnSunday ? 0 : 1,
      headerOpacity: s.headerOpacity,
      shellOpacity: s.shellOpacity
    }
  }

  patchAppSettings(patch: Partial<AppSettings>): AppSettings {
    const cur = this.getSnapshot()
    const nextSettings = deepMergeSettings(cur.settings, {
      headerOpacity: patch.headerOpacity ?? cur.settings.headerOpacity,
      shellOpacity: patch.shellOpacity ?? cur.settings.shellOpacity,
      viewOptions: {
        ...cur.settings.viewOptions,
        weekStartsOnSunday:
          patch.weekStartsOn === undefined
            ? cur.settings.viewOptions.weekStartsOnSunday
            : patch.weekStartsOn === 0
      },
      widget: {
        ...cur.settings.widget,
        launchMode: patch.widget?.launchMode ?? cur.settings.widget.launchMode,
        bounds: patch.widget?.bounds ?? cur.settings.widget.bounds
      }
    })
    this.writeSettingsFile(nextSettings, cur.tags)
    this.cache = null
    return this.getAppSettings()
  }

  setWidget(patch: { launchMode?: LaunchMode; bounds?: WidgetBounds }): AppSettings {
    return this.patchAppSettings({
      widget: {
        launchMode: patch.launchMode ?? this.getAppSettings().widget.launchMode,
        bounds: patch.bounds ?? this.getAppSettings().widget.bounds
      }
    })
  }

  getWidgetBounds(): WidgetBounds {
    return { ...this.getAppSettings().widget.bounds }
  }

  patchStoreSettings(patch: Partial<StoreSettings>): CalendarStoreSnapshot {
    const cur = this.getSnapshot()
    const next = deepMergeSettings(cur.settings, patch)
    this.writeSettingsFile(next, cur.tags)
    this.cache = null
    return this.getSnapshot()
  }

  replaceStore(next: CalendarStoreSnapshot): CalendarStoreSnapshot {
    const settings = deepMergeSettings(createDefaultSettings(), next.settings ?? {})
    const tags = Array.isArray(next.tags) && next.tags.length > 0 ? next.tags : [...DEFAULT_TAGS]
    this.writeSettingsFile(settings, tags)
    // Clear and rewrite calendars
    for (const file of readdirSync(this.calendarsDir)) {
      if (file.endsWith('.json')) {
        try {
          writeFileSync(join(this.calendarsDir, file), '', 'utf8')
        } catch {
          /* ignore */
        }
      }
    }
    const byCal = new Map<string, CalendarEvent[]>()
    for (const ev of next.events ?? []) {
      const list = byCal.get(ev.calendarId) ?? []
      list.push(ev)
      byCal.set(ev.calendarId, list)
    }
    const calendars =
      Array.isArray(next.calendars) && next.calendars.length > 0
        ? next.calendars
        : structuredClone(DEFAULT_CALENDARS)
    for (const cal of calendars) {
      this.writeCalendarFile(cal, byCal.get(cal.id) ?? [])
    }
    this.cache = null
    return this.getSnapshot()
  }

  addEvent(input: EventInput): CalendarEvent {
    const snap = this.getSnapshot()
    const now = new Date().toISOString()
    const event: CalendarEvent = {
      id: randomUUID(),
      calendarId: input.calendarId,
      title: input.title.trim(),
      description: input.description ?? '',
      link: input.link,
      links: input.links ?? [],
      location: input.location ?? '',
      startDate: input.startDate,
      endDate: input.endDate ?? input.startDate,
      allDay: input.allDay !== false,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      repeat: input.repeat ?? 'none',
      repeatUntil: input.repeatUntil ?? null,
      repeatCount: input.repeatCount ?? null,
      exdates: input.exdates ?? [],
      color: input.color ?? null,
      guests: input.guests ?? [],
      completed: Boolean(input.completed),
      markerShape: input.markerShape ?? null,
      tagIds: input.tagIds ?? [],
      attachments: input.attachments ?? [],
      sortOrder: input.sortOrder,
      sortOrderByDay: input.sortOrderByDay,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy ?? 'local'
    }
    const cal = snap.calendars.find((c) => c.id === event.calendarId)
    if (!cal) throw new Error('캘린더를 찾을 수 없습니다.')
    if (cal.id === HOLIDAYS_KR_CALENDAR_ID) throw new Error('공휴일 캘린더에는 일정을 추가할 수 없습니다.')
    const events = snap.events.filter((e) => e.calendarId === cal.id)
    events.push(event)
    this.writeCalendarFile(cal, events)
    this.cache = null
    return event
  }

  editEvent(id: string, patch: Partial<CalendarEvent>): CalendarEvent {
    const snap = this.getSnapshot()
    const prev = snap.events.find((e) => e.id === id)
    if (!prev) throw new Error('일정을 찾을 수 없습니다.')
    if (prev.calendarId === HOLIDAYS_KR_CALENDAR_ID && patch.title !== undefined) {
      // allow completed? holidays usually blocked — allow only non-destructive fields none
      throw new Error('공휴일 일정은 수정할 수 없습니다.')
    }
    const next: CalendarEvent = {
      ...prev,
      ...patch,
      id: prev.id,
      updatedAt: new Date().toISOString()
    }
    const targetCalId = next.calendarId
    // If calendar changed, rewrite both files
    if (targetCalId !== prev.calendarId) {
      const oldCal = snap.calendars.find((c) => c.id === prev.calendarId)
      const newCal = snap.calendars.find((c) => c.id === targetCalId)
      if (!oldCal || !newCal) throw new Error('캘린더를 찾을 수 없습니다.')
      this.writeCalendarFile(
        oldCal,
        snap.events.filter((e) => e.calendarId === oldCal.id && e.id !== id)
      )
      this.writeCalendarFile(newCal, [
        ...snap.events.filter((e) => e.calendarId === newCal.id && e.id !== id),
        next
      ])
    } else {
      const cal = snap.calendars.find((c) => c.id === prev.calendarId)
      if (!cal) throw new Error('캘린더를 찾을 수 없습니다.')
      this.writeCalendarFile(
        cal,
        snap.events.map((e) => (e.id === id ? next : e)).filter((e) => e.calendarId === cal.id)
      )
    }
    this.cache = null
    return next
  }

  removeEvent(id: string): void {
    const snap = this.getSnapshot()
    const prev = snap.events.find((e) => e.id === id)
    if (!prev) return
    if (prev.calendarId === HOLIDAYS_KR_CALENDAR_ID) {
      throw new Error('공휴일 일정은 삭제할 수 없습니다.')
    }
    const cal = snap.calendars.find((c) => c.id === prev.calendarId)
    if (!cal) return
    this.writeCalendarFile(
      cal,
      snap.events.filter((e) => e.calendarId === cal.id && e.id !== id)
    )
    this.cache = null
  }

  createCalendar(input: Partial<CalendarRecord> & { name: string; color: string }): CalendarRecord {
    const snap = this.getSnapshot()
    const id = sanitizeDataKey(input.id ?? randomUUID())
    const calendar: CalendarRecord = {
      id,
      dataKey: id,
      name: input.name.trim(),
      description: input.description ?? '',
      color: input.color,
      visible: input.visible !== false,
      owner: input.owner ?? 'local',
      custom: true,
      sortOrder: input.sortOrder ?? snap.calendars.length
    }
    this.writeCalendarFile(calendar, [])
    this.cache = null
    return calendar
  }

  patchCalendar(id: string, patch: Partial<CalendarRecord>): CalendarRecord {
    const snap = this.getSnapshot()
    const prev = snap.calendars.find((c) => c.id === id)
    if (!prev) throw new Error('캘린더를 찾을 수 없습니다.')
    const next = { ...prev, ...patch, id: prev.id }
    const events = snap.events.filter((e) => e.calendarId === id)
    this.writeCalendarFile(next, events)
    this.cache = null
    return next
  }

  deleteCalendar(id: string): void {
    if (id === PRIMARY_CALENDAR_ID || id === HOLIDAYS_KR_CALENDAR_ID) {
      throw new Error('기본/공휴일 캘린더는 삭제할 수 없습니다.')
    }
    const snap = this.getSnapshot()
    const cal = snap.calendars.find((c) => c.id === id)
    if (!cal) return
    const key = sanitizeDataKey(cal.dataKey ?? cal.id)
    const path = join(this.calendarsDir, `${key}.json`)
    try {
      unlinkSync(path)
    } catch {
      /* ignore */
    }
    this.cache = null
  }

  setTags(tags: TagRecord[]): TagRecord[] {
    const snap = this.getSnapshot()
    this.writeSettingsFile(snap.settings, tags)
    this.cache = null
    return structuredClone(tags)
  }

  ensureHolidaysKrCalendar(): CalendarRecord {
    const snap = this.getSnapshot()
    const existing = snap.calendars.find((c) => c.id === HOLIDAYS_KR_CALENDAR_ID)
    if (existing) return existing
    const meta = DEFAULT_CALENDARS.find((c) => c.id === HOLIDAYS_KR_CALENDAR_ID)!
    const events = snap.events.filter((e) => e.calendarId === HOLIDAYS_KR_CALENDAR_ID)
    this.writeCalendarFile(meta, events)
    this.cache = null
    return meta
  }

  /** Full replace of holidays-kr events (API / seed sync). */
  replaceHolidaysKrEvents(events: CalendarEvent[]): void {
    const meta =
      this.getSnapshot().calendars.find((c) => c.id === HOLIDAYS_KR_CALENDAR_ID)
      ?? DEFAULT_CALENDARS.find((c) => c.id === HOLIDAYS_KR_CALENDAR_ID)!
    const now = new Date().toISOString()
    const normalized = events.map((event) => ({
      ...event,
      id: event.id || `kr-holiday-${String(event.startDate).replace(/\D/g, '')}`,
      calendarId: HOLIDAYS_KR_CALENDAR_ID,
      title: (event.title || '휴일').trim(),
      allDay: true,
      startDate: event.startDate,
      endDate: event.endDate || event.startDate,
      createdAt: event.createdAt ?? now,
      updatedAt: now,
      createdBy: event.createdBy ?? 'holidays-kr-sync'
    }))
    this.writeCalendarFile({ ...meta, id: HOLIDAYS_KR_CALENDAR_ID }, normalized)
    this.cache = null
  }

  getAuthSession(): { token: string; loginId: string } | null {
    if (!this.authToken || !this.authLoginId) return null
    return { token: this.authToken, loginId: this.authLoginId }
  }

  setAuthSession(session: { token: string; loginId: string } | null): void {
    this.authToken = session?.token ?? null
    this.authLoginId = session?.loginId ?? null
    writeFileSync(
      this.sessionPath,
      JSON.stringify(
        {
          token: this.authToken,
          loginId: this.authLoginId,
          updatedAt: new Date().toISOString()
        },
        null,
        2
      ),
      'utf8'
    )
  }

  private loadSession(): void {
    if (!existsSync(this.sessionPath)) return
    try {
      const raw = JSON.parse(readFileSync(this.sessionPath, 'utf8')) as {
        token?: string
        loginId?: string
      }
      this.authToken = typeof raw.token === 'string' ? raw.token : null
      this.authLoginId = typeof raw.loginId === 'string' ? raw.loginId : null
    } catch {
      /* ignore */
    }
  }

  private migrateLegacyNeoSettings(): void {
    // If MDC settings already exist, keep them.
    if (existsSync(this.settingsPath)) return
    try {
      const { app } = require('electron') as typeof import('electron')
      const legacy = join(app.getPath('userData'), 'data', 'settings.json')
      if (!existsSync(legacy) || legacy === this.settingsPath) return
      const raw = JSON.parse(readFileSync(legacy, 'utf8')) as {
        settings?: AppSettings & { widget?: { launchMode?: LaunchMode; bounds?: WidgetBounds } }
        authToken?: string | null
        authLoginId?: string | null
      }
      const defaults = createDefaultSettings()
      if (raw.settings) {
        defaults.headerOpacity = raw.settings.headerOpacity ?? defaults.headerOpacity
        defaults.shellOpacity = raw.settings.shellOpacity ?? defaults.shellOpacity
        if (raw.settings.weekStartsOn === 1) defaults.viewOptions.weekStartsOnSunday = false
        if (raw.settings.widget?.bounds) defaults.widget.bounds = { ...raw.settings.widget.bounds }
        if (raw.settings.widget?.launchMode) {
          defaults.widget.launchMode = raw.settings.widget.launchMode
        }
      }
      this.writeSettingsFile(defaults, [...DEFAULT_TAGS])
      if (raw.authToken && raw.authLoginId) {
        this.setAuthSession({ token: raw.authToken, loginId: raw.authLoginId })
      }
      console.log('[calendar-store] Migrated legacy Neo settings into', this.settingsPath)
    } catch (error) {
      console.warn('[calendar-store] Legacy settings migration skipped', error)
    }
  }

  private ensureSeeded(): void {
    if (!existsSync(this.settingsPath)) {
      this.writeSettingsFile(createDefaultSettings(), [...DEFAULT_TAGS])
    }
    const primaryPath = join(this.calendarsDir, `${PRIMARY_CALENDAR_ID}.json`)
    if (!existsSync(primaryPath)) {
      const primary = DEFAULT_CALENDARS.find((c) => c.id === PRIMARY_CALENDAR_ID)!
      this.writeCalendarFile(primary, [])
    }
    const holidaysPath = join(this.calendarsDir, `${HOLIDAYS_KR_CALENDAR_ID}.json`)
    if (!existsSync(holidaysPath)) {
      this.seedHolidaysKr()
    }
  }

  private seedHolidaysKr(): void {
    const holidaysMeta = DEFAULT_CALENDARS.find((c) => c.id === HOLIDAYS_KR_CALENDAR_ID)!
    const candidates = [
      join(__dirname, '../../shared/seed/holidays-kr.json'),
      join(process.cwd(), 'src/shared/seed/holidays-kr.json'),
      join(process.cwd(), 'out/shared/seed/holidays-kr.json')
    ]
    for (const seedPath of candidates) {
      if (!existsSync(seedPath)) continue
      try {
        const dest = join(this.calendarsDir, `${HOLIDAYS_KR_CALENDAR_ID}.json`)
        copyFileSync(seedPath, dest)
        // Normalize wrapper if seed is { calendar, events }
        const raw = JSON.parse(readFileSync(dest, 'utf8')) as Partial<CalendarFile> & {
          calendar?: CalendarRecord
          events?: CalendarEvent[]
        }
        if (raw.calendar && Array.isArray(raw.events)) {
          this.writeCalendarFile(
            { ...holidaysMeta, ...raw.calendar, id: HOLIDAYS_KR_CALENDAR_ID },
            raw.events
          )
        }
        console.log('[calendar-store] Seeded holidays-kr from', seedPath)
        return
      } catch (error) {
        console.warn('[calendar-store] holidays seed failed', error)
      }
    }
    this.writeCalendarFile(holidaysMeta, [])
  }

  private readFromDisk(): CalendarStoreSnapshot {
    const empty = createEmptySnapshot()
    let settings = empty.settings
    let tags = empty.tags
    if (existsSync(this.settingsPath)) {
      try {
        const raw = JSON.parse(readFileSync(this.settingsPath, 'utf8')) as Partial<SettingsFile>
        settings = deepMergeSettings(createDefaultSettings(), (raw.settings ?? {}) as Partial<StoreSettings>)
        if (Array.isArray(raw.tags) && raw.tags.length > 0) tags = raw.tags
        // Legacy neo flat file without .settings wrapper
        const legacy = raw as unknown as Partial<AppSettings>
        if (!raw.settings && (legacy.widget || legacy.headerOpacity !== undefined)) {
          settings = deepMergeSettings(createDefaultSettings(), {
            headerOpacity: legacy.headerOpacity,
            shellOpacity: legacy.shellOpacity,
            widget: legacy.widget
              ? {
                  ...createDefaultSettings().widget,
                  launchMode: legacy.widget.launchMode,
                  bounds: legacy.widget.bounds
                }
              : undefined,
            viewOptions: {
              ...createDefaultSettings().viewOptions,
              weekStartsOnSunday: legacy.weekStartsOn !== 1
            }
          })
        }
      } catch (error) {
        console.warn('[calendar-store] settings read failed', error)
      }
    }

    const calendars: CalendarRecord[] = []
    const events: CalendarEvent[] = []
    if (existsSync(this.calendarsDir)) {
      for (const name of readdirSync(this.calendarsDir)) {
        if (!name.endsWith('.json')) continue
        try {
          const raw = JSON.parse(
            readFileSync(join(this.calendarsDir, name), 'utf8')
          ) as Partial<CalendarFile>
          if (!raw.calendar || !raw.calendar.id) continue
          calendars.push(raw.calendar)
          if (Array.isArray(raw.events)) events.push(...raw.events)
        } catch {
          /* skip bad file */
        }
      }
    }

    if (calendars.length === 0) {
      calendars.push(...structuredClone(DEFAULT_CALENDARS))
    }

    calendars.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

    return {
      version: 2,
      settings,
      calendars,
      events,
      tags,
      updatedAt: new Date().toISOString()
    }
  }

  private writeSettingsFile(settings: StoreSettings, tags: TagRecord[]): void {
    mkdirSync(dirname(this.settingsPath), { recursive: true })
    const payload: SettingsFile = {
      version: 2,
      settings,
      tags,
      updatedAt: new Date().toISOString()
    }
    writeFileSync(this.settingsPath, JSON.stringify(payload, null, 2), 'utf8')
  }

  private writeCalendarFile(calendar: CalendarRecord, events: CalendarEvent[]): void {
    mkdirSync(this.calendarsDir, { recursive: true })
    const key = sanitizeDataKey(calendar.dataKey ?? calendar.id)
    const payload: CalendarFile = {
      version: 1,
      calendar: { ...calendar, dataKey: key },
      events,
      updatedAt: new Date().toISOString()
    }
    writeFileSync(join(this.calendarsDir, `${key}.json`), JSON.stringify(payload, null, 2), 'utf8')
  }
}
