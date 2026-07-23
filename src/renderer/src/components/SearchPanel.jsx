import { useEffect, useMemo, useRef, useState } from 'react';
import { getEventLinks } from '../../shared/eventLinks.js';
import { getSeriesId } from '../../shared/eventOccurrences.js';
import { formatTime24, isTimedEvent } from '../lib/eventFormat.js';
import { openEventAttachment } from '../lib/api.js';
import { openExternalUrl } from '../lib/openExternal.js';
import {
  SEARCH_PAGE_SIZE_OPTIONS,
  buildSearchPageItems,
  dateFromDateKey,
  formatSearchResultDate,
  getDefaultSearchRange,
  normalizeSearchRange,
  searchCalendarEvents,
  toDateKey,
} from '../lib/searchEvents.js';
import { cn } from '../lib/cn.js';
import DateInput from './DateInput.jsx';

const PAGE_SIZE_OPTIONS = SEARCH_PAGE_SIZE_OPTIONS;

const pagerBtnClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-full text-gcal-muted transition-colors hover:bg-gcal-surface-2 hover:text-gcal-heading disabled:pointer-events-none disabled:opacity-35';

const rangeBtnClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-full text-gcal-muted transition-colors hover:bg-gcal-page hover:text-gcal-heading';

/** @param {string} dateKey @param {number} yearDelta */
function shiftDateKeyByYears(dateKey, yearDelta) {
  const date = dateFromDateKey(dateKey);
  if (Number.isNaN(date.getTime())) return dateKey;
  date.setFullYear(date.getFullYear() + yearDelta);
  return toDateKey(date);
}

function FirstPageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M18.41 16.59 13.82 12l4.59-4.59L17 6l-6 6 6 6 1.41-1.41zM6 6h2v12H6V6z" />
    </svg>
  );
}

function PrevPageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12l4.58-4.59z" />
    </svg>
  );
}

function NextPageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" />
    </svg>
  );
}

function LastPageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M5.59 7.41 10.18 12l-4.59 4.59L7 18l6-6-6-6-1.41 1.41zM16 6h2v12h-2V6z" />
    </svg>
  );
}

function PrevYearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.59 18 19 16.59 14.42 12 19 7.41 17.59 6l-6 6 6 6zM11.59 18 13 16.59 8.42 12 13 7.41 11.59 6l-6 6 6 6z"
      />
    </svg>
  );
}

function NextYearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.41 6 5 7.41 9.58 12 5 16.59 6.41 18l6-6-6-6zM12.41 6 11 7.41 15.58 12 11 16.59 12.41 18l6-6-6-6z"
      />
    </svg>
  );
}

function DefaultRangeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
      />
    </svg>
  );
}

function LinkGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
      />
    </svg>
  );
}

function AttachGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.5 6.5v10.25a4.25 4.25 0 0 1-8.5 0V6.75a2.75 2.75 0 0 1 5.5 0v9.5a1.25 1.25 0 0 1-2.5 0V7.5H9.5v8.75a2.75 2.75 0 0 0 5.5 0V6.75a4.25 4.25 0 0 0-8.5 0v10a5.75 5.75 0 0 0 11.5 0V6.5h-1.5z"
      />
    </svg>
  );
}

function CompletedGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
      />
    </svg>
  );
}

function IncompleteGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
      />
    </svg>
  );
}

/**
 * @param {{ completed: boolean }} props
 */
function StatusPill({ completed }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 min-w-[4.25rem] items-center justify-center rounded-full border px-2.5 text-xs font-medium',
        completed
          ? 'border-emerald-500/70 text-emerald-600'
          : 'border-gcal-border text-gcal-muted',
      )}
    >
      {completed ? '완료' : '미완료'}
    </span>
  );
}

/**
 * Icon + optional count badge. Empty → dash.
 * @param {{
 *   kind: 'link' | 'attach',
 *   count: number,
 *   onOpen: () => void,
 * }} props
 */
