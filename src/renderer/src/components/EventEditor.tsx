// @ts-nocheck — ported from MDC EventEditor.jsx; keep UI parity over strict typing.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HOLIDAYS_KR_CALENDAR_ID } from '../../../shared/calendarDefaults'
import type { CalendarEvent, CalendarRecord, TagRecord } from '../../../shared/calendarTypes'

export type EventEditorProps = {
  open: boolean
  event: CalendarEvent | null
  calendars: CalendarRecord[]
  tags?: TagRecord[]
  defaultDate?: string
  onClose: () => void
  onSave: (payload: Record<string, unknown>) => void | Promise<void>
  onDelete?: (event: CalendarEvent) => void | Promise<void>
  onEventRefresh?: (event: CalendarEvent) => void
}
import { getDefaultCalendarId } from '../lib/calendarOrder'
import { toDateKey } from '../lib/calendarUtils'
import { getCalendarTheme } from '../lib/colors'
import { insertTextAtCursor } from '../lib/insertAtCursor'
import { cn } from '../lib/cn'
import {
  appendEventLink,
  getEventLinks,
  getPrimaryEventLinkUrl,
  normalizeEventLinkUrl,
  normalizeEventLinksArray
} from '../lib/eventLinks'
import { normalizeTagIds } from '../../../shared/mdcExport/eventTags.js'
import { formatFileSize } from '../lib/formatFileSize'
import {
  addEventAttachments,
  openEventAttachment,
  removeEventAttachment
} from '../lib/eventAttachments'
import { openExternalUrl } from '../lib/openExternal'
import { InteractionUI } from './InteractionUI'
import { useAppDialog } from './AppDialogProvider'
import DateInput from './DateInput'
import { EmojiPickerButton } from './EmojiPickerButton'
import { EventMarkerShapeButton } from './EventMarkerShapeButton'
import { QuickEditCalendarButton } from './QuickEditCalendarButton'
import { QuickEditTagButton } from './QuickEditTagButton'

const fieldClass =
  'rounded border border-gcal-border bg-gcal-page px-2.5 py-2 text-gcal-heading placeholder:text-gcal-muted focus:border-gcal-blue focus:outline-none focus:ring-2 focus:ring-gcal-blue/15';

/** DateInput owns horizontal padding — avoid px-* here so the calendar icon isn't followed by empty space. */
const dateFieldClass =
  'rounded border border-gcal-border bg-gcal-page py-2 text-gcal-heading focus:border-gcal-blue focus:outline-none focus:ring-2 focus:ring-gcal-blue/15';

const timeFieldClass =
  'h-9 rounded border-0 bg-gcal-input px-2.5 text-gcal-heading focus:bg-gcal-surface-2 focus:outline-none focus:ring-2 focus:ring-gcal-blue/15';

/** Same width for 바로가기 [추가] and 첨부파일 [파일 선택]. */
const sideActionBtnClass =
  'inline-flex h-9 w-[5.25rem] shrink-0 items-center justify-center rounded border border-gcal-border bg-gcal-page px-2 text-sm font-medium text-gcal-heading hover:bg-gcal-surface-2 disabled:cursor-not-allowed disabled:opacity-40';

const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '10:00';

const REPEAT_OPTIONS = [
  { value: 'none', label: '반복 안함' },
  { value: 'daily', label: '매일' },
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' },
  { value: 'yearly', label: '매년' },
  { value: 'lunar-monthly', label: '음력 매월' },
  { value: 'lunar-yearly', label: '음력 매년' },
  { value: 'weekdays', label: '주중(월~금)' },
];

const REPEAT_END_OPTIONS = [
  { value: 'never', label: '계속 반복' },
  { value: 'until', label: '종료일' },
  { value: 'count', label: '횟수' },
];

function getEditableCalendars(calendars) {
  return (calendars ?? []).filter((calendar) => calendar.id !== HOLIDAYS_KR_CALENDAR_ID);
}

function resolveRepeatEndMode(event) {
  if (!event || (event.repeat ?? 'none') === 'none') return 'never';
  if (event.repeatUntil) return 'until';
  if (event.repeatCount) return 'count';
  return 'never';
}

