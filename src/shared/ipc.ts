import type {
  DesktopQuickEditContext,
  QuickEditDeferToMainPayload,
  QuickEditWindowInit
} from './quickEditLayout'
export type { DesktopQuickEditContext, QuickEditDeferToMainPayload, QuickEditWindowInit }
import type { OpenPanelWindowRequest, PanelKind, PanelWindowInit } from './panelWindows'
export type { OpenPanelWindowRequest, PanelKind, PanelWindowInit }
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

/**
 * Preferred monitor footprint — survives sleep/wake when absolute DIP coords
 * temporarily resolve to the wrong (nearest) display.
 */
export type WidgetDisplayPlacement = {
  /** Electron `Display.id` for the preferred monitor. */
  displayId: number
  /** DIP offset from that display's `bounds` origin. */
  offsetX: number
  offsetY: number
  width: number
  height: number
}

export type AppSettings = {
  widget: {
    launchMode: LaunchMode
    bounds: WidgetBounds
    /** Preferred monitor + relative offsets (multi-monitor restore). */
    displayPlacement?: WidgetDisplayPlacement | null
  }
  weekStartsOn: 0 | 1
  headerOpacity: number
  shellOpacity: number
}

export type OpacityPreviewPatch = Pick<Partial<AppSettings>, 'headerOpacity' | 'shellOpacity'>

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

/** Period-toolbar zone: screen hit → inject click by stable action id. */
export type ClickForwardHitZone = ClientHitRect & {
  action: string
}

/** Stable ids for header `[data-toolbar-action]` buttons (WorkerW embedded click). */
export const PERIOD_TOOLBAR_ACTIONS = {
  viewYear: 'view-year',
  viewWeek: 'view-week',
  viewMonth: 'view-month',
  prevYear: 'prev-year',
  prev: 'prev',
  next: 'next',
  nextYear: 'next-year',
  today: 'today',
  webEditor: 'web-editor',
  toggleEvents: 'toggle-events',
  toggleCompleted: 'toggle-completed'
} as const

export const CHROME_TOOLBAR_ACTIONS = {
  search: 'search',
  settings: 'settings',
  /** Unified export options (Excel/PDF + layout/range). */
  export: 'export',
  enterDesktop: 'enter-desktop',
  enterWindow: 'enter-window',
  authToggle: 'auth-toggle',
  /** App name double-click → full reload (WorkerW embedded). */
  reload: 'reload'
} as const

/** Header actions that open floating panels while WorkerW-embedded. */
export const EMBEDDED_FLOATING_CHROME_ACTIONS = new Set<string>([
  CHROME_TOOLBAR_ACTIONS.search,
  CHROME_TOOLBAR_ACTIONS.settings
])

/** Header actions that detach from WorkerW and switch launch mode. */
export const EMBEDDED_MODE_CHROME_ACTIONS = new Set<string>([
  CHROME_TOOLBAR_ACTIONS.enterWindow,
  CHROME_TOOLBAR_ACTIONS.enterDesktop
])

/** Header export actions while WorkerW-embedded (undock briefly for dialogs). */
export const EMBEDDED_EXPORT_CHROME_ACTIONS = new Set<string>([
  CHROME_TOOLBAR_ACTIONS.export
])

/** Login / logout while WorkerW-embedded. */
export const EMBEDDED_AUTH_CHROME_ACTIONS = new Set<string>([
  CHROME_TOOLBAR_ACTIONS.authToggle
])

/** App-name reload while WorkerW-embedded (requires OS double-click). */
export const EMBEDDED_RELOAD_CHROME_ACTIONS = new Set<string>([
  CHROME_TOOLBAR_ACTIONS.reload
])

/** Toolbar actions that fire only on WM_LBUTTONDBLCLK while embedded. */
export const EMBEDDED_DOUBLE_CLICK_ACTIONS = new Set<string>([
  CHROME_TOOLBAR_ACTIONS.reload
])

/** Footer hint prev/pause/play/next while WorkerW-embedded. */
export const FOOTER_HINT_ACTIONS = {
  prev: 'footer-hint-prev',
  pause: 'footer-hint-pause',
  play: 'footer-hint-play',
  next: 'footer-hint-next'
} as const

export const EMBEDDED_FOOTER_HINT_ACTIONS = new Set<string>(Object.values(FOOTER_HINT_ACTIONS))

export type ToolbarClickPayload = {
  action: string
}

export type DayCellHitZone = ClientHitRect & {
  dateKey: string
}

export type OpenDayQuickEditPayload = {
  dateKey: string
  clientX?: number
  clientY?: number
}

export type FocusDayCellPayload = {
  dateKey: string
}

export type DayDblClickLogPayload = {
  msg: string
  data?: Record<string, unknown>
}

