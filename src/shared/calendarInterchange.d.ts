import type { CalendarEvent, CalendarRecord, CalendarStoreSnapshot } from './calendarTypes'

export type CalendarFileFormat = 'json' | 'ics' | 'csv' | 'zip'

export type CalendarFileFormatMeta = {
  value: CalendarFileFormat
  label: string
  extension: string
  mimeType: string
}

export declare const CALENDAR_FILE_FORMATS: CalendarFileFormatMeta[]

export function getCalendarFileFormatMeta(format: CalendarFileFormat): CalendarFileFormatMeta
export function detectCalendarFileFormat(filename: string): CalendarFileFormat | null
export function downloadCalendarFile(content: string, filename: string, mimeType: string): void

export function buildIcsDocument(
  events: CalendarEvent[],
  calendarNamesById?: Map<string, string>
): string

export function buildCsvDocument(
  events: CalendarEvent[],
  calendarNamesById?: Map<string, string>
): string

export function exportFullStore(
  store: CalendarStoreSnapshot,
  format: CalendarFileFormat,
  timestamp: string
): { content: string; filename: string; mimeType: string }

export function exportSingleCalendar(
  payload: { calendar: CalendarRecord; events: CalendarEvent[] },
  format: CalendarFileFormat,
  timestamp: string
): { content: string; filename: string; mimeType: string }

export function parseIcsEvents(text: string): Array<Partial<CalendarEvent> & { calendarLabel?: string }>
export function parseCsvEvents(text: string): Array<Partial<CalendarEvent> & { calendarLabel?: string }>

export type ParsedImportPayload =
  | { kind: 'json'; data: CalendarStoreSnapshot | { calendar: CalendarRecord; events: CalendarEvent[] } }
  | {
      kind: 'merge-calendar'
      data: {
        calendar: Partial<CalendarRecord> & { name: string }
        events: Array<Partial<CalendarEvent>>
      }
    }

export function parseImportPayload(
  text: string,
  format: CalendarFileFormat,
  sourceName?: string
): ParsedImportPayload

export function extractEventsFromImportPayload(parsed: ParsedImportPayload): unknown[]
