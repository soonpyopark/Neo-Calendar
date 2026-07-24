import { normalizeTagIds } from '../../../shared/mdcExport/eventTags.js'
import type { CalendarEvent, EventInput } from '../../../shared/calendarTypes'
import {
  getEventLinks,
  getPrimaryEventLinkUrl,
  normalizeEventLinksArray
} from './eventLinks'

/** Strip identity fields for create/duplicate (MDC eventToMutationPayload). */
export function eventToMutationPayload(event: CalendarEvent): EventInput {
  const links = Array.isArray(event.links)
    ? normalizeEventLinksArray(event.links)
    : getEventLinks(event)
  return {
    calendarId: event.calendarId,
    title: event.title,
    description: event.description ?? '',
    links,
    link: getPrimaryEventLinkUrl({ links, link: event.link }),
    location: event.location ?? '',
    startDate: event.startDate,
    endDate: event.endDate,
    allDay: event.allDay,
    startTime: event.startTime,
    endTime: event.endTime,
    repeat: event.repeat ?? 'none',
    repeatUntil: event.repeatUntil ?? null,
    repeatCount: event.repeatCount ?? null,
    exdates: Array.isArray(event.exdates) ? event.exdates : [],
    color: event.color ?? null,
    guests: Array.isArray(event.guests) ? event.guests : [],
    completed: Boolean(event.completed),
    markerShape: event.markerShape ?? null,
    tagIds: normalizeTagIds(event.tagIds),
    sortOrder:
      typeof event.sortOrder === 'number' && Number.isFinite(event.sortOrder)
        ? event.sortOrder
        : undefined,
    sortOrderByDay:
      event.sortOrderByDay && typeof event.sortOrderByDay === 'object'
        ? { ...event.sortOrderByDay }
        : undefined
  }
}