export type NeoCalendarApi = {
  setIgnoreMouse: (ignore: boolean, options?: SetIgnoreMouseOptions) => void
  getModeStatus: () => Promise<ModeStatus>
  enterDesktop: () => Promise<ModeStatus>
  enterWindow: () => Promise<ModeStatus>
  getWindowBounds: () => Promise<WidgetBounds>
  setWindowBounds: (bounds: WidgetBounds) => Promise<WidgetBounds>
  /** Legacy no-ops — unused hit-zone bridges. */
  setWindowModeHitZone: (rect: ClientHitRect | null) => void
  setHeaderHitZone: (rect: ClientHitRect | null) => void
  /** Legacy no-op — header hover wake removed. */
  setWakeHitZones: (zones: ClientHitRect[]) => void
  /** Period toolbar footprints for WorkerW embedded click → unlock + action. */
  setClickForwardHitZones: (zones: ClickForwardHitZone[]) => void
  /** Visible day-cell footprints for WorkerW custom double-click → quick edit. */
  setDayCellHitZones: (zones: DayCellHitZone[]) => void
  /** Client rects where day double-click must not fire (e.g. header/footer/weekday row). */
  setDayDblClickExcludeZones: (zones: ClientHitRect[]) => void
  setInteractionBusy: (busy: boolean) => void
  /** Activate OS keyboard/IME focus for Hangul (and other IME) text input. */
  focusForTextInput: () => void
  onModeChanged: (listener: (status: ModeStatus) => void) => () => void
  /** Main → renderer: open day quick edit after WorkerW double-click unlock. */
  onOpenDayQuickEdit: (listener: (payload: OpenDayQuickEditPayload) => void) => () => void
  /** Main → renderer: highlight/focus a day cell (e.g. while a floating quick-edit panel opens). */
  onFocusDayCell: (listener: (payload: FocusDayCellPayload) => void) => () => void
  /** WorkerW embedded: publish view context for floating quick-edit window. */
  setDesktopQuickEditContext: (context: DesktopQuickEditContext) => void
  /** Floating quick-edit window: read open payload after load. */
  getQuickEditInit: () => Promise<QuickEditWindowInit | null>
  closeQuickEditWindow: () => void
  /** Close floating quick edit and unlock main for editor/detail. */
  deferQuickEditToMain: (payload: QuickEditDeferToMainPayload) => Promise<boolean>
  /** Floating panel window (all panel kinds). */
  getPanelInit: () => Promise<PanelWindowInit | null>
  openPanelWindow: (request: OpenPanelWindowRequest) => Promise<boolean>
  closePanelWindow: () => void
  /** Close a floating panel by kind (sibling slots; e.g. eventDetail after recurring delete). */
  closePanelSlot: (kind: PanelKind) => void
  /**
   * Suppress outside-click dismiss for a short grace (ms).
   * Use when an in-panel modal closes so the same click does not wipe sibling panels.
   */
  blockPanelOutsideClose: (ms?: number) => void
  /**
   * Delete success: close detail/editor/scope; keep quickEdit (refreshes via store-changed).
   * Safe to call from a panel that is about to close.
   */
  closeAfterEventDelete: () => void
  routePanelWindow: (init: PanelWindowInit) => Promise<boolean>
  /** Shrink a floating panel BrowserWindow to fit its content (keeps x/y). */
  resizePanelWindow: (size: { width: number; height: number }) => Promise<boolean>
  /**
   * Floating panel: main asks the renderer to dismiss itself (save-if-dirty for eventEditor).
   * Outside-click uses this instead of destroying the window cold.
   */
  onPanelRequestDismiss: (listener: () => void) => () => void
  /** Main → renderer: open editor/detail after floating quick edit defers. */
  onQuickEditDeferred: (listener: (payload: QuickEditDeferToMainPayload) => void) => () => void
  /** Main → renderer: run period toolbar action after embedded click unlock. */
  onToolbarClick: (listener: (payload: ToolbarClickPayload) => void) => () => void
  /** Dev: main-process day-dblclick logs mirrored into renderer DevTools. */
  onDayDblClickLog?: (listener: (payload: DayDblClickLogPayload) => void) => () => void
  /** Fired when calendar store mutates (web API or another client). */
  onStoreChanged: (listener: () => void) => () => void
  /** Main window: shell login / logout completed (including from floating login panel). */
  onAuthChanged: (listener: () => void) => () => void
  /** Floating panel → main window live opacity preview while dragging sliders. */
  applyMainOpacityPreview: (patch: OpacityPreviewPatch) => void
  /** Main window: receive opacity preview from floating settings panel. */
  onMainOpacityPreview: (listener: (patch: OpacityPreviewPatch) => void) => () => void
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
  pickCalendarImportFile: () => Promise<
    | { cancelled: true }
    | { cancelled: false; content: string; filename: string }
  >
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
    layout?: 'monthGrid' | 'dayList'
    startDate?: string
    endDate?: string
    /** @deprecated Prefer startDate/endDate. Still accepted for back-compat. */
    year?: number
    /** @deprecated Prefer startDate/endDate. Still accepted for back-compat. */
    month?: number
    includeCompleted?: boolean
    includeHolidays?: boolean
    excludeHiddenCalendars?: boolean
    asAdmin?: boolean
  }) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>
  getDataRoot: () => Promise<string>
  /** Open http(s) URL in the system browser. */
  openExternal: (url: string) => Promise<void>
}
