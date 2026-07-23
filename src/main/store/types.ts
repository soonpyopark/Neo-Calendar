/**
 * Loose, any-friendly type definitions for the Neo Calendar main-process data store.
 * Mirrors the shapes used by the My Desktop Calendar (WPF) shared/constants.js port,
 * kept intentionally permissive (Record/any) so renderer payloads never fight the
 * type checker while still documenting the expected on-disk/IPC shapes.
 */

export type ID = string

export interface Attachment {
  id: string
  name: string
  storedName?: string
  size: number
  mimeType?: string | null
  addedAt: string
  [key: string]: any
}

export interface CalendarEvent {
  id: string
  calendarId: string
  title: string
  description?: string
  location?: string
  startDate: string
  endDate: string
  allDay?: boolean
  startTime?: string | null
  endTime?: string | null
  repeat?: string
  repeatUntil?: string | null
  repeatCount?: number | null
  exdates?: string[]
  color?: string | null
  guests?: any[]
  completed?: boolean
  markerShape?: string | null
  links?: any[]
  link?: string
  sortOrder?: number | null
  sortOrderByDay?: Record<string, number>
  tags?: string[]
  attachments?: Attachment[]
  createdAt?: string
  updatedAt?: string
  createdBy?: string
  [key: string]: any
}

export interface Calendar {
  id: string
  name: string
  description?: string
  color?: string | null
  visible?: boolean
  owner?: string
  ownerLoginId?: string | null
  custom?: boolean
  [key: string]: any
}

export interface Tag {
  id: string
  name: string
  color?: string | null
  sortOrder?: number
  [key: string]: any
}

export interface Settings {
  ownerName?: string
  timezone?: string
  timezoneLabel?: string
  notifications?: Record<string, any>
  viewOptions?: Record<string, any>
  holidaysKr?: Record<string, any>
  widget?: Record<string, any>
  dayColors?: Record<string, string>
  allowedIpCidrs?: any[]
  [key: string]: any
}

/** Combined, in-memory view of the whole store (what `readStore()` returns). */
export interface Store {
  version: number
  settings: Settings
  calendars: Calendar[]
  events: CalendarEvent[]
  tags: Tag[]
  updatedAt: string
}

/** On-disk shape of `calendars/{dataKey}.json`. */
export interface CalendarFile {
  version: number
  calendar: Calendar
  events: CalendarEvent[]
}

export type MemberRole = 'member' | 'super_admin'

export interface MemberRecord {
  id: string
  loginId: string
  displayName: string
  passwordHash?: any
  role: MemberRole
  active: boolean
  isBootstrapAdmin?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: any
}

export interface PublicMember {
  id: string
  loginId: string
  displayName: string
  role: MemberRole
  active: boolean
  isBootstrapAdmin?: boolean
  [key: string]: any
}

export interface AdminSession {
  token: string
  loginId: string
  role: string
  persistent: boolean
  isBootstrapAdmin?: boolean
  createdAt: string
  lastSeenAt?: string
  expiresAt?: string | null
  [key: string]: any
}
