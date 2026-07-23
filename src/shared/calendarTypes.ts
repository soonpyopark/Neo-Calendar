import type { LaunchMode, WidgetBounds } from './ipc'

export type CalendarOwner = 'local' | 'shared'

export type CalendarRecord = {
  id: string
  dataKey?: string
  name: string
  description?: string
  color: string
  visible: boolean
  owner: CalendarOwner
  custom?: boolean
  ownerLoginId?: string
  sortOrder?: number
}

export type EventLink = {
  id: string
  url: string
  title?: string
}

export type EventAttachment = {
  id: string
  name: string
  storedName: string
  mime?: string
  size?: number
  addedAt?: string
}

export type CalendarEvent = {
  id: string
  calendarId: string
  title: string
  description?: string
  link?: string
  links?: EventLink[]
  location?: string
  startDate: string
  endDate: string
  allDay: boolean
  startTime?: string | null
  endTime?: string | null
  repeat?: string
  repeatUntil?: string | null
  repeatCount?: number | null
  exdates?: string[]
  color?: string | null
  guests?: string[]
  completed?: boolean
  markerShape?: string | null
  tagIds?: string[]
  attachments?: EventAttachment[]
  sortOrder?: number
  sortOrderByDay?: Record<string, number>
  createdAt?: string
  updatedAt?: string
  createdBy?: string
  ownerLoginId?: string
  /** Expanded occurrence date (search / views). */
  occurrenceDate?: string
  seriesId?: string
}

export type TagRecord = {
  id: string
  name: string
  color: string
  sortOrder: number
}

export type MemberRole = 'super_admin' | 'member' | 'admin'

export type MemberRecord = {
  id: string
  loginId: string
  displayName: string
  passwordHash?: string
  role: MemberRole
  active: boolean
  isBootstrapAdmin?: boolean
}

/** UI save payload — plain `password` is hashed in MembersStore. */
export type MemberSaveInput = Omit<MemberRecord, 'passwordHash'> & {
  password?: string
  passwordHash?: string
}

export type HolidaysKrSettings = {
  serviceKey: string
  rememberKey: boolean
  ok: boolean | null
  skipped: boolean
  reason: string | null
  message: string | null
  years: number[]
  count: number
  lastSyncedAt: string | null
  /** api | seed | seed-fallback | env */
  source?: string | null
}

export type SyncHolidaysInput = {
  serviceKey?: string
  rememberKey?: boolean
  years?: number[]
}

export type SyncHolidaysResult = {
  ok: boolean
  count: number
  years: number[]
  source: string
  message?: string | null
}

export type ViewOptions = {
  showWeekNumbers: boolean
  weekStartsOnSunday: boolean
  /** Neo chrome: rounded shell/header/footer (legacy Neo look). Off = square MDC edges. */
  roundedCorners: boolean
  colorScheme: 'light' | 'dark' | 'system'
  accentColor: string
  runAtStartup: boolean
  eventsHidden: boolean
  completedHidden: boolean
}

export type StoreSettings = {
  ownerName: string
  timezone: string
  timezoneLabel: string
  notifications: {
    enabled: string
    reminderTiming: string
    playSound: boolean
    onlyYesOrMaybe: boolean
  }
  viewOptions: ViewOptions
  holidaysKr: HolidaysKrSettings
  widget: {
    launchMode: LaunchMode
    enabled: boolean
    alwaysOnTop: boolean
    bounds: WidgetBounds
    margins?: Record<string, number>
  }
  dayColors: Record<string, string>
  dayColorsByLoginId?: Record<string, Record<string, string>>
  hiddenCalendarIdsByLoginId?: Record<string, string[]>
  allowedIpCidrs: Array<{ cidr: string; description?: string }>
  /** Neo chrome extensions */
  headerOpacity: number
  shellOpacity: number
}

export type CalendarStoreSnapshot = {
  version: number
  settings: StoreSettings
  calendars: CalendarRecord[]
  events: CalendarEvent[]
  tags: TagRecord[]
  updatedAt: string
}

export type EventInput = Partial<CalendarEvent> & {
  title: string
  calendarId: string
  startDate: string
  endDate?: string
}
