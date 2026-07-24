import { useMemo, useState, type ReactElement } from 'react'
import { sortCalendarsByOrder } from '../../../shared/calendarOrder'
import type { CalendarRecord } from '../../../shared/calendarTypes'
import { cn } from '../lib/cn'

function EyeIcon({ open }: { open: boolean }): ReactElement {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
      />
    </svg>
  )
}

function isSharedCalendar(calendar: CalendarRecord): boolean {
  return calendar.owner === 'shared'
}

function calendarOwnerLoginId(calendar: CalendarRecord): string {
  return String(calendar?.ownerLoginId ?? '').trim()
}

function isMemberCalendar(calendar: CalendarRecord, currentLoginId: string): boolean {
  if (isSharedCalendar(calendar)) return false
  const owner = calendarOwnerLoginId(calendar)
  if (!owner) return false
  const me = String(currentLoginId ?? '').trim()
  if (!me) return true
  return owner.toLowerCase() !== me.toLowerCase()
}

function isCalendarVisible(calendar: CalendarRecord): boolean {
  return calendar.visible !== false
}

export type MemberCalendarsPanelProps = {
  calendars: CalendarRecord[]
  currentLoginId: string
  onOpenCalendarSettings: (id: string) => void
  onToggleCalendarVisibility: (id: string) => void
}

export function MemberCalendarsPanel({
  calendars,
  currentLoginId,
  onOpenCalendarSettings,
  onToggleCalendarVisibility
}: MemberCalendarsPanelProps): ReactElement {
  const [memberSearchQuery, setMemberSearchQuery] = useState('')

  const groups = useMemo(() => {
    const memberCalendars = calendars.filter((calendar) =>
      isMemberCalendar(calendar, currentLoginId)
    )
    const byOwner = new Map<string, CalendarRecord[]>()
    for (const calendar of memberCalendars) {
      const owner = calendarOwnerLoginId(calendar)
      const list = byOwner.get(owner) ?? []
      list.push(calendar)
      byOwner.set(owner, list)
    }
    return Array.from(byOwner.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'ko'))
      .map(([ownerLoginId, items]) => ({
        ownerLoginId,
        calendars: sortCalendarsByOrder(items)
      }))
  }, [calendars, currentLoginId])

  const filteredGroups = useMemo(() => {
    const q = memberSearchQuery.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((group) => group.ownerLoginId.toLowerCase().includes(q))
  }, [groups, memberSearchQuery])

  return (
    <div className="w-full max-w-full text-left">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-normal text-gcal-heading">회원 캘린더 관리</h2>
          <p className="mt-1 text-sm text-gcal-muted">
            회원별 캘린더를 확인하고 표시 여부를 설정합니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="search"
            className="h-9 w-52 rounded-lg border border-gcal-border bg-gcal-input px-3 text-sm text-gcal-heading outline-none focus:border-gcal-blue focus:ring-2 focus:ring-gcal-blue/15"
            value={memberSearchQuery}
            onChange={(event) => setMemberSearchQuery(event.target.value)}
            placeholder="멤버명 검색"
            aria-label="멤버명 검색"
          />
          {memberSearchQuery ? (
            <button
              type="button"
              className="h-9 rounded-lg border border-gcal-border px-2.5 text-xs text-gcal-muted hover:bg-gcal-surface-2"
              onClick={() => setMemberSearchQuery('')}
            >
              초기화
            </button>
          ) : null}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gcal-border px-4 py-6 text-sm text-gcal-muted">
          표시할 회원 캘린더가 없습니다.
        </p>
      ) : filteredGroups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gcal-border px-4 py-6 text-sm text-gcal-muted">
          검색 결과가 없습니다.
        </p>
      ) : (
        <ul className="m-0 list-none space-y-5 p-0">
          {filteredGroups.map((group) => (
            <li key={group.ownerLoginId}>
              <h3 className="mb-2 text-sm font-medium text-gcal-heading">{group.ownerLoginId}</h3>
              <ul className="m-0 list-none divide-y divide-gcal-border-light overflow-hidden rounded-lg border border-gcal-border-light p-0">
                {group.calendars.map((calendar) => {
                  const isVisible = isCalendarVisible(calendar)
                  return (
                    <li
                      key={calendar.id}
                      className={cn(
                        'flex items-center justify-between gap-3 bg-gcal-surface px-3 py-2.5',
                        !isVisible && 'opacity-60'
                      )}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent p-0 text-left hover:text-gcal-blue"
                        onClick={() => onOpenCalendarSettings(calendar.id)}
                      >
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
                          style={{ background: calendar.color ?? '#039be5' }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 truncate text-sm text-gcal-heading">
                          {calendar.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-gcal-muted transition-colors hover:bg-gcal-surface-2 hover:text-gcal-heading"
                        aria-label={isVisible ? '캘린더 숨기기' : '캘린더 보이기'}
                        onClick={(event) => {
                          event.stopPropagation()
                          onToggleCalendarVisibility(calendar.id)
                        }}
                      >
                        <EyeIcon open={isVisible} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
