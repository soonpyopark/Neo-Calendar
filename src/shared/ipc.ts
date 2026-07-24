import type {
  CalendarEvent,
  CalendarRecord,
  CalendarStoreSnapshot,
  EventInput,
  MemberRecord,
  MemberSaveInput,
  StoreSettings,
  SyncHolidaysInput,
  SyncHolidaysResult,
  TagRecord
} from './calendarTypes'

export type SetIgnoreMouseOptions = {
  /** Electron native option mapped in main */
  forward?: boolean
  /** Project alias; treated the same as `forward` in main */
  forwardToOverlay?: boolean
}

export type LaunchMode = 'desktop' | 'window'

export type WidgetBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type AppSettings = {
  widget: {
    launchMode: LaunchMode
    bounds: WidgetBounds
  }
  weekStartsOn: 0 | 1
  headerOpacity: number
  shellOpacity: number
}

export type AuthUser = {
  loginId: string
  role: 'admin'
}

export type LoginResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string }

export type ModeStatus = {
  mode: LaunchMode
  embedded: boolean
  bounds: WidgetBounds
  /** False while mode buttons are gated (cursor still on header after a switch). */
  switchReady: boolean
}

export type ClientHitRect = {
  x: number
  y: number
  width: number
  height: number
}

export type DayCellHitZone = ClientHitRect & {
  dateKey: string
}

export type OpenDayQuickEditPayload = {
  dateKey: string
  clientX?: number
  clientY?: number
}

export type NeoCalendarApi = {
  setIgnoreMouse: (ignore: boolean, options?: SetIgnoreMouseOptions) => void
  getModeStatus: () => Promise<ModeStatus>
  enterDesktop: () => Promise<ModeStatus>
  enterWindow: () => Promise<ModeStatus>
  getWindowBounds: () => Promise<WidgetBounds>
  setWindowBounds: (bounds: WidgetBounds) => Promise<WidgetBounds>
  /** Client-space rect of the window-mode button (for WorkerW click bridging). */
  setWindowModeHitZone: (rect: ClientHitRect | null) => void
  /** Client-space rect of the app chrome header (legacy; prefer setWakeHitZones). */
  setHeaderHitZone: (rect: ClientHitRect | null) => void
  /** Client-space zones that temporarily undock under-icons mode on hover. */
  setWakeHitZones: (zones: ClientHitRect[]) => void
  /**
   * Period/toolbar buttons that receive injected clicks while WorkerW-embedded
   * (연/주/월/nav/오늘/internet/eye/check) — no undock.
   */
  setClickForwardHitZones: (zones: ClientHitRect[]) => void
  /** Day cells for WorkerW double-click → quick edit (no hover wake). */
  setDayCellHitZones: (zones: DayCellHitZone[]) => void
  /**
   * True while a desktop-mode UI task is open (quick edit / search / settings / login).
   * Keeps the temporary undock from re-embedding until work finishes + idle timeout.
   */
  setInteractionBusy: (busy: boolean) => void
  /** Activate OS keyboard/IME focus for Hangul (and other IME) text input. */
  focusForTextInput: () => void
  onModeChanged: (listener: (status: ModeStatus) => void) => () => void
  onOpenDayQuickEdit: (listener: (payload: OpenDayQuickEditPayload) => void) => () => void
  /** Fired when calendar store mutates (web API or another client). */
  onStoreChanged: (listener: () => void) => () => void
  getAuth: () => Promise<AuthUser | null>
  /** Local/LAN HTTP editor status (MDC /api/sync-info). */
  getSyncInfo: () => Promise<{
    running: boolean
    port: number | null
    hostname: string | null
    lanMode: boolean
    addresses: string[]
    /** Browser editor URL (Vite in dev, local server when packaged). */
    editorUrl: string | null
  }>
  login: (loginId: string, password: string, remember?: boolean) => Promise<LoginResult>
  logout: () => Promise<void>
  getSettings: () => Promise<AppSettings>
  patchSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  /** MDC-compatible calendar store */
  getCalendarStore: () => Promise<CalendarStoreSnapshot>
  patchStoreSettings: (patch: Partial<StoreSettings>) => Promise<CalendarStoreSnapshot>
  replaceCalendarStore: (store: CalendarStoreSnapshot) => Promise<CalendarStoreSnapshot>
  /** MDC import: full replace (keep holidays-kr) or single-calendar merge */
  importCalendarStore: (payload: unknown) => Promise<CalendarStoreSnapshot>
  exportBackupZip: () => Promise<{
    ok: boolean
    cancelled?: boolean
    path?: string
    attachmentFiles?: number
    eventsWithAttachments?: number
  }>
  importBackupZip: () => Promise<{
    ok: boolean
    cancelled?: boolean
    path?: string
    attachmentFiles?: number
    store?: CalendarStoreSnapshot
  }>
  addEvent: (input: EventInput) => Promise<CalendarEvent>
  editEvent: (id: string, patch: Partial<CalendarEvent>) => Promise<CalendarEvent>
  removeEvent: (id: string) => Promise<void>
  /** Native multi-file picker → copy into data/attachments/{eventId}/ */
  addEventAttachments: (eventId: string) => Promise<CalendarEvent>
  removeEventAttachment: (eventId: string, attachmentId: string) => Promise<CalendarEvent>
  openEventAttachment: (eventId: string, attachmentId: string) => Promise<void>
  createCalendar: (
    input: Partial<CalendarRecord> & { name: string; color: string }
  ) => Promise<CalendarRecord>
  patchCalendar: (id: string, patch: Partial<CalendarRecord>) => Promise<CalendarRecord>
  /** Persist DnD order in one round-trip (browser-safe; avoids WS refresh races). */
  reorderCalendars: (orderedIds: string[]) => Promise<CalendarRecord[]>
  deleteCalendar: (id: string) => Promise<void>
  clearCalendarEvents: (id: string) => Promise<void>
  importEventsIntoCalendar: (
    id: string,
    events: unknown[]
  ) => Promise<{ ok: true; importedCount: number; calendarId: string }>
  setTags: (tags: TagRecord[]) => Promise<TagRecord[]>
  createTag: (input: { name: string; color: string; sortOrder?: number }) => Promise<TagRecord>
  patchTag: (
    id: string,
    patch: Partial<Pick<TagRecord, 'name' | 'color' | 'sortOrder'>>
  ) => Promise<TagRecord>
  deleteTag: (id: string) => Promise<void>
  listMembers: () => Promise<MemberRecord[]>
  saveMembers: (members: MemberSaveInput[]) => Promise<MemberRecord[]>
  syncHolidays: (input?: SyncHolidaysInput) => Promise<SyncHolidaysResult>
  exportCalendar: (input: {
    format: 'excel' | 'pdf'
    year: number
    month: number
    asAdmin?: boolean
  }) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>
  getDataRoot: () => Promise<string>
  /** Open http(s) URL in the system browser. */
  openExternal: (url: string) => Promise<void>
}
