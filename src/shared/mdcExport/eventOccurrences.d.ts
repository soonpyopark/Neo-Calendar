/** Ambient types for MDC eventOccurrences.js (used by Neo renderer). */

import type { CalendarEvent } from '../calendarTypes'
export function isRecurringEvent(event: { repeat?: string | null } | null | undefined): boolean

export function getOccurrenceDate(
  event: { occurrenceDate?: string | null; startDate?: string | null } | null | undefined,
  fallbackDayKey?: string | null
): string | null

export function addExdate<T extends { exdates?: string[] | null }>(
  master: T,
  occurrenceDate: string
): T & { exdates: string[] }

export function recurrenceRuleChanged(
  master: Record<string, unknown> | null | undefined,
  payload: Record<string, unknown> | null | undefined
): boolean

export function pruneExdatesForSeries(
  series: Record<string, unknown> | null | undefined,
  exdates: string[] | null | undefined
): string[]

export function resolveExdatesForAllEdit(
  master: Record<string, unknown> | null | undefined,
  payload: Record<string, unknown> | null | undefined
): string[]

export function splitExdatesAt(
  exdates: string[] | null | undefined,
  fromDate: string
): { before: string[]; after: string[] }

export function truncateSeriesBefore<T extends {
  startDate?: string | null
  seriesStartDate?: string | null
  repeat?: string | null
  repeatUntil?: string | null
  repeatCount?: number | null
  exdates?: string[] | null
}>(
  master: T,
  fromDate: string
): T & {
  repeat: string | null
  repeatUntil: string | null
  repeatCount: number | null
  exdates: string[]
}

export function buildSingleExceptionEvent(
  master: Record<string, unknown>,
  patch: Record<string, unknown>,
  occurrenceDate: string
): Record<string, unknown>

export function buildFollowingSeriesEvent(
  master: Record<string, unknown>,
  patch: Record<string, unknown>,
  occurrenceDate: string
): Record<string, unknown>

export function getSeriesId(event: { id?: string; seriesId?: string } | null | undefined): string | null

export function expandEventsForRange(
  events: CalendarEvent[] | null | undefined,
  rangeStart: string,
  rangeEnd: string
): CalendarEvent[]
