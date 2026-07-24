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
import { getDefaultCalendarColor } from '../../shared/calendarColorPalette'
import {
  createDefaultSettings,
  createEmptySnapshot,
  DEFAULT_CALENDARS,
  DEFAULT_TAGS,
  HOLIDAYS_KR_CALENDAR_ID,
  PRIMARY_CALENDAR_COLOR,
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

  /**
   * Client-facing snapshot: overlay per-login eye-toggle onto `calendar.visible`
   * (MDC ProjectCalendarVisibilityForClient). Disk records stay `visible: true`.
   */
  getSnapshotForLogin(loginId: string | null | undefined): CalendarStoreSnapshot {
    const snap = this.getSnapshot()
    const hidden = this.getHiddenCalendarIdsForLogin(loginId)
    snap.calendars = snap.calendars.map((cal) => ({
      ...cal,
      visible: !hidden.has(cal.id)
    }))
    if (snap.settings.hiddenCalendarIdsByLoginId) {
      delete snap.settings.hiddenCalendarIdsByLoginId
    }
    return snap
  }

  getHiddenCalendarIdsForLogin(loginId: string | null | undefined): Set<string> {
    const owner = String(loginId ?? '').trim()
    const result = new Set<string>()
    if (!owner) return result
    const byLogin = this.getSnapshot().settings.hiddenCalendarIdsByLoginId ?? {}
    const key =
      Object.keys(byLogin).find((k) => k.toLowerCase() === owner.toLowerCase()) ?? null
    if (!key) return result
    for (const id of byLogin[key] ?? []) {
      const trimmed = String(id ?? '').trim()
      if (trimmed) result.add(trimmed)
    }
    return result
  }

  /** Per-member eye-toggle (MDC SetCalendarHiddenForLogin). */
  setCalendarHiddenForLogin(
    loginId: string,
    calendarId: string,
    hidden: boolean
  ): void {
    const owner = loginId.trim()
    const calId = calendarId.trim()
    if (!owner || !calId) return

    const cur = this.getSnapshot()
    const byLogin = { ...(cur.settings.hiddenCalendarIdsByLoginId ?? {}) }
    const key =
      Object.keys(byLogin).find((k) => k.toLowerCase() === owner.toLowerCase()) ?? owner
    const next = new Set(byLogin[key] ?? [])
    if (hidden) next.add(calId)
    else next.delete(calId)
    if (next.size === 0) delete byLogin[key]
    else byLogin[key] = [...next]
    this.patchStoreSettings({ hiddenCalendarIdsByLoginId: byLogin })
  }

  /**
   * New calendars owned by a member (not the bootstrap admin) stay hidden for the
   * admin until the admin turns the eye icon on (MDC HideNewMemberCalendarForAdmin).
   */
  hideNewMemberCalendarForAdmin(
    calendar: CalendarRecord | null | undefined,
    adminLoginId: string | null | undefined
  ): void {
    if (!calendar) return
    const admin = String(adminLoginId ?? '').trim()
    if (!admin) return
    if (calendar.id === HOLIDAYS_KR_CALENDAR_ID) return
    if (calendar.owner === 'shared') return
    const owner = String(calendar.ownerLoginId ?? '').trim()
    if (!owner || owner.toLowerCase() === admin.toLowerCase()) return
    this.setCalendarHiddenForLogin(admin, calendar.id, true)
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
          unlinkSync(join(this.calendarsDir, file))
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

  /**
   * MDC-compatible import:
   * - `{ calendars, events }` → replace (preserve holidays-kr calendar/events/settings.holidaysKr)
   * - `{ calendar, events }` → upsert that calendar and replace its events
   */
  importStore(payload: unknown): CalendarStoreSnapshot {
    if (!payload || typeof payload !== 'object') {
      throw new Error(
        '지원하지 않는 JSON 형식입니다. 전체 내보내기 또는 개별 캘린더 내보내기 파일을 사용해 주세요.'
      )
    }
    const data = payload as Record<string, unknown>
    const calendarsArr = Array.isArray(data.calendars) ? data.calendars : null
    const eventsArr = Array.isArray(data.events) ? data.events : null

    if (calendarsArr && eventsArr) {
      return this.importReplace(
        data as Partial<CalendarStoreSnapshot> & {
          calendars: CalendarRecord[]
          events: CalendarEvent[]
        }
      )
    }

    const single = data.calendar
    if (single && typeof single === 'object' && eventsArr) {
      return this.importMergeCalendar(
        single as Partial<CalendarRecord>,
        eventsArr as CalendarEvent[]
      )
    }

    throw new Error(
      '지원하지 않는 JSON 형식입니다. 전체 내보내기 또는 개별 캘린더 내보내기 파일을 사용해 주세요.'
    )
  }

  private importReplace(
    payload: Partial<CalendarStoreSnapshot> & {
      calendars: CalendarRecord[]
      events: CalendarEvent[]
    }
  ): CalendarStoreSnapshot {
    const current = this.getSnapshot()
    const preservedHolidayCalendar =
      current.calendars.find((c) => c.id === HOLIDAYS_KR_CALENDAR_ID) ??
      DEFAULT_CALENDARS.find((c) => c.id === HOLIDAYS_KR_CALENDAR_ID)!
    const preservedHolidayEvents = current.events.filter(
      (e) => e.calendarId === HOLIDAYS_KR_CALENDAR_ID
    )

    const usedDataKeys = new Set<string>([HOLIDAYS_KR_CALENDAR_ID])
    const calendars: CalendarRecord[] = []
    for (const raw of payload.calendars) {
      if (!raw || typeof raw !== 'object') continue
      if (raw.id === HOLIDAYS_KR_CALENDAR_ID || raw.dataKey === HOLIDAYS_KR_CALENDAR_ID) continue
      calendars.push(this.normalizeImportedCalendar(raw, usedDataKeys))
    }
    calendars.push({ ...preservedHolidayCalendar, id: HOLIDAYS_KR_CALENDAR_ID })

    const events: CalendarEvent[] = []
    for (const ev of payload.events) {
      if (!ev || typeof ev !== 'object') continue
      if (ev.calendarId === HOLIDAYS_KR_CALENDAR_ID) continue
      events.push({ ...ev })
    }
    for (const ev of preservedHolidayEvents) {
      events.push({ ...ev })
    }

    const settings = deepMergeSettings(createDefaultSettings(), payload.settings ?? {})
    settings.holidaysKr = { ...current.settings.holidaysKr }

    const tags =
      Array.isArray(payload.tags) && payload.tags.length > 0 ? payload.tags : [...current.tags]

    return this.replaceStore({
      version: typeof payload.version === 'number' ? payload.version : current.version,
      settings,
      calendars,
      events,
      tags,
      updatedAt: new Date().toISOString()
    })
  }

  private importMergeCalendar(
    calendarInput: Partial<CalendarRecord>,
    eventsInput: CalendarEvent[]
  ): CalendarStoreSnapshot {
    if (
      calendarInput.id === HOLIDAYS_KR_CALENDAR_ID ||
      calendarInput.dataKey === HOLIDAYS_KR_CALENDAR_ID
    ) {
      throw new Error('대한민국의 휴일 캘린더는 가져오기로 변경할 수 없습니다.')
    }

    const current = this.getSnapshot()
    const usedDataKeys = new Set(
      current.calendars
        .map((c) => c.dataKey ?? c.id)
        .filter((k): k is string => Boolean(k && k.trim()))
    )

    const inputId = calendarInput.id?.trim() || undefined
    const existing = inputId
      ? current.calendars.find((c) => c.id === inputId) ?? null
      : null
    if (existing?.dataKey) usedDataKeys.delete(existing.dataKey)

    const candidate: Partial<CalendarRecord> = {
      ...calendarInput,
      id: inputId ?? randomUUID(),
      ...(existing?.dataKey ? { dataKey: existing.dataKey } : {})
    }
    const calendar = this.normalizeImportedCalendar(candidate, usedDataKeys)
    if (!calendar.color) {
      calendar.color = getDefaultCalendarColor(current.calendars.length)
    }

    const importedEvents: CalendarEvent[] = eventsInput
      .filter((e) => e && typeof e === 'object')
      .map((e) => ({
        ...e,
        id: e.id?.trim() || randomUUID(),
        calendarId: calendar.id,
        title: String(e.title ?? '').trim() || '(제목 없음)',
        startDate: e.startDate,
        endDate: e.endDate ?? e.startDate,
        allDay: e.allDay !== false
      }))

    const calendars = [
      ...current.calendars.filter((c) => c.id !== calendar.id),
      calendar
    ]
    const events = [
      ...current.events.filter((e) => e.calendarId !== calendar.id),
      ...importedEvents
    ]

    return this.replaceStore({
      ...current,
      calendars,
      events,
      updatedAt: new Date().toISOString()
    })
  }

  private normalizeImportedCalendar(
    input: Partial<CalendarRecord>,
    usedDataKeys: Set<string>
  ): CalendarRecord {
    const id = sanitizeDataKey(input.id ?? randomUUID())
    let dataKey = sanitizeDataKey(input.dataKey ?? id)
    if (usedDataKeys.has(dataKey) && dataKey !== id) {
      dataKey = id
    }
    while (usedDataKeys.has(dataKey)) {
      dataKey = sanitizeDataKey(randomUUID())
    }
    usedDataKeys.add(dataKey)

    return {
      id,
      dataKey,
      name: String(input.name ?? '').trim() || '가져온 캘린더',
      description: input.description ?? '',
      color: input.color || getDefaultCalendarColor(usedDataKeys.size),
      visible: input.visible !== false,
      owner: input.owner === 'shared' ? 'shared' : 'local',
      custom: input.custom !== false,
      ownerLoginId: input.ownerLoginId,
      ownerName: input.ownerName,
      sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : usedDataKeys.size - 1
    }
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
    const ownerLoginId = input.ownerLoginId?.trim() || undefined
    const ownerName =
      input.ownerName?.trim() || ownerLoginId || snap.settings.ownerName?.trim() || undefined
    const calendar: CalendarRecord = {
      id,
      dataKey: id,
      name: input.name.trim(),
      description: input.description ?? '',
      color: input.color,
      // Shared record stays visible; per-member eye-toggle uses hiddenCalendarIdsByLoginId.
      visible: true,
      owner: input.owner ?? 'local',
      custom: true,
      ownerLoginId,
      ownerName,
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
    // Eye-toggle is per-login; never persist `visible` onto the shared calendar file.
    const { visible: _visible, ...rest } = patch
    const next = { ...prev, ...rest, id: prev.id, visible: true }
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

  /** Clear all events in a calendar without deleting the calendar (MDC ClearCalendarEvents). */
  clearCalendarEvents(id: string): void {
    const calendarId = String(id ?? '').trim()
    if (!calendarId) throw new Error('캘린더를 찾을 수 없습니다.')
    if (calendarId === HOLIDAYS_KR_CALENDAR_ID) {
      throw new Error('공휴일 캘린더는 초기화할 수 없습니다.')
    }
    const snap = this.getSnapshot()
    const cal = snap.calendars.find((c) => c.id === calendarId)
    if (!cal) throw new Error('캘린더를 찾을 수 없습니다.')
    this.writeCalendarFile(cal, [])
    this.cache = null
  }

  /**
   * Append imported events into an existing calendar (MDC ImportEventsIntoCalendar).
   * Holidays calendar is rejected. Source event ids are replaced.
   */
  importEventsIntoCalendar(
    id: string,
    eventsInput: unknown[],
    ownerLoginId?: string | null
  ): { ok: true; importedCount: number; calendarId: string } {
    const calendarId = String(id ?? '').trim()
    if (!calendarId) throw new Error('캘린더를 찾을 수 없습니다.')
    if (calendarId === HOLIDAYS_KR_CALENDAR_ID) {
      throw new Error('대한민국의 휴일 캘린더에는 가져올 수 없습니다.')
    }
    const snap = this.getSnapshot()
    const cal = snap.calendars.find((c) => c.id === calendarId)
    if (!cal) throw new Error('캘린더를 찾을 수 없습니다.')

    const owner =
      String(ownerLoginId ?? '').trim() ||
      String(cal.ownerLoginId ?? '').trim() ||
      String(snap.settings.ownerName ?? '').trim()

    const existing = snap.events.filter((e) => e.calendarId === calendarId)
    const now = new Date().toISOString()
    const imported: CalendarEvent[] = []
    for (const raw of eventsInput ?? []) {
      if (!raw || typeof raw !== 'object') continue
      const e = raw as Partial<CalendarEvent>
      if (e.calendarId === HOLIDAYS_KR_CALENDAR_ID) continue
      const title = String(e.title ?? '').trim()
      if (!title) continue
      imported.push({
        id: randomUUID(),
        calendarId,
        title,
        description: e.description ?? '',
        link: e.link,
        links: Array.isArray(e.links) ? e.links : [],
        location: e.location ?? '',
        startDate: String(e.startDate ?? '').trim(),
        endDate: String(e.endDate ?? e.startDate ?? '').trim(),
        allDay: e.allDay !== false,
        startTime: e.startTime ?? null,
        endTime: e.endTime ?? null,
        repeat: e.repeat ?? 'none',
        repeatUntil: e.repeatUntil ?? null,
        repeatCount: e.repeatCount ?? null,
        exdates: Array.isArray(e.exdates) ? e.exdates : [],
        color: e.color ?? null,
        guests: Array.isArray(e.guests) ? e.guests : [],
        completed: Boolean(e.completed),
        markerShape: e.markerShape ?? null,
        tagIds: Array.isArray(e.tagIds) ? e.tagIds : [],
        attachments: Array.isArray(e.attachments) ? e.attachments : [],
        sortOrder: typeof e.sortOrder === 'number' ? e.sortOrder : undefined,
        sortOrderByDay:
          e.sortOrderByDay && typeof e.sortOrderByDay === 'object'
            ? { ...e.sortOrderByDay }
            : undefined,
        createdAt: now,
        updatedAt: now,
        createdBy: e.createdBy ?? 'import',
        ownerLoginId: owner || undefined
      })
    }
    if (imported.length === 0) {
      throw new Error('가져올 일정이 없습니다.')
    }
    if (imported.some((e) => !e.startDate)) {
      throw new Error('시작일이 없는 일정이 있어 가져올 수 없습니다.')
    }

    this.writeCalendarFile(cal, [...existing, ...imported])
    this.cache = null
    return { ok: true, importedCount: imported.length, calendarId }
  }

  setTags(tags: TagRecord[]): TagRecord[] {
    const snap = this.getSnapshot()
    this.writeSettingsFile(snap.settings, tags)
    this.cache = null
    return structuredClone(tags)
  }

  createTag(input: { name: string; color: string; sortOrder?: number }): TagRecord {
    const snap = this.getSnapshot()
    const name = String(input.name ?? '').trim()
    if (!name) throw new Error('태그 이름을 입력해 주세요.')
    if (name.length > 32) throw new Error('태그 이름은 32자 이하여야 합니다.')
    const lower = name.toLowerCase()
    if (snap.tags.some((t) => t.name.trim().toLowerCase() === lower)) {
      throw new Error('같은 이름의 태그가 이미 있습니다.')
    }
    const maxOrder = snap.tags.reduce(
      (max, t) => (typeof t.sortOrder === 'number' ? Math.max(max, t.sortOrder) : max),
      -1
    )
    const tag: TagRecord = {
      id: `tag-${randomUUID()}`,
      name,
      color: String(input.color ?? '').trim() || getDefaultCalendarColor(snap.tags.length),
      sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : maxOrder + 1
    }
    this.writeSettingsFile(snap.settings, [...snap.tags, tag])
    this.cache = null
    return structuredClone(tag)
  }

  patchTag(id: string, patch: Partial<Pick<TagRecord, 'name' | 'color' | 'sortOrder'>>): TagRecord {
    const snap = this.getSnapshot()
    const prev = snap.tags.find((t) => t.id === id)
    if (!prev) throw new Error('태그를 찾을 수 없습니다.')
    let name = prev.name
    if (patch.name !== undefined) {
      name = String(patch.name).trim()
      if (!name) throw new Error('태그 이름을 입력해 주세요.')
      if (name.length > 32) throw new Error('태그 이름은 32자 이하여야 합니다.')
      const lower = name.toLowerCase()
      if (snap.tags.some((t) => t.id !== id && t.name.trim().toLowerCase() === lower)) {
        throw new Error('같은 이름의 태그가 이미 있습니다.')
      }
    }
    const next: TagRecord = {
      ...prev,
      name,
      color:
        patch.color !== undefined
          ? String(patch.color).trim() || prev.color
          : prev.color,
      sortOrder:
        typeof patch.sortOrder === 'number' ? patch.sortOrder : prev.sortOrder
    }
    this.writeSettingsFile(
      snap.settings,
      snap.tags.map((t) => (t.id === id ? next : t))
    )
    this.cache = null
    return structuredClone(next)
  }

  deleteTag(id: string): void {
    const snap = this.getSnapshot()
    if (!snap.tags.some((t) => t.id === id)) {
      throw new Error('태그를 찾을 수 없습니다.')
    }
    const nextTags = snap.tags.filter((t) => t.id !== id)
    this.writeSettingsFile(snap.settings, nextTags)

    const affectedCalIds = new Set<string>()
    for (const ev of snap.events) {
      if (!Array.isArray(ev.tagIds) || !ev.tagIds.includes(id)) continue
      affectedCalIds.add(ev.calendarId)
    }
    for (const calId of affectedCalIds) {
      const cal = snap.calendars.find((c) => c.id === calId)
      if (!cal) continue
      const events = snap.events
        .filter((e) => e.calendarId === calId)
        .map((e) =>
          Array.isArray(e.tagIds) && e.tagIds.includes(id)
            ? { ...e, tagIds: e.tagIds.filter((tagId) => tagId !== id) }
            : e
        )
      this.writeCalendarFile(cal, events)
    }
    this.cache = null
  }

  /**
   * Backfill missing ownerLoginId on calendars/events, then ensure personal calendars
   * for the bootstrap admin and every listed member (MDC EnsureMemberOwnership).
   */
  ensureMemberOwnership(
    bootstrapAdminId: string,
    memberLoginIds?: Iterable<string> | null
  ): void {
    const admin = bootstrapAdminId.trim()
    if (!admin) return

    const snap = this.getSnapshot()
    const calendarOwner = new Map<string, string>()

    for (const cal of snap.calendars) {
      const events = snap.events.filter((e) => e.calendarId === cal.id)
      if (cal.id === HOLIDAYS_KR_CALENDAR_ID) {
        if (cal.ownerLoginId) {
          const nextCal = { ...cal }
          delete nextCal.ownerLoginId
          this.writeCalendarFile(nextCal, events)
        }
        continue
      }
      const owner = String(cal.ownerLoginId ?? '').trim()
      if (!owner) {
        this.writeCalendarFile({ ...cal, ownerLoginId: admin }, events)
        calendarOwner.set(cal.id, admin)
      } else {
        calendarOwner.set(cal.id, owner)
      }
    }

    this.cache = null
    const afterCal = this.getSnapshot()
    const eventsByCal = new Map<string, CalendarEvent[]>()
    for (const ev of afterCal.events) {
      const list = eventsByCal.get(ev.calendarId) ?? []
      list.push(ev)
      eventsByCal.set(ev.calendarId, list)
    }

    for (const cal of afterCal.calendars) {
      const events = eventsByCal.get(cal.id) ?? []
      let changed = false
      const nextEvents = events.map((ev) => {
        if (cal.id === HOLIDAYS_KR_CALENDAR_ID) {
          if (ev.ownerLoginId) {
            changed = true
            const next = { ...ev }
            delete next.ownerLoginId
            return next
          }
          return ev
        }
        const owner = String(ev.ownerLoginId ?? '').trim()
        if (!owner) {
          changed = true
          return {
            ...ev,
            ownerLoginId: calendarOwner.get(cal.id) ?? admin
          }
        }
        return ev
      })
      if (changed) this.writeCalendarFile(cal, nextEvents)
    }

    this.cache = null
    this.ensurePersonalCalendar(admin, null, admin)
    if (memberLoginIds) {
      for (const loginId of memberLoginIds) {
        const id = String(loginId ?? '').trim()
        if (id) this.ensurePersonalCalendar(id, null, admin)
      }
    }
  }

  /** Create a personal calendar for a member if none exists (MDC EnsurePersonalCalendar). */
  ensurePersonalCalendar(
    loginId: string,
    displayName?: string | null,
    hideForAdminLoginId?: string | null
  ): CalendarRecord {
    const owner = loginId.trim()
    if (!owner) throw new Error('로그인 아이디가 필요합니다.')
    const snap = this.getSnapshot()
    const existing = snap.calendars.find(
      (c) =>
        c.id !== HOLIDAYS_KR_CALENDAR_ID &&
        String(c.ownerLoginId ?? '').trim().toLowerCase() === owner.toLowerCase()
    )
    if (existing) return existing

    const label = (displayName ?? '').trim() || owner
    let id = sanitizeDataKey(`cal-${owner.toLowerCase()}`)
    if (snap.calendars.some((c) => c.id === id)) {
      id = sanitizeDataKey(randomUUID())
    }
    const created = this.createCalendar({
      id,
      name: `${label}의 캘린더`,
      color: PRIMARY_CALENDAR_COLOR,
      owner: 'local',
      ownerLoginId: owner,
      ownerName: owner,
      custom: true,
      visible: true
    })
    this.hideNewMemberCalendarForAdmin(created, hideForAdminLoginId)
    return created
  }

  /**
   * Delete non-builtin calendars owned by loginId, remaining events tagged with that
   * owner, and that member's day-color / eye-toggle prefs (MDC PurgeMemberOwnedData).
   */
  purgeMemberOwnedData(loginId: string): number {
    const owner = loginId.trim()
    if (!owner) return 0
    const ownerLower = owner.toLowerCase()
    const snap = this.getSnapshot()
    const toDelete = snap.calendars.filter(
      (c) =>
        c.id !== PRIMARY_CALENDAR_ID &&
        c.id !== HOLIDAYS_KR_CALENDAR_ID &&
        String(c.ownerLoginId ?? '').trim().toLowerCase() === ownerLower
    )
    for (const cal of toDelete) {
      try {
        this.deleteCalendar(cal.id)
      } catch {
        /* already gone / protected */
      }
    }

    const afterCal = this.getSnapshot()
    const orphanEventIds = afterCal.events
      .filter((e) => String(e.ownerLoginId ?? '').trim().toLowerCase() === ownerLower)
      .map((e) => e.id)
    for (const eventId of orphanEventIds) {
      try {
        this.removeEvent(eventId)
      } catch {
        /* holidays / already gone */
      }
    }

    const cur = this.getSnapshot()
    const dayColorsByLoginId = { ...(cur.settings.dayColorsByLoginId ?? {}) }
    const hiddenCalendarIdsByLoginId = {
      ...(cur.settings.hiddenCalendarIdsByLoginId ?? {})
    }
    let settingsChanged = false
    for (const key of Object.keys(dayColorsByLoginId)) {
      if (key.toLowerCase() === ownerLower) {
        delete dayColorsByLoginId[key]
        settingsChanged = true
      }
    }
    for (const key of Object.keys(hiddenCalendarIdsByLoginId)) {
      if (key.toLowerCase() === ownerLower) {
        delete hiddenCalendarIdsByLoginId[key]
        settingsChanged = true
      }
    }
    if (settingsChanged) {
      this.patchStoreSettings({ dayColorsByLoginId, hiddenCalendarIdsByLoginId })
    }

    return toDelete.length
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