/** Stable fingerprint of editable fields (attachments are saved immediately — excluded). */
function formFingerprint({
  title,
  startDate,
  endDate,
  allDay,
  startTime,
  endTime,
  repeat,
  repeatEndMode,
  repeatUntil,
  repeatCount,
  description,
  links,
  calendarId,
  markerShape,
  tagIds,
  completed,
}) {
  return JSON.stringify({
    title: title ?? '',
    startDate: startDate ?? '',
    endDate: endDate ?? '',
    allDay: Boolean(allDay),
    startTime: startTime ?? '',
    endTime: endTime ?? '',
    repeat: repeat ?? 'none',
    repeatEndMode: repeatEndMode ?? 'never',
    repeatUntil: repeatUntil ?? '',
    repeatCount: String(repeatCount ?? ''),
    description: description ?? '',
    links: normalizeEventLinksArray(links),
    calendarId: calendarId ?? '',
    markerShape: markerShape ?? null,
    tagIds: normalizeTagIds(tagIds),
    completed: Boolean(completed),
  });
}

export function EventEditor({
  open,
  event,
  calendars,
  tags = [],
  defaultDate,
  onClose,
  onSave,
  onDelete,
  onEventRefresh
}: EventEditorProps) {
  const { alert, confirm } = useAppDialog()
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME);
  const [repeat, setRepeat] = useState('none');
  const [repeatEndMode, setRepeatEndMode] = useState('never');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [repeatCount, setRepeatCount] = useState('10');
  const [description, setDescription] = useState('');
  const [links, setLinks] = useState([]);
  const [linkDraft, setLinkDraft] = useState('');
  const [calendarId, setCalendarId] = useState(
    () => getDefaultCalendarId(calendars, HOLIDAYS_KR_CALENDAR_ID),
  );
  const [markerShape, setMarkerShape] = useState(null);
  const [tagIds, setTagIds] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const titleInputRef = useRef(null);
  /** Re-seed the form only when the editor opens for a different event (or create). */
  const formSeedKeyRef = useRef(null);
  /** Fingerprint of fields right after seed — used to detect unsaved edits on close. */
  const initialFingerprintRef = useRef(null);

  useEffect(() => {
    if (!open) {
      formSeedKeyRef.current = null;
      initialFingerprintRef.current = null;
      return;
    }

    // Dual-WebView store broadcasts (common in desktop mode) replace `event` /
    // `calendars` with new object identities while the user is mid-edit. The old
    // dependency list re-ran this effect on every broadcast and wiped in-progress
    // fields (e.g. startDate snapping back to event.startDate).
    const seedKey = event?.id
      ? `edit:${event.id}`
      : `new:${defaultDate ? toDateKey(defaultDate) : 'today'}`;
    if (formSeedKeyRef.current === seedKey) {
      return;
    }
    formSeedKeyRef.current = seedKey;

    if (event) {
      const seeded = {
        title: event.title ?? '',
        startDate: event.startDate ?? toDateKey(defaultDate ?? new Date()),
        endDate: event.endDate ?? event.startDate ?? toDateKey(defaultDate ?? new Date()),
        allDay: event.allDay ?? true,
        startTime: event.startTime ?? DEFAULT_START_TIME,
        endTime: event.endTime ?? DEFAULT_END_TIME,
        repeat: event.repeat ?? 'none',
        repeatEndMode: resolveRepeatEndMode(event),
        repeatUntil: event.repeatUntil ?? event.startDate ?? '',
        repeatCount: String(event.repeatCount ?? 10),
        description: event.description ?? '',
        links: getEventLinks(event),
        calendarId: event.calendarId && event.calendarId !== HOLIDAYS_KR_CALENDAR_ID
          ? event.calendarId
          : getDefaultCalendarId(calendars, HOLIDAYS_KR_CALENDAR_ID),
        markerShape: event.markerShape ?? null,
        tagIds: normalizeTagIds(event.tagIds),
        completed: Boolean(event.completed),
      };
      setTitle(seeded.title);
      setStartDate(seeded.startDate);
      setEndDate(seeded.endDate);
      setAllDay(seeded.allDay);
      setStartTime(seeded.startTime);
      setEndTime(seeded.endTime);
      setRepeat(seeded.repeat);
      setRepeatEndMode(seeded.repeatEndMode);
      setRepeatUntil(seeded.repeatUntil);
      setRepeatCount(seeded.repeatCount);
      setDescription(seeded.description);
      setLinks(seeded.links);
      setLinkDraft('');
      setCalendarId(seeded.calendarId);
      setMarkerShape(seeded.markerShape);
      setTagIds(seeded.tagIds);
      setAttachments(Array.isArray(event.attachments) ? event.attachments : []);
      setCompleted(seeded.completed);
      initialFingerprintRef.current = formFingerprint(seeded);
      return;
    }

    const base = defaultDate ? toDateKey(defaultDate) : toDateKey(new Date());
    const seeded = {
      title: '',
      startDate: base,
      endDate: base,
      allDay: true,
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
      repeat: 'none',
      repeatEndMode: 'never',
      repeatUntil: base,
      repeatCount: '10',
      description: '',
      links: [],
      calendarId: getDefaultCalendarId(calendars, HOLIDAYS_KR_CALENDAR_ID),
      markerShape: null,
      tagIds: [],
      completed: false,
    };
    setTitle(seeded.title);
    setDescription(seeded.description);
    setTagIds(seeded.tagIds);
    setLinks(seeded.links);
    setLinkDraft('');
    setAllDay(seeded.allDay);
    setStartTime(seeded.startTime);
    setEndTime(seeded.endTime);
    setRepeat(seeded.repeat);
    setRepeatEndMode(seeded.repeatEndMode);
    setRepeatUntil(seeded.repeatUntil);
    setRepeatCount(seeded.repeatCount);
    setCalendarId(seeded.calendarId);
    setMarkerShape(seeded.markerShape);
    setAttachments([]);
    setCompleted(seeded.completed);
    setStartDate(seeded.startDate);
    setEndDate(seeded.endDate);
    initialFingerprintRef.current = formFingerprint(seeded);
  }, [open, event, calendars, defaultDate]);

  useEffect(() => {
    if (!open || !event?.id) return;
    setAttachments(Array.isArray(event.attachments) ? event.attachments : []);
  }, [open, event?.id, event?.attachments]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const input = titleInputRef.current;
      if (!input) return;
      input.focus();
      // Edit: select title text block (same as previous desktop project).
      // Create: focus empty field ready to type.
      if (event) {
        input.select();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, event]);

  const editableCalendars = useMemo(() => getEditableCalendars(calendars), [calendars]);
  const selectedCalendar = editableCalendars.find((c) => c.id === calendarId)
    ?? calendars?.find((c) => c.id === calendarId);
  const calendarTheme = useMemo(
    () => getCalendarTheme(selectedCalendar?.color ?? '#039be5'),
    [selectedCalendar?.color],
  );
  const showRepeatEnd = repeat !== 'none';
  const canAttach =
    Boolean(event?.id) &&
    typeof (window.neoCalendar as { addEventAttachments?: unknown } | undefined)
      ?.addEventAttachments === 'function'
  const attachmentNames = attachments.map((item) => item.name).filter(Boolean).join(', ');

  const isDirty = useMemo(() => {
    if (!open || initialFingerprintRef.current == null) return false;
    return formFingerprint({
      title,
      startDate,
      endDate,
      allDay,
      startTime,
      endTime,
      repeat,
      repeatEndMode,
      repeatUntil,
      repeatCount,
      description,
      links,
      calendarId,
      markerShape,
      tagIds,
      completed,
    }) !== initialFingerprintRef.current;
  }, [
    open,
    title,
    startDate,
    endDate,
    allDay,
    startTime,
    endTime,
    repeat,
    repeatEndMode,
    repeatUntil,
    repeatCount,
    description,
    links,
    calendarId,
    markerShape,
    tagIds,
    completed,
  ]);

  const buildSavePayload = useCallback(() => {
    const normalizedEndDate = endDate < startDate ? startDate : endDate;
    let normalizedEndTime = endTime;
    if (!allDay && startDate === normalizedEndDate && endTime < startTime) {
      normalizedEndTime = startTime;
    }

    const parsedCount = Math.max(1, Number.parseInt(repeatCount, 10) || 1);
    const normalizedUntil = repeatUntil && repeatUntil < startDate ? startDate : repeatUntil;
    const repeating = repeat !== 'none';

    return {
      id: event?.id,
      title,
      startDate,
      endDate: normalizedEndDate,
      allDay,
      startTime: allDay ? null : startTime,
      endTime: allDay ? null : normalizedEndTime,
      repeat,
      repeatUntil: repeating && repeatEndMode === 'until' ? normalizedUntil : null,
      repeatCount: repeating && repeatEndMode === 'count' ? parsedCount : null,
      exdates: Array.isArray(event?.exdates) ? event.exdates : [],
      description,
      links: normalizeEventLinksArray(links),
      link: getPrimaryEventLinkUrl({ links }),
      location: event?.location ?? '',
      calendarId,
      guests: event?.guests ?? [],
      color: event?.color ?? null,
      completed,
      markerShape,
      tagIds: normalizeTagIds(tagIds),
      sortOrder: typeof event?.sortOrder === 'number' && Number.isFinite(event.sortOrder)
        ? event.sortOrder
        : null,
    };
  }, [
    allDay,
    calendarId,
    completed,
    description,
    endDate,
    endTime,
    event,
    links,
    markerShape,
    repeat,
    repeatCount,
    repeatEndMode,
    repeatUntil,
    startDate,
    startTime,
    tagIds,
    title,
  ]);

  const handleCloseRequest = useCallback(() => {
    if (!isDirty) {
      onClose();
      return;
    }
    // Persist edits on dismiss. Recurring scope dialog (if needed) is opened by onSave
    // and keeps the editor open — do not call onClose in that path.
    onSave(buildSavePayload());
  }, [buildSavePayload, isDirty, onClose, onSave]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') handleCloseRequest();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleCloseRequest]);

  if (!open) return null;

  const applyAttachmentResult = (updated) => {
    const next = Array.isArray(updated?.attachments) ? updated.attachments : [];
    setAttachments(next);
    onEventRefresh?.(updated);
  };

  const handleAddAttachments = async () => {
    if (!event?.id || attachBusy) return;
    if (!canAttach) {
      await alert('파일 첨부는 아직 준비되지 않았습니다.');
      return;
    }
    setAttachBusy(true);
    try {
      const updated = await addEventAttachments(event.id);
      applyAttachmentResult(updated);
    } catch (err) {
      await alert(err instanceof Error ? err.message : '파일을 첨부하지 못했습니다.');
    } finally {
      setAttachBusy(false);
    }
  };

  const handleRemoveAttachment = async (attachmentId) => {
    if (!event?.id || !attachmentId || attachBusy) return;
    const ok = await confirm('이 첨부 파일을 삭제할까요?');
    if (!ok) return;
    setAttachBusy(true);
    try {
      const updated = await removeEventAttachment(event.id, attachmentId);
      applyAttachmentResult(updated);
    } catch (err) {
      await alert(err instanceof Error ? err.message : '첨부 파일을 삭제하지 못했습니다.');
    } finally {
      setAttachBusy(false);
    }
  };

  const handleOpenAttachment = async (attachmentId) => {
    if (!event?.id || !attachmentId) return;
    try {
      await openEventAttachment(event.id, attachmentId);
    } catch (err) {
      await alert(err instanceof Error ? err.message : '첨부 파일을 열지 못했습니다.');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(buildSavePayload());
  };

  const handleDelete = async () => {
    if (!event?.id || !onDelete) return;
    const ok = await confirm('이 일정을 정말 삭제하시겠습니까?');
    if (ok) onDelete(event);
  };

  const insertTitleEmoji = (emoji) => {
    const el = titleInputRef.current;
    const { nextValue, nextPos } = insertTextAtCursor(el, title, emoji);
    setTitle(nextValue);
    // Restore caret after React commits the new value to the input.
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(nextPos, nextPos);
    });
  };

  return (
    <div
      className="interaction-ui fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4"
      role="presentation"
      onClick={handleCloseRequest}
    >
      <InteractionUI
        className="relative z-30 my-auto w-[min(720px,calc(100vw-32px))] max-h-[calc(100vh-32px)]"
        role="dialog"
        aria-modal="true"
        aria-label={event?.id ? '일정 편집' : '일정 추가'}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
      <form
        className="settings-scroll shell-solid-surface max-h-[calc(100vh-32px)] overflow-auto rounded-lg shadow-g-lg"
        onSubmit={handleSubmit}
      >
        <div className="h-1" style={{ background: calendarTheme.base }} />

        <div className="flex items-center gap-3 border-b border-gcal-border-light px-[18px] py-3.5">
          <div className="event-editor-toolbar-icons flex shrink-0 items-center gap-1">
            <label
              className="event-editor-toolbar-check inline-flex shrink-0 cursor-pointer items-center justify-center border border-transparent text-gcal-muted transition-colors hover:border-gcal-border hover:bg-gcal-surface-2"
              title={completed ? '미완료로 표시' : '완료로 표시'}
            >
              <input
                type="checkbox"
                className="day-quick-edit-check h-4 w-4"
                checked={completed}
                onChange={(e) => setCompleted(e.target.checked)}
                aria-label={completed ? '미완료로 표시' : '완료로 표시'}
              />
            </label>
            <EventMarkerShapeButton
              buttonClassName="event-editor-toolbar-trigger event-editor-shape-trigger"
              value={markerShape}
              color={selectedCalendar?.color ?? calendarTheme.base}
              onChange={setMarkerShape}
            />
            <EmojiPickerButton
              title="이모지 추가"
              buttonClassName="event-editor-toolbar-trigger event-editor-emoji-trigger"
              onSelect={insertTitleEmoji}
            />
            <QuickEditCalendarButton
              calendars={calendars}
              value={calendarId}
              buttonClassName="event-editor-toolbar-trigger"
              onChange={setCalendarId}
            />
            <QuickEditTagButton
              tags={tags}
              value={tagIds}
              buttonClassName="event-editor-toolbar-trigger"
              onChange={setTagIds}
            />
          </div>
          <input
            ref={titleInputRef}
            className={cn(
              'min-w-0 flex-1 border-0 bg-transparent text-[22px] outline-none placeholder:text-gcal-muted',
              completed ? 'text-gcal-muted line-through' : 'text-gcal-heading',
            )}
            placeholder="일정 추가 및 시간 설정"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="submit"
              className="event-editor-action-btn"
              aria-label="저장"
              title="저장"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"
                />
              </svg>
            </button>
            {event?.id && onDelete && (
              <button
                type="button"
                className="event-editor-action-btn"
                onClick={() => void handleDelete()}
                aria-label="삭제"
                title="삭제"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="event-editor-action-btn"
              onClick={handleCloseRequest}
              aria-label="닫기"
              title="닫기"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 border-b border-gcal-border-light bg-gcal-surface px-[18px] py-4">
          <div className="flex flex-nowrap items-center justify-start gap-2.5">
            {allDay ? (
              <>
                <DateInput
                  className={dateFieldClass}
                  value={startDate}
                  onChange={setStartDate}
                  aria-label="시작일"
                />
                <span>~</span>
                <DateInput
                  className={dateFieldClass}
                  value={endDate}
                  onChange={setEndDate}
                  min={startDate}
                  aria-label="종료일"
                />
              </>
            ) : (
              <>
                <DateInput
                  className={dateFieldClass}
                  value={startDate}
                  onChange={setStartDate}
                  aria-label="시작일"
                />
                <input
                  type="time"
                  className={timeFieldClass}
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  aria-label="시작 시간"
                />
                <span className="text-gcal-muted">-</span>
                <input
                  type="time"
                  className={timeFieldClass}
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  aria-label="종료 시간"
                />
                <DateInput
                  className={dateFieldClass}
                  value={endDate}
                  onChange={setEndDate}
                  min={startDate}
                  aria-label="종료일"
                />
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-1.5 text-gcal-body">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              종일
            </label>
            <select
              className={fieldClass}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              aria-label="반복"
            >
              {REPEAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {showRepeatEnd && (
              <>
                <select
                  className={fieldClass}
                  value={repeatEndMode}
                  onChange={(e) => setRepeatEndMode(e.target.value)}
                  aria-label="반복 종료"
                >
                  {REPEAT_END_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {repeatEndMode === 'until' && (
                  <DateInput
                    className={dateFieldClass}
                    value={repeatUntil || startDate}
                    min={startDate}
                    onChange={setRepeatUntil}
                    aria-label="반복 종료일"
                  />
                )}
                {repeatEndMode === 'count' && (
                  <label className="inline-flex items-center gap-1.5 text-sm text-gcal-body">
                    <input
                      type="number"
                      min={1}
                      max={999}
                      className={`${fieldClass} w-20`}
                      value={repeatCount}
                      onChange={(e) => setRepeatCount(e.target.value)}
                      aria-label="반복 횟수"
                    />
                    회
                  </label>
                )}
              </>
            )}
          </div>
        </div>

        <div className="px-[18px] py-4">
          <div className="mb-3.5 flex items-start gap-2 text-sm text-gcal-muted">
            <span className="w-16 shrink-0 pt-2">바로가기</span>
            <div className="min-w-0 flex-1 space-y-2">
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const input = e.currentTarget.elements.namedItem('event-link-url')
                  if (input instanceof HTMLInputElement && !input.checkValidity()) {
                    input.reportValidity()
                    return
                  }
                  const url = normalizeEventLinkUrl(linkDraft)
                  if (!url) {
                    if (input instanceof HTMLInputElement) {
                      input.setCustomValidity('올바른 URL을 입력하세요. 예: https://example.com')
                      input.reportValidity()
                      input.setCustomValidity('')
                    }
                    return
                  }
                  setLinks((prev) => appendEventLink(prev, url))
                  setLinkDraft('')
                }}
              >
                <input
                  type="url"
                  name="event-link-url"
                  className={cnField(fieldClass, 'min-w-0 flex-1')}
                  value={linkDraft}
                  onChange={(e) => {
                    e.target.setCustomValidity('')
                    setLinkDraft(e.target.value)
                  }}
                  placeholder="https://example.com"
                />
                <button
                  type="submit"
                  className={sideActionBtnClass}
                  disabled={!linkDraft.trim()}
                >
                  추가
                </button>
              </form>
              {links.length > 0 && (
                <ul className="m-0 list-none space-y-1 p-0">
                  {links.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 rounded border border-gcal-border-light bg-gcal-page px-2 py-1.5"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-gcal-heading hover:underline"
                        title="바로가기 열기"
                        onClick={() => void openExternalUrl(item.url)}
                      >
                        {item.title || item.url}
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-[#c5221f] hover:bg-[#fce8e6]"
                        onClick={() => setLinks((prev) => prev.filter((row) => row.id !== item.id))}
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mb-3.5 flex items-start gap-2 text-sm text-gcal-muted">
            <span className="w-16 shrink-0 pt-2">첨부파일</span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className={cnField(fieldClass, 'min-w-0 flex-1')}
                  value={attachmentNames}
                  readOnly
                  placeholder={
                    event?.id
                      ? (canAttach ? '첨부된 파일이 없습니다' : '데스크톱 앱에서 첨부할 수 있습니다')
                      : '일정을 저장한 뒤 파일을 첨부할 수 있습니다'
                  }
                  onClick={() => {
                    if (canAttach && !attachBusy) void handleAddAttachments();
                  }}
                />
                <button
                  type="button"
                  className={sideActionBtnClass}
                  disabled={!canAttach || attachBusy}
                  onClick={() => void handleAddAttachments()}
                >
                  파일 선택
                </button>
              </div>
              {attachments.length > 0 && (
                <ul className="m-0 list-none space-y-1 p-0">
                  {attachments.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 rounded border border-gcal-border-light bg-gcal-page px-2 py-1.5"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-gcal-heading hover:underline"
                        title="첨부 파일 열기"
                        onClick={() => void handleOpenAttachment(item.id)}
                      >
                        {item.name || '(파일)'}
                        {item.size != null ? (
                          <span className="ml-1.5 text-xs text-gcal-muted">{formatFileSize(item.size)}</span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-[#c5221f] hover:bg-[#fce8e6] disabled:opacity-40"
                        disabled={attachBusy}
                        onClick={() => void handleRemoveAttachment(item.id)}
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <label className="mb-1 flex flex-col gap-1.5 text-sm text-gcal-muted">
            설명
            <textarea
              className={fieldClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="설명 추가"
              rows={5}
            />
          </label>
        </div>
      </form>
      </InteractionUI>
    </div>
  );
}

function cnField(...parts) {
  return parts.filter(Boolean).join(' ');
}

export default EventEditor