function CountIconButton({ kind, count, onOpen }) {
  if (count <= 0) {
    return (
      <span className="inline-flex h-8 w-9 items-center justify-center text-sm text-gcal-muted" aria-hidden="true">
        –
      </span>
    );
  }

  const label = kind === 'link'
    ? `링크 ${count}개 — 클릭하여 목록 보기`
    : `첨부파일 ${count}개 — 클릭하여 목록 보기`;

  return (
    <button
      type="button"
      className={cn(
        'relative inline-flex h-8 w-9 items-center justify-center rounded-lg transition-colors',
        kind === 'link'
          ? 'text-sky-600 hover:bg-sky-50'
          : 'text-sky-500 hover:bg-sky-50',
      )}
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {kind === 'link' ? <LinkGlyph /> : <AttachGlyph />}
      {count >= 1 && (
        <span
          className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] font-semibold leading-none text-white"
          aria-hidden="true"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

/**
 * Detail list for links or attachments.
 * @param {{
 *   detail: { type: 'links' | 'attachments', event: object } | null,
 *   onClose: () => void,
 * }} props
 */
function SearchResourceDetail({ detail, onClose }) {
  if (!detail) return null;

  const { type, event } = detail;
  const isLinks = type === 'links';
  const links = getEventLinks(event);
  const attachments = Array.isArray(event.attachments) ? event.attachments : [];
  const items = isLinks ? links : attachments;
  const eventId = getSeriesId(event) || event?.id;
  const title = isLinks ? '링크 목록' : '첨부파일 목록';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/25 px-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="shell-solid-surface w-full max-w-md overflow-hidden rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gcal-border-light px-4 py-3">
          <h2 className="text-sm font-semibold text-gcal-heading">
            {title}
            <span className="ml-1.5 font-normal text-gcal-muted">
              ({items.length})
            </span>
          </h2>
          <button
            type="button"
            className="rounded-full px-2.5 py-1 text-sm font-medium text-gcal-blue transition-colors hover:bg-gcal-blue-soft"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
        <ul className="settings-scroll max-h-[min(50vh,360px)] space-y-1.5 overflow-y-auto p-3">
          {items.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-gcal-muted">항목이 없습니다.</li>
          )}
          {isLinks
            ? links.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 rounded-lg border border-gcal-border-light bg-gcal-page px-3 py-2.5 text-left transition-colors hover:bg-gcal-surface"
                  onClick={() => void openExternalUrl(item.url)}
                >
                  <LinkGlyph className="mt-0.5 shrink-0 text-sky-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gcal-heading">
                      {item.title || item.url}
                    </span>
                    {item.title ? (
                      <span className="mt-0.5 block truncate text-xs text-gcal-muted">{item.url}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))
            : attachments.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-gcal-border-light bg-gcal-page px-3 py-2.5 text-left transition-colors hover:bg-gcal-surface disabled:opacity-50"
                  disabled={!eventId || !item?.id}
                  onClick={() => {
                    if (!eventId || !item?.id) return;
                    void openEventAttachment(eventId, item.id);
                  }}
                >
                  <AttachGlyph className="shrink-0 text-sky-500" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gcal-heading">
                    {item.name || item.fileName || item.path || '(파일)'}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

function SearchResultLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-gcal-border-light bg-gcal-surface-2 px-4 py-2.5 text-[11px] text-gcal-muted">
      <span className="inline-flex items-center gap-1">
        <CompletedGlyph />
        완료
      </span>
      <span className="inline-flex items-center gap-1">
        <IncompleteGlyph />
        미완료
      </span>
      <span className="inline-flex items-center gap-1 text-sky-500">
        <AttachGlyph />
        첨부파일 있음
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="w-3 text-center">–</span>
        첨부파일 없음
      </span>
      <span className="inline-flex items-center gap-1 text-sky-600">
        <LinkGlyph />
        링크 있음
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="w-3 text-center">–</span>
        링크 없음
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-sky-600 px-1 text-[9px] font-semibold text-white">
          N
        </span>
        숫자: 개수 표시
      </span>
    </div>
  );
}

/**
 * Google Calendar-style event search overlay.
 *
 * @param {{
 *   open: boolean,
 *   events: object[],
 *   calendars: object[],
 *   tags?: object[],
 *   onClose: () => void,
 *   onSelectResult: (payload: { event: object, date: Date, dayKey: string }) => void,
 * }} props
 */
export default function SearchPanel({ open, events, calendars, tags = [], onClose, onSelectResult }) {
  const [query, setQuery] = useState('');
  const [rangeStart, setRangeStart] = useState(() => getDefaultSearchRange().start);
  const [rangeEnd, setRangeEnd] = useState(() => getDefaultSearchRange().end);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  /** @type {[null | { type: 'links' | 'attachments', event: object }, Function]} */
  const [resourceDetail, setResourceDetail] = useState(null);
  const inputRef = useRef(null);
  const calendarById = useMemo(
    () => new Map((calendars ?? []).map((calendar) => [calendar.id, calendar])),
    [calendars],
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
      setPage(1);
      setResourceDetail(null);
      return undefined;
    }
    const defaults = getDefaultSearchRange();
    setRangeStart(defaults.start);
    setRangeEnd(defaults.end);
    setPage(1);
    setResourceDetail(null);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (resourceDetail) {
          setResourceDetail(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, resourceDetail]);

  const range = useMemo(
    () => normalizeSearchRange(rangeStart, rangeEnd),
    [rangeStart, rangeEnd],
  );

  const allResults = useMemo(() => {
    if (!open) return [];
    return searchCalendarEvents({
      query,
      events,
      calendars,
      tags,
      rangeStart: range.start,
      rangeEnd: range.end,
    });
  }, [open, query, events, calendars, tags, range.start, range.end]);

  const total = allResults.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageItems = useMemo(
    () => buildSearchPageItems(safePage, totalPages),
    [safePage, totalPages],
  );

  const pageResults = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return allResults.slice(start, start + pageSize);
  }, [allResults, safePage, pageSize]);

  if (!open) return null;

  const trimmed = query.trim();

  const resetRange = () => {
    const defaults = getDefaultSearchRange();
    setRangeStart(defaults.start);
    setRangeEnd(defaults.end);
    setPage(1);
  };

  const shiftRangeByYears = (yearDelta) => {
    const next = normalizeSearchRange(
      shiftDateKeyByYears(rangeStart, yearDelta),
      shiftDateKeyByYears(rangeEnd, yearDelta),
    );
    setRangeStart(next.start);
    setRangeEnd(next.end);
    setPage(1);
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex flex-col"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="mx-auto mt-3 w-full max-w-[880px] px-3 sm:mt-6 sm:px-4"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="일정 검색"
      >
        <div className="shell-solid-surface overflow-hidden rounded-2xl shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-2 border-b border-gcal-border-light px-3 py-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center text-gcal-muted" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path
                  fill="currentColor"
                  d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C8.01 14 6 11.99 6 9.5S8.01 5 10.5 5 15 7.01 15 9.5 12.99 14 10.5 14z"
                />
              </svg>
            </span>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="검색어 입력"
              className="min-w-0 flex-1 border-0 bg-transparent py-2 text-base text-gcal-heading outline-none placeholder:text-gcal-muted"
              aria-label="검색어 입력"
            />
            {trimmed && (
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gcal-muted transition-colors hover:bg-gcal-surface-2 hover:text-gcal-heading"
                onClick={() => {
                  setQuery('');
                  setPage(1);
                }}
                aria-label="검색어 지우기"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
                  />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-gcal-blue transition-colors hover:bg-gcal-blue-soft"
              onClick={onClose}
            >
              닫기
            </button>
          </div>

          <div className="flex items-center gap-2 border-b border-gcal-border-light bg-gcal-surface-2 px-3 py-2.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pl-[10px]">
              <label className="flex min-w-0 items-center gap-1.5 text-xs text-gcal-muted">
                <span className="shrink-0">기간</span>
                <DateInput
                  value={rangeStart}
                  onChange={(next) => {
                    setRangeStart(next);
                    setPage(1);
                  }}
                  className="h-8 rounded-lg border border-gcal-border bg-gcal-input text-sm text-gcal-heading outline-none focus-within:border-gcal-blue"
                  aria-label="검색 시작일"
                />
                <span aria-hidden="true">~</span>
                <DateInput
                  value={rangeEnd}
                  onChange={(next) => {
                    setRangeEnd(next);
                    setPage(1);
                  }}
                  className="h-8 rounded-lg border border-gcal-border bg-gcal-input text-sm text-gcal-heading outline-none focus-within:border-gcal-blue"
                  aria-label="검색 종료일"
                />
              </label>
              <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="검색 기간 이동">
                <button
                  type="button"
                  className={rangeBtnClass}
                  onClick={() => shiftRangeByYears(-1)}
                  aria-label="1년 이전"
                  title="1년 이전"
                >
                  <PrevYearIcon />
                </button>
                <button
                  type="button"
                  className={rangeBtnClass}
                  onClick={resetRange}
                  aria-label="기본 기간 (±1년)"
                  title="기본 기간 (±1년)"
                >
                  <DefaultRangeIcon />
                </button>
                <button
                  type="button"
                  className={rangeBtnClass}
                  onClick={() => shiftRangeByYears(1)}
                  aria-label="1년 이후"
                  title="1년 이후"
                >
                  <NextYearIcon />
                </button>
              </div>
            </div>
            <label className="flex shrink-0 items-center gap-1.5 px-3 text-xs text-gcal-muted">
              <span className="shrink-0">페이지당</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value) || 20);
                  setPage(1);
                }}
                className="h-8 rounded-lg border border-gcal-border bg-gcal-input px-2 text-sm text-gcal-heading outline-none focus:border-gcal-blue"
                aria-label="페이지당 결과 수"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="settings-scroll max-h-[min(70vh,560px)] overflow-y-auto">
            {!trimmed && (
              <p className="px-5 py-8 text-center text-sm text-gcal-muted">
                제목, 설명, 위치, 캘린더, 태그, 바로가기, 첨부파일 이름으로 검색합니다.
                <br />
                기본 기간은 오늘 기준 앞뒤 1년이며, 위에서 바꿀 수 있습니다.
              </p>
            )}

            {trimmed && total === 0 && (
              <p className="px-5 py-8 text-center text-sm text-gcal-muted">
                “{trimmed}”에 대한 결과가 없습니다.
              </p>
            )}

            {trimmed && total > 0 && (
              <>
                <p className="border-b border-gcal-border-light px-4 py-2 text-xs text-gcal-muted">
                  전체 {total.toLocaleString('ko-KR')}건
                  {totalPages > 1 ? ` · ${safePage} / ${totalPages}페이지` : ''}
                </p>

                <div
                  className="sticky top-0 z-[1] grid grid-cols-[5.5rem_5.5rem_minmax(0,1fr)] gap-2 border-b border-gcal-border-light bg-gcal-page px-4 py-2 text-[11px] font-medium text-gcal-muted"
                  aria-hidden="true"
                >
                  <span>상태</span>
                  <span>첨부/링크</span>
                  <span>일정</span>
                </div>

                <ul className="divide-y divide-gcal-border-light">
                  {pageResults.map((event) => {
                    const calendar = calendarById.get(event.calendarId);
                    const dayKey = event.occurrenceDate ?? event.startDate;
                    const color = calendar?.color ?? event.color ?? '#039be5';
                    const timeLabel = isTimedEvent(event) ? formatTime24(event.startTime) : '종일';
                    const links = getEventLinks(event);
                    const attachments = Array.isArray(event.attachments) ? event.attachments : [];
                    const completed = Boolean(event.completed);
                    const description = String(event.description ?? '').trim();
                    const rowKey = `${event.id}-${dayKey}`;

                    return (
                      <li key={rowKey} className="grid grid-cols-[5.5rem_5.5rem_minmax(0,1fr)] items-start gap-2 px-4 py-3">
                        <div className="pt-0.5">
                          <StatusPill completed={completed} />
                        </div>

                        <div className="flex items-center gap-0.5 pt-0.5">
                          <CountIconButton
                            kind="attach"
                            count={attachments.length}
                            onOpen={() => setResourceDetail({ type: 'attachments', event })}
                          />
                          <CountIconButton
                            kind="link"
                            count={links.length}
                            onOpen={() => setResourceDetail({ type: 'links', event })}
                          />
                        </div>

                        <button
                          type="button"
                          className={cn(
                            'min-w-0 rounded-lg px-1 py-0.5 text-left transition-colors',
                            'hover:bg-gcal-surface focus:bg-gcal-surface focus:outline-none',
                          )}
                          onClick={() => {
                            onSelectResult({
                              event,
                              date: dateFromDateKey(dayKey),
                              dayKey,
                            });
                          }}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-3 w-3 shrink-0 rounded-sm"
                              style={{ background: color }}
                              aria-hidden="true"
                            />
                            <span className={cn(
                              'min-w-0 flex-1 truncate text-sm font-medium text-gcal-heading',
                              completed && 'line-through opacity-70',
                            )}
                            >
                              {event.title || '(제목 없음)'}
                            </span>
                          </span>
                          <span className="mt-0.5 block pl-5 text-xs text-gcal-muted">
                            {formatSearchResultDate(dayKey)}
                            {' · '}
                            {timeLabel}
                            {calendar?.name ? ` · ${calendar.name}` : ''}
                          </span>
                          {description ? (
                            <span className="mt-1 block pl-5 text-xs leading-relaxed text-gcal-muted line-clamp-2">
                              {description}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {totalPages > 1 && (
                  <nav
                    className="flex flex-wrap items-center justify-center gap-0.5 border-t border-gcal-border-light px-2 py-2.5"
                    aria-label="검색 결과 페이지"
                  >
                    <button
                      type="button"
                      className={pagerBtnClass}
                      disabled={safePage <= 1}
                      onClick={() => setPage(1)}
                      aria-label="맨 처음"
                      title="맨 처음"
                    >
                      <FirstPageIcon />
                    </button>
                    <button
                      type="button"
                      className={pagerBtnClass}
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="이전"
                      title="이전"
                    >
                      <PrevPageIcon />
                    </button>

                    {pageItems.map((item, index) => (
                      item === 'ellipsis' ? (
                        <span
                          key={`e-${index}`}
                          className="inline-flex h-8 min-w-[1.5rem] items-center justify-center px-1 text-sm text-gcal-muted"
                          aria-hidden="true"
                        >
                          …
                        </span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          className={cn(
                            'inline-flex h-8 min-w-[2rem] items-center justify-center rounded-full px-2 text-sm font-medium transition-colors',
                            item === safePage
                              ? 'bg-gcal-blue text-white'
                              : 'text-gcal-heading hover:bg-gcal-surface-2',
                          )}
                          aria-label={`${item}페이지`}
                          aria-current={item === safePage ? 'page' : undefined}
                          onClick={() => setPage(item)}
                        >
                          {item}
                        </button>
                      )
                    ))}

                    <button
                      type="button"
                      className={pagerBtnClass}
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="다음"
                      title="다음"
                    >
                      <NextPageIcon />
                    </button>
                    <button
                      type="button"
                      className={pagerBtnClass}
                      disabled={safePage >= totalPages}
                      onClick={() => setPage(totalPages)}
                      aria-label="맨 끝"
                      title="맨 끝"
                    >
                      <LastPageIcon />
                    </button>
                  </nav>
                )}

                <SearchResultLegend />
              </>
            )}
          </div>
        </div>
      </div>

      <SearchResourceDetail
        detail={resourceDetail}
        onClose={() => setResourceDetail(null)}
      />
    </div>
  );
}
