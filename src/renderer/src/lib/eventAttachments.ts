import type { CalendarEvent } from '../../../shared/calendarTypes'

/**
 * Attachment APIs — wired when main/preload expose them.
 * Until then, throws a clear message (UI already gates on canAttach).
 */
export async function addEventAttachments(_eventId: string): Promise<CalendarEvent> {
  const api = window.neoCalendar as {
    addEventAttachments?: (id: string) => Promise<CalendarEvent>
  }
  if (!api?.addEventAttachments) {
    throw new Error('파일 첨부는 아직 준비되지 않았습니다.')
  }
  return api.addEventAttachments(_eventId)
}

export async function removeEventAttachment(
  eventId: string,
  attachmentId: string
): Promise<CalendarEvent> {
  const api = window.neoCalendar as {
    removeEventAttachment?: (id: string, attachmentId: string) => Promise<CalendarEvent>
  }
  if (!api?.removeEventAttachment) {
    throw new Error('첨부 파일 삭제는 아직 준비되지 않았습니다.')
  }
  return api.removeEventAttachment(eventId, attachmentId)
}

export async function openEventAttachment(eventId: string, attachmentId: string): Promise<void> {
  const api = window.neoCalendar as {
    openEventAttachment?: (id: string, attachmentId: string) => Promise<void>
  }
  if (!api?.openEventAttachment) {
    throw new Error('첨부 파일을 열 수 없습니다.')
  }
  await api.openEventAttachment(eventId, attachmentId)
}
