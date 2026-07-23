import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement
} from 'react'
import { InteractionUI } from './InteractionUI'
import { MembersPanel } from './MembersPanel'
import { CalendarColorPalette } from './CalendarColorPalette'
import { getDefaultCalendarColor } from '../../../shared/calendarColorPalette'
import { HOLIDAYS_KR_CALENDAR_ID, PRIMARY_CALENDAR_ID } from '../../../shared/calendarDefaults'
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
  TagRecord,
  ViewOptions
} from '../../../shared/calendarTypes'
import type { AppSettings, AuthUser } from '../../../shared/ipc'
import {
  applyAccentColor,
  applyColorScheme,
  getColorScheme,
  normalizeAccentColor,
  normalizeColorScheme,
  type ColorScheme
} from '../lib/colorScheme'

type SettingsSection =
  | 'general'
  | 'add-calendar'
  | 'import-export'
  | 'tags'
  | 'security'
  | 'members'
  | 'member-calendars'
  | 'holidays'
  | 'web-server'
  | 'calendar-settings'

export type SettingsPanelProps = {
  open: boolean
  settings: AppSettings | null
  store: CalendarStoreSnapshot
  user: AuthUser | null
  onClose: () => void
  onSave: (patch: Partial<AppSettings>) => void | Promise<void>
  onPatchStore: (patch: Partial<StoreSettings>) => Promise<void>
  onCreateCalendar: (
    input: Partial<CalendarRecord> & { name: string; color: string }
  ) => Promise<CalendarRecord>
  onPatchCalendar: (id: string, patch: Partial<CalendarRecord>) => Promise<CalendarRecord>
  onDeleteCalendar: (id: string) => Promise<void>
  onSetTags: (tags: TagRecord[]) => Promise<TagRecord[]>
  onReplaceStore: (next: CalendarStoreSnapshot) => Promise<void>
  onAddEvent: (input: EventInput) => Promise<CalendarEvent>
  onListMembers: () => Promise<MemberRecord[]>
  onSaveMembers: (members: MemberSaveInput[]) => Promise<MemberRecord[]>
  onSyncHolidays: (input?: SyncHolidaysInput) => Promise<SyncHolidaysResult>
  onRefresh: () => Promise<void>
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

function EyeIcon({ open }: { open: boolean }): ReactElement {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
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

function isMyCalendar(calendar: CalendarRecord, currentLoginId: string): boolean {
  if (isSharedCalendar(calendar)) return false
  const owner = String(calendar.ownerLoginId ?? '').trim()
  const me = currentLoginId.trim()
  if (!me) return owner.length === 0
  return owner.length === 0 || owner.toLowerCase() === me.toLowerCase()
}

function isMemberCalendar(calendar: CalendarRecord, currentLoginId: string): boolean {
  if (isSharedCalendar(calendar)) return false
  const owner = String(calendar.ownerLoginId ?? '').trim()
  if (!owner) return false
  const me = currentLoginId.trim()
  if (!me) return true
  return owner.toLowerCase() !== me.toLowerCase()
}

function NavBtn({
  active,
  children,
  onClick
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      className={cn(
        'w-full rounded-lg px-4 py-2.5 text-left text-sm font-medium transition-colors',
        active ? 'bg-gcal-blue-soft text-gcal-blue-dark' : 'text-gcal-heading hover:bg-gcal-surface'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ViewOptionsPanel({
  storeSettings,
  appSettings,
  onPatchStore,
  onSaveApp
}: {
  storeSettings: StoreSettings
  appSettings: AppSettings | null
  onPatchStore: (patch: Partial<StoreSettings>) => Promise<void>
  onSaveApp: (patch: Partial<AppSettings>) => void | Promise<void>
}): ReactElement {
  const vo = storeSettings.viewOptions
  const [showWeekNumbers, setShowWeekNumbers] = useState(vo.showWeekNumbers !== false)
  const [weekStartsOnSunday, setWeekStartsOnSunday] = useState(vo.weekStartsOnSunday !== false)
  const [roundedCorners, setRoundedCorners] = useState(Boolean(vo.roundedCorners))
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => getColorScheme(vo))
  const [accentColor, setAccentColor] = useState(() =>
    normalizeAccentColor(vo.accentColor, '#1a73e8')
  )
  const [runAtStartup, setRunAtStartup] = useState(Boolean(vo.runAtStartup))
  const [headerOpacity, setHeaderOpacity] = useState(
    appSettings?.headerOpacity ?? storeSettings.headerOpacity
  )
  const [shellOpacity, setShellOpacity] = useState(
    appSettings?.shellOpacity ?? storeSettings.shellOpacity
  )
  const [ownerName, setOwnerName] = useState(storeSettings.ownerName ?? '')
  const [dataRoot, setDataRoot] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setShowWeekNumbers(vo.showWeekNumbers !== false)
    setWeekStartsOnSunday(vo.weekStartsOnSunday !== false)
    setRoundedCorners(Boolean(vo.roundedCorners))
    setColorScheme(getColorScheme(vo))
    setAccentColor(normalizeAccentColor(vo.accentColor, '#1a73e8'))
    setRunAtStartup(Boolean(vo.runAtStartup))
    setHeaderOpacity(appSettings?.headerOpacity ?? storeSettings.headerOpacity)
    setShellOpacity(appSettings?.shellOpacity ?? storeSettings.shellOpacity)
    setOwnerName(storeSettings.ownerName ?? '')
    void window.neoCalendar.getDataRoot().then(setDataRoot)
    applyColorScheme(getColorScheme(vo))
    applyAccentColor(normalizeAccentColor(vo.accentColor, '#1a73e8'))
  }, [vo, appSettings, storeSettings])

  const persistView = async (patch: Partial<ViewOptions>): Promise<void> => {
    const next: ViewOptions = {
      ...storeSettings.viewOptions,
      showWeekNumbers,
      weekStartsOnSunday,
      roundedCorners,
      colorScheme,
      accentColor,
      runAtStartup,
      ...patch
    }
    await onPatchStore({ viewOptions: next })
    await onSaveApp({
      weekStartsOn: next.weekStartsOnSunday ? 0 : 1
    })
    setSaved(true)
  }

  return (
    <div className="w-full max-w-full text-left">
      <h2 className="mb-8 text-[22px] font-normal text-gcal-heading">보기 옵션</h2>
      <div className="space-y-4">
        <label className="flex items-center gap-2.5 text-sm text-gcal-body">
          <input
            type="checkbox"
            checked={showWeekNumbers}
            onChange={(e) => {
              setShowWeekNumbers(e.target.checked)
              void persistView({ showWeekNumbers: e.target.checked })
            }}
          />
          몇 번째 주인지 표시
        </label>
        <label className="flex items-center gap-2.5 text-sm text-gcal-body">
          <input
            type="checkbox"
            checked={weekStartsOnSunday}
            onChange={(e) => {
              setWeekStartsOnSunday(e.target.checked)
              void persistView({ weekStartsOnSunday: e.target.checked })
            }}
          />
          <span>
            1주일 시작일을 일요일로 하기
            <span className="text-gcal-muted"> (체크 해제 시 1주일 시작일이 월요일로 설정됨)</span>
          </span>
        </label>
        <label className="flex items-center gap-2.5 text-sm text-gcal-body">
          <input
            type="checkbox"
            checked={roundedCorners}
            onChange={(e) => {
              setRoundedCorners(e.target.checked)
              void persistView({ roundedCorners: e.target.checked })
            }}
          />
          <span>
            둥근 모서리
            <span className="text-gcal-muted"> (체크 해제 시 네모난 모서리)</span>
          </span>
        </label>
      </div>

      <fieldset className="mt-8 space-y-3 border-0 p-0">
        <legend className="mb-8 text-[22px] font-normal text-gcal-heading">테마</legend>
        {(
          [
            ['light', '라이트 모드'],
            ['dark', '다크 모드'],
            ['system', '시스템 설정']
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2.5 text-sm text-gcal-body">
            <input
              type="radio"
              name="colorScheme"
              checked={colorScheme === value}
              onChange={() => {
                const next = normalizeColorScheme(value)
                setColorScheme(next)
                applyColorScheme(next)
                void persistView({ colorScheme: next })
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <fieldset className="mt-8 border-0 p-0">
        <legend className="mb-3 text-[22px] font-normal text-gcal-heading">테마 색상</legend>
        <p className="mb-4 text-sm text-gcal-muted">
          버튼, 강조 표시, 선택된 날짜에 적용되는 강조 색상입니다. 라이트/다크 모드와 별개로 선택할 수
          있어요.
        </p>
        <CalendarColorPalette
          value={accentColor}
          onChange={(color) => {
            const next = normalizeAccentColor(color)
            setAccentColor(next)
            applyAccentColor(next)
            void persistView({ accentColor: next })
          }}
        />
      </fieldset>

      <div className="mt-8">
        <h3 className="mb-8 text-[22px] font-normal text-gcal-heading">프로그램 시작시 실행 모드</h3>
        <label className="flex items-center gap-2.5 text-sm text-gcal-body">
          <input
            type="checkbox"
            checked={runAtStartup}
            onChange={(e) => {
              setRunAtStartup(e.target.checked)
              void persistView({ runAtStartup: e.target.checked })
            }}
          />
          컴퓨터 시작시 자동 실행
        </label>
      </div>

      <div className="mt-8">
        <h3 className="mb-4 text-[22px] font-normal text-gcal-heading">Neo 투명도</h3>
        <label className="mb-4 block text-sm text-gcal-body">
          <span className="mb-1 block text-xs text-gcal-muted">소유자 이름</span>
          <input
            className="w-full rounded-lg border border-gcal-border bg-gcal-input px-4 py-3 text-gcal-heading outline-none"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            onBlur={() => void onPatchStore({ ownerName })}
          />
        </label>
        <label className="mb-4 block text-sm text-gcal-body">
          <span className="mb-1 block text-xs text-gcal-muted">
            헤더 불투명도 ({Math.round(headerOpacity * 100)}%)
          </span>
          <input
            type="range"
            className="w-full"
            min={0.15}
            max={1}
            step={0.01}
            value={headerOpacity}
            onChange={(e) => {
              const next = Number(e.target.value)
              setHeaderOpacity(next)
              document.documentElement.style.setProperty('--neo-header-opacity', String(next))
            }}
            onMouseUp={(e) => {
              const next = Number((e.target as HTMLInputElement).value)
              setHeaderOpacity(next)
              void onSaveApp({ headerOpacity: next })
              void onPatchStore({ headerOpacity: next })
            }}
          />
        </label>
        <label className="mb-4 block text-sm text-gcal-body">
          <span className="mb-1 block text-xs text-gcal-muted">
            캘린더 불투명도 ({Math.round(shellOpacity * 100)}%)
          </span>
          <input
            type="range"
            className="w-full"
            min={0.15}
            max={1}
            step={0.01}
            value={shellOpacity}
            onChange={(e) => {
              const next = Number(e.target.value)
              setShellOpacity(next)
              document.documentElement.style.setProperty('--neo-shell-opacity', String(next))
            }}
            onMouseUp={(e) => {
              const next = Number((e.target as HTMLInputElement).value)
              setShellOpacity(next)
              void onSaveApp({ shellOpacity: next })
              void onPatchStore({ shellOpacity: next })
            }}
          />
        </label>
        <p className="text-sm text-gcal-muted">데이터 폴더: {dataRoot || '…'}</p>
      </div>

      {saved ? <p className="mt-4 text-sm text-gcal-green">저장되었습니다.</p> : null}
    </div>
  )
}

function CalendarNavRow({
  calendar,
  active,
  onOpen,
  onToggleVisible
}: {
  calendar: CalendarRecord
  active: boolean
  onOpen: () => void
  onToggleVisible: () => void
}): ReactElement {
  const visible = calendar.visible !== false
  return (
    <div
      className={cn(
        'flex items-center gap-0.5 rounded-lg',
        active && 'bg-gcal-blue-soft'
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 px-4 py-2 text-left text-sm text-gcal-heading"
        onClick={onOpen}
      >
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-sm"
          style={{ background: calendar.color }}
        />
        <span className="truncate">{calendar.name}</span>
      </button>
      <button
        type="button"
        className="mr-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-gcal-muted hover:bg-gcal-surface hover:text-gcal-heading"
        title={visible ? '숨기기' : '보이기'}
        aria-label={visible ? '숨기기' : '보이기'}
        onClick={(e) => {
          e.stopPropagation()
          onToggleVisible()
        }}
      >
        <EyeIcon open={visible} />
      </button>
    </div>
  )
}

export function SettingsPanel({
  open,
  settings,
  store,
  user,
  onClose,
  onSave,
  onPatchStore,
  onCreateCalendar,
  onPatchCalendar,
  onDeleteCalendar,
  onSetTags,
  onReplaceStore,
  onAddEvent,
  onListMembers,
  onSaveMembers,
  onSyncHolidays,
  onRefresh
}: SettingsPanelProps): ReactElement | null {
  const [section, setSection] = useState<SettingsSection>('general')
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [newCalName, setNewCalName] = useState('')
  const [newCalDesc, setNewCalDesc] = useState('')
  const [newCalColor, setNewCalColor] = useState(() => getDefaultCalendarColor(0))
  const [tagDrafts, setTagDrafts] = useState<TagRecord[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#039be5')
  const [cidrText, setCidrText] = useState('')
  const [cidrDesc, setCidrDesc] = useState('')
  const [holidayKey, setHolidayKey] = useState('')
  const [rememberHolidayKey, setRememberHolidayKey] = useState(false)
  const [holidaySyncBusy, setHolidaySyncBusy] = useState(false)
  const [calEdit, setCalEdit] = useState({ name: '', description: '', color: '#f6bf26' })

  const currentLoginId = user?.loginId ?? ''
  const isSuperAdmin = Boolean(user)

  const myCalendars = useMemo(
    () => store.calendars.filter((c) => isMyCalendar(c, currentLoginId)),
    [store.calendars, currentLoginId]
  )
  const sharedCalendars = useMemo(
    () => store.calendars.filter((c) => isSharedCalendar(c)),
    [store.calendars]
  )
  const memberCalendars = useMemo(
    () => store.calendars.filter((c) => isMemberCalendar(c, currentLoginId)),
    [store.calendars, currentLoginId]
  )

  useEffect(() => {
    if (!open) return
    setSection('general')
    setSelectedCalendarId(null)
    setMessage('')
    setTagDrafts(store.tags.map((t) => ({ ...t })))
    setHolidayKey(store.settings.holidaysKr.serviceKey ?? '')
    setRememberHolidayKey(Boolean(store.settings.holidaysKr.rememberKey))
    setNewCalColor(getDefaultCalendarColor(store.calendars.length))
  }, [open])

  useEffect(() => {
    if (!open) return
    setHolidayKey(store.settings.holidaysKr.serviceKey ?? '')
    setRememberHolidayKey(Boolean(store.settings.holidaysKr.rememberKey))
  }, [open, store.settings.holidaysKr.serviceKey, store.settings.holidaysKr.rememberKey])

  useEffect(() => {
    if (!isSuperAdmin && ['import-export', 'security', 'members', 'member-calendars', 'holidays'].includes(section)) {
      setSection('general')
    }
  }, [isSuperAdmin, section])

  useEffect(() => {
    if (section !== 'calendar-settings' || !selectedCalendarId) return
    const cal = store.calendars.find((c) => c.id === selectedCalendarId)
    if (!cal) return
    setCalEdit({
      name: cal.name,
      description: cal.description ?? '',
      color: cal.color
    })
  }, [section, selectedCalendarId, store.calendars])

  /** Keep settings below AppChrome; fill remaining window height (MDC). */
  const measureChromeOffset = (): number => {
    let bottom = 0
    for (const role of ['header-actions', 'titlebar', 'header']) {
      const el = document.querySelector(`[data-shell-chrome="${role}"]`)
      if (!el) continue
      bottom = Math.max(bottom, el.getBoundingClientRect().bottom)
    }
    return Math.max(0, Math.ceil(bottom))
  }

  const overlayRef = useRef<HTMLDivElement | null>(null)
  const [, forceRemeasure] = useState(0)
  useEffect(() => {
    if (!open) return undefined
    const onResize = (): void => forceRemeasure((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])
  const chromeOffset = open ? measureChromeOffset() : 0

  // Trap wheel so only `.settings-scroll` scrolls (calendar underneath stays put).
  useEffect(() => {
    if (!open) return undefined
    const root = overlayRef.current
    if (!root) return undefined

    const onWheel = (event: WheelEvent): void => {
      const scrollable =
        event.target instanceof Element ? event.target.closest('.settings-scroll') : null
      if (scrollable instanceof HTMLElement) {
        const { scrollTop, scrollHeight, clientHeight } = scrollable
        const atTop = scrollTop <= 0
        const atBottom = scrollTop + clientHeight >= scrollHeight - 1
        if (
          (event.deltaY < 0 && atTop)
          || (event.deltaY > 0 && atBottom)
          || scrollHeight <= clientHeight
        ) {
          event.preventDefault()
        }
        event.stopPropagation()
        return
      }
      event.preventDefault()
      event.stopPropagation()
    }

    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [open])

  if (!open) return null

  const openCalendarSettings = (id: string): void => {
    setSelectedCalendarId(id)
    setSection('calendar-settings')
  }

  const selectedCalendar = selectedCalendarId
    ? store.calendars.find((c) => c.id === selectedCalendarId) ?? null
    : null

  const exportJson = (): void => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `neo-calendar-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage('JSON을 내보냈습니다.')
  }

  const importJson = async (file: File): Promise<void> => {
    try {
      const parsed = JSON.parse(await file.text()) as CalendarStoreSnapshot
      if (!parsed || !Array.isArray(parsed.events) || !Array.isArray(parsed.calendars)) {
        setMessage('유효한 캘린더 JSON이 아닙니다.')
        return
      }
      if (!window.confirm('가져오면 현재 데이터가 덮어씌워집니다. 계속할까요?')) return
      await onReplaceStore({
        ...store,
        ...parsed,
        settings: { ...store.settings, ...(parsed.settings ?? {}) },
        updatedAt: new Date().toISOString()
      })
      setMessage('가져오기를 완료했습니다.')
      await onRefresh()
    } catch {
      setMessage('JSON을 읽지 못했습니다.')
    }
  }

  // Defer unmount so the same click cannot retarget to header Excel/PDF underneath (MDC).
  const requestClose = (event?: { preventDefault?: () => void; stopPropagation?: () => void }): void => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    window.setTimeout(() => onClose(), 0)
  }

  return (
    <div
      className="interaction-ui fixed inset-0 z-[55]"
      role="presentation"
      onClick={requestClose}
    >
      <div
        ref={overlayRef}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[56] flex justify-center pb-[2.5%]"
        style={{ top: chromeOffset }}
        role="presentation"
      >
        <InteractionUI
          className="shell-solid-surface settings-panel-shell pointer-events-auto relative z-[1] flex h-full max-h-full w-[min(77%,1100px)] min-h-0 overflow-hidden rounded-xl shadow-[0_8px_28px_rgba(0,0,0,0.18)]"
          role="dialog"
          aria-label="설정"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-gcal-muted transition-colors hover:bg-gcal-surface-2 hover:text-gcal-heading"
            onClick={requestClose}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label="설정 닫기"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>

          <aside
            className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-gcal-border-light py-4"
            style={{ backgroundColor: 'var(--gcal-page-solid)' }}
          >
            <nav className="settings-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-2">
              <NavBtn active={section === 'general'} onClick={() => setSection('general')}>
                일반
              </NavBtn>
              <NavBtn active={section === 'add-calendar'} onClick={() => setSection('add-calendar')}>
                새 캘린더 만들기
              </NavBtn>
              {isSuperAdmin ? (
                <NavBtn
                  active={section === 'import-export'}
                  onClick={() => setSection('import-export')}
                >
                  가져오기 / 내보내기
                </NavBtn>
              ) : null}
              <NavBtn active={section === 'tags'} onClick={() => setSection('tags')}>
                태그 관리
              </NavBtn>
              {isSuperAdmin ? (
                <>
                  <NavBtn active={section === 'security'} onClick={() => setSection('security')}>
                    보안 관리
                  </NavBtn>
                  <NavBtn active={section === 'members'} onClick={() => setSection('members')}>
                    회원 관리
                  </NavBtn>
                  <NavBtn
                    active={section === 'member-calendars'}
                    onClick={() => setSection('member-calendars')}
                  >
                    회원 캘린더 관리
                  </NavBtn>
                  <NavBtn active={section === 'holidays'} onClick={() => setSection('holidays')}>
                    대한민국의 휴일(공공데이터 API)
                  </NavBtn>
                  <NavBtn active={section === 'web-server'} onClick={() => setSection('web-server')}>
                    웹 서버
                  </NavBtn>
                </>
              ) : null}

              <div className="my-3" aria-hidden="true" />

              <p className="px-4 text-sm font-medium text-gcal-heading">내 캘린더</p>
              {myCalendars.map((cal) => (
                <CalendarNavRow
                  key={cal.id}
                  calendar={cal}
                  active={section === 'calendar-settings' && selectedCalendarId === cal.id}
                  onOpen={() => openCalendarSettings(cal.id)}
                  onToggleVisible={() =>
                    void onPatchCalendar(cal.id, { visible: cal.visible === false })
                  }
                />
              ))}

              <p className="mt-4 px-4 text-sm font-medium text-gcal-heading">고정 캘린더</p>
              {sharedCalendars.map((cal) => (
                <CalendarNavRow
                  key={cal.id}
                  calendar={cal}
                  active={section === 'calendar-settings' && selectedCalendarId === cal.id}
                  onOpen={() => openCalendarSettings(cal.id)}
                  onToggleVisible={() =>
                    void onPatchCalendar(cal.id, { visible: cal.visible === false })
                  }
                />
              ))}
            </nav>
          </aside>

          <div className="settings-scroll min-h-0 min-w-0 flex-1 overflow-y-auto px-8 py-8 pr-14 text-left md:px-10 md:pr-14">
            {message ? (
              <p className="mb-4 rounded-lg bg-gcal-green-soft px-3 py-2 text-sm text-gcal-green">
                {message}
              </p>
            ) : null}

          {section === 'general' && (
            <ViewOptionsPanel
              storeSettings={store.settings}
              appSettings={settings}
              onPatchStore={onPatchStore}
              onSaveApp={onSave}
            />
          )}

          {section === 'add-calendar' && (
            <div className="w-full max-w-full text-left">
              <h2 className="mb-8 text-[22px] font-normal text-gcal-heading">새 캘린더 만들기</h2>
              <div className="space-y-5">
                <div>
                  <span className="mb-1 block text-xs text-gcal-muted">일정 색상</span>
                  <CalendarColorPalette value={newCalColor} onChange={setNewCalColor} />
                </div>
                <div className="rounded-lg border border-gcal-border bg-gcal-input px-4 py-3 focus-within:border-gcal-blue focus-within:ring-2 focus-within:ring-gcal-blue/15">
                  <span className="mb-1 block text-xs text-gcal-muted">이름</span>
                  <input
                    className="w-full border-0 bg-transparent p-0 text-base text-gcal-heading outline-none"
                    value={newCalName}
                    onChange={(e) => setNewCalName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="rounded-lg border border-gcal-border bg-gcal-input px-4 py-3 focus-within:border-gcal-blue focus-within:ring-2 focus-within:ring-gcal-blue/15">
                  <span className="mb-1 block text-xs text-gcal-muted">설명</span>
                  <textarea
                    className="min-h-[88px] w-full resize-y border-0 bg-transparent p-0 text-base text-gcal-heading outline-none"
                    rows={3}
                    value={newCalDesc}
                    onChange={(e) => setNewCalDesc(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={!newCalName.trim() || !user}
                className="mt-8 rounded-full bg-gcal-blue px-6 py-2.5 text-sm font-medium text-white shadow-[0_1px_2px_rgba(26,115,232,0.35)] transition-colors hover:bg-[#1765cc] disabled:opacity-60"
                onClick={() => {
                  void onCreateCalendar({
                    name: newCalName.trim(),
                    description: newCalDesc.trim(),
                    color: newCalColor,
                    custom: true,
                    ownerLoginId: currentLoginId || undefined
                  }).then((created) => {
                    setNewCalName('')
                    setNewCalDesc('')
                    setNewCalColor(getDefaultCalendarColor(store.calendars.length + 1))
                    openCalendarSettings(created.id)
                  })
                }}
              >
                캘린더 만들기
              </button>
              {!user ? <p className="mt-4 text-sm text-gcal-muted">로그인 후 캘린더를 추가할 수 있습니다.</p> : null}
            </div>
          )}

          {section === 'import-export' && isSuperAdmin && (
            <div className="w-full max-w-full text-left">
              <h2 className="mb-8 text-[22px] font-normal text-gcal-heading">가져오기 / 내보내기</h2>
              <p className="mb-4 text-sm text-gcal-muted">전체 스토어 JSON을 내보내거나 가져옵니다.</p>
              <div className="panel-actions">
                <button type="button" onClick={exportJson}>
                  JSON 내보내기
                </button>
                <label className="settings-file-btn">
                  JSON 가져오기
                  <input
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void importJson(file)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          {section === 'tags' && (
            <div className="w-full max-w-full text-left">
              <h2 className="mb-8 text-[22px] font-normal text-gcal-heading">태그 관리</h2>
              <ul className="settings-tag-list">
                {tagDrafts.map((tag, index) => (
                  <li key={tag.id} className="settings-tag-row">
                    <input
                      value={tag.name}
                      onChange={(e) => {
                        const next = [...tagDrafts]
                        next[index] = { ...tag, name: e.target.value }
                        setTagDrafts(next)
                      }}
                    />
                    <input
                      type="color"
                      value={tag.color}
                      onChange={(e) => {
                        const next = [...tagDrafts]
                        next[index] = { ...tag, color: e.target.value }
                        setTagDrafts(next)
                      }}
                    />
                    <button
                      type="button"
                      className="is-danger"
                      onClick={() => setTagDrafts(tagDrafts.filter((t) => t.id !== tag.id))}
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
              <div className="settings-tag-create">
                <input
                  value={newTagName}
                  placeholder="새 태그 이름"
                  onChange={(e) => setNewTagName(e.target.value)}
                />
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newTagName.trim()) return
                    setTagDrafts([
                      ...tagDrafts,
                      {
                        id: `tag-${Date.now().toString(36)}`,
                        name: newTagName.trim(),
                        color: newTagColor,
                        sortOrder: tagDrafts.length
                      }
                    ])
                    setNewTagName('')
                  }}
                >
                  추가
                </button>
              </div>
              <div className="panel-actions">
                <button
                  type="button"
                  className="is-primary"
                  disabled={!user}
                  onClick={() => {
                    void onSetTags(tagDrafts).then(() => setMessage('태그를 저장했습니다.'))
                  }}
                >
                  저장
                </button>
              </div>
            </div>
          )}

          {section === 'security' && isSuperAdmin && (
            <div className="w-full max-w-full text-left">
              <h2 className="mb-8 text-[22px] font-normal text-gcal-heading">보안 관리</h2>
              <p className="mb-4 text-sm text-gcal-muted">
                허용 IP/CIDR은 MDC 스키마와 호환되도록 저장됩니다. Electron 빌드에서는 웹 ACL·방화벽으로
                적용되지 않습니다.
              </p>
              <label className="settings-field">
                <span>CIDR</span>
                <input
                  value={cidrText}
                  onChange={(e) => setCidrText(e.target.value)}
                  placeholder="192.168.0.0/24"
                />
              </label>
              <label className="settings-field">
                <span>설명</span>
                <input value={cidrDesc} onChange={(e) => setCidrDesc(e.target.value)} />
              </label>
              <div className="panel-actions">
                <button
                  type="button"
                  className="is-primary"
                  onClick={() => {
                    const cidr = cidrText.trim()
                    if (!cidr) return
                    void onPatchStore({
                      allowedIpCidrs: [
                        ...(store.settings.allowedIpCidrs ?? []),
                        { cidr, description: cidrDesc.trim() }
                      ]
                    }).then(() => {
                      setCidrText('')
                      setCidrDesc('')
                      setMessage('CIDR을 저장했습니다.')
                    })
                  }}
                >
                  추가
                </button>
              </div>
              <ul className="settings-cidr-list">
                {(store.settings.allowedIpCidrs ?? []).map((row, i) => (
                  <li key={`${row.cidr}-${i}`}>
                    <code>{row.cidr}</code>
                    {row.description ? ` — ${row.description}` : ''}
                    <button
                      type="button"
                      onClick={() =>
                        void onPatchStore({
                          allowedIpCidrs: (store.settings.allowedIpCidrs ?? []).filter(
                            (_, idx) => idx !== i
                          )
                        })
                      }
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {section === 'members' && isSuperAdmin && (
            <div className="w-full max-w-full text-left">
              <h2 className="mb-8 text-[22px] font-normal text-gcal-heading">회원 관리</h2>
              <MembersPanel listMembers={onListMembers} saveMembers={onSaveMembers} />
            </div>
          )}

          {section === 'member-calendars' && isSuperAdmin && (
            <div className="w-full max-w-full text-left">
              <h2 className="mb-8 text-[22px] font-normal text-gcal-heading">회원 캘린더 관리</h2>
              <p className="mb-4 text-sm text-gcal-muted">다른 회원이 소유한 개인 캘린더입니다.</p>
              {memberCalendars.length === 0 ? (
                <p className="settings-muted">표시할 회원 캘린더가 없습니다.</p>
              ) : (
                <ul className="settings-cal-list">
                  {memberCalendars.map((cal) => (
                    <li key={cal.id} className="settings-cal-row">
                      <button type="button" className="settings-link-btn" onClick={() => openCalendarSettings(cal.id)}>
                        <span className="settings-cal-swatch" style={{ background: cal.color }} />
                        {cal.name}
                        <span className="settings-muted"> · {cal.ownerLoginId}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void onPatchCalendar(cal.id, { visible: cal.visible === false })
                        }
                      >
                        {cal.visible === false ? '숨김' : '표시'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {section === 'holidays' && isSuperAdmin && (
            <div className="w-full max-w-full text-left">
              <h2 className="mb-8 text-[22px] font-normal text-gcal-heading">
                대한민국의 휴일(공공데이터 API)
              </h2>
              <p className="mb-4 text-sm text-gcal-body">
                공공데이터포털 특일 정보 API 인증키를 입력하세요. `.env`의{' '}
                <code>DATA_GO_KR_SERVICE_KEY</code>가 있으면 시작 시 자동으로 불러옵니다.
              </p>
              <label className="settings-field">
                <span>공공데이터포털 서비스 키</span>
                <input
                  value={holidayKey}
                  onChange={(e) => setHolidayKey(e.target.value)}
                  placeholder="DATA_GO_KR_SERVICE_KEY"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="mb-4 flex items-center gap-2.5 text-sm text-gcal-body">
                <input
                  type="checkbox"
                  checked={rememberHolidayKey}
                  onChange={(e) => setRememberHolidayKey(e.target.checked)}
                />
                인증키 저장
              </label>
              <p className="settings-muted mb-4">
                상태: {store.settings.holidaysKr.message || '미동기화'}
                {store.settings.holidaysKr.count
                  ? ` / ${store.settings.holidaysKr.count}건`
                  : ''}
                {store.settings.holidaysKr.lastSyncedAt
                  ? ` · ${new Date(store.settings.holidaysKr.lastSyncedAt).toLocaleString()}`
                  : ''}
              </p>
              <div className="panel-actions flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void onPatchStore({
                      holidaysKr: {
                        ...store.settings.holidaysKr,
                        serviceKey: rememberHolidayKey ? holidayKey.trim() : '',
                        rememberKey: rememberHolidayKey && Boolean(holidayKey.trim())
                      }
                    }).then(() => setMessage('공휴일 API 키를 저장했습니다.'))
                  }
                >
                  키 저장
                </button>
                <button
                  type="button"
                  className="is-primary"
                  disabled={holidaySyncBusy || !holidayKey.trim()}
                  onClick={() => {
                    const trimmed = holidayKey.trim()
                    if (!trimmed) {
                      setMessage('API 키를 입력하세요.')
                      return
                    }
                    if (!navigator.onLine) {
                      setMessage('오프라인 상태입니다. 네트워크 연결 후 다시 시도하세요.')
                      return
                    }
                    setHolidaySyncBusy(true)
                    void onSyncHolidays({
                      serviceKey: trimmed,
                      rememberKey: rememberHolidayKey
                    })
                      .then((result) => {
                        setMessage(
                          result.message
                            || `공휴일 ${result.count}건을 동기화했습니다. (${result.source})`
                        )
                      })
                      .catch((error: unknown) => {
                        setMessage(
                          error instanceof Error
                            ? error.message
                            : '공휴일 동기화에 실패했습니다.'
                        )
                      })
                      .finally(() => setHolidaySyncBusy(false))
                  }}
                >
                  {holidaySyncBusy ? '동기화 중…' : '지금 동기화'}
                </button>
              </div>
            </div>
          )}

          {section === 'web-server' && isSuperAdmin && (
            <div className="w-full max-w-full text-left opacity-85">
              <h2 className="mb-8 text-[22px] font-normal text-gcal-heading">웹 서버</h2>
              <p className="mb-4 text-sm text-gcal-body">
                Electron 빌드에서는 웹 서버(Start Server / HOSTNAME)를 지원하지 않습니다.
              </p>
              <label className="settings-field">
                <span>HOSTNAME</span>
                <input disabled value="localhost" />
              </label>
              <button type="button" disabled>
                Start Server
              </button>
              <p className="settings-muted">URL ACL·방화벽 UI도 Electron에서는 비활성입니다.</p>
            </div>
          )}

          {section === 'calendar-settings' && selectedCalendar && (
            <div className="w-full max-w-full text-left">
              <h2 className="mb-8 text-[22px] font-normal text-gcal-heading">캘린더 설정</h2>
              {selectedCalendar.id === HOLIDAYS_KR_CALENDAR_ID ? (
                <p className="mb-5 text-sm text-gcal-muted">
                  이 캘린더의 일정은 설정 → 공휴일 동기화로만 갱신됩니다.
                </p>
              ) : null}
              <div className="space-y-5">
                <div>
                  <span className="mb-1 block text-xs text-gcal-muted">일정 색상</span>
                  <CalendarColorPalette
                    value={calEdit.color}
                    disabled={selectedCalendar.id === HOLIDAYS_KR_CALENDAR_ID}
                    onChange={(color) => setCalEdit((s) => ({ ...s, color }))}
                  />
                </div>
                <div className="rounded-lg border border-gcal-border bg-gcal-input px-4 py-3">
                  <span className="mb-1 block text-xs text-gcal-muted">이름</span>
                  <input
                    className="w-full border-0 bg-transparent p-0 text-base text-gcal-heading outline-none disabled:opacity-70"
                    value={calEdit.name}
                    disabled={selectedCalendar.id === HOLIDAYS_KR_CALENDAR_ID}
                    onChange={(e) => setCalEdit((s) => ({ ...s, name: e.target.value }))}
                  />
                </div>
                <div className="rounded-lg border border-gcal-border bg-gcal-input px-4 py-3">
                  <span className="mb-1 block text-xs text-gcal-muted">설명</span>
                  <textarea
                    className="min-h-[88px] w-full resize-y border-0 bg-transparent p-0 text-base text-gcal-heading outline-none disabled:opacity-70"
                    rows={3}
                    value={calEdit.description}
                    disabled={selectedCalendar.id === HOLIDAYS_KR_CALENDAR_ID}
                    onChange={(e) => setCalEdit((s) => ({ ...s, description: e.target.value }))}
                  />
                </div>
              </div>
              <div className="cal-actions-container mt-8">
                <div className="cal-settings-actions">
                  {selectedCalendar.id !== HOLIDAYS_KR_CALENDAR_ID ? (
                    <button
                      type="button"
                      style={{ gridArea: 'save' }}
                      disabled={!calEdit.name.trim() || !user}
                      className="rounded-full bg-gcal-blue px-6 py-2.5 text-sm font-medium text-white shadow-[0_1px_2px_rgba(26,115,232,0.35)] transition-colors hover:bg-[#1765cc] disabled:opacity-60"
                      onClick={() =>
                        void onPatchCalendar(selectedCalendar.id, {
                          name: calEdit.name.trim(),
                          description: calEdit.description.trim(),
                          color: calEdit.color
                        }).then(() => setMessage('캘린더를 저장했습니다.'))
                      }
                    >
                      저장
                    </button>
                  ) : null}
                  <button
                    type="button"
                    style={{ gridArea: 'copy' }}
                    disabled={!user}
                    className="rounded-full border border-gcal-border bg-gcal-page px-6 py-2.5 text-sm font-medium text-gcal-heading transition-colors hover:bg-gcal-surface-2 disabled:opacity-60"
                    onClick={() => {
                      void (async () => {
                        const created = await onCreateCalendar({
                          name: `${selectedCalendar.name} 복사본`,
                          color: selectedCalendar.color,
                          description: selectedCalendar.description,
                          custom: true,
                          ownerLoginId: currentLoginId || undefined
                        })
                        const events = store.events.filter(
                          (e) => e.calendarId === selectedCalendar.id
                        )
                        for (const ev of events) {
                          const { id: _id, calendarId: _c, ...rest } = ev
                          await onAddEvent({
                            ...rest,
                            title: ev.title,
                            calendarId: created.id,
                            startDate: ev.startDate,
                            endDate: ev.endDate
                          })
                        }
                        openCalendarSettings(created.id)
                        setMessage('캘린더를 복사했습니다.')
                      })()
                    }}
                  >
                    복사
                  </button>
                  <button
                    type="button"
                    style={{ gridArea: 'export' }}
                    className="rounded-full border border-gcal-border bg-gcal-page px-6 py-2.5 text-sm font-medium text-gcal-blue transition-colors hover:bg-gcal-surface-2"
                    onClick={() => {
                      const payload = {
                        calendar: selectedCalendar,
                        events: store.events.filter((e) => e.calendarId === selectedCalendar.id)
                      }
                      const blob = new Blob([JSON.stringify(payload, null, 2)], {
                        type: 'application/json'
                      })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${selectedCalendar.dataKey || selectedCalendar.id}.json`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    내보내기
                  </button>
                  {selectedCalendar.id !== HOLIDAYS_KR_CALENDAR_ID ? (
                    <button
                      type="button"
                      style={{ gridArea: 'clear' }}
                      disabled={!user}
                      className="rounded-full border border-[#f6c5c4] bg-gcal-page px-6 py-2.5 text-sm font-medium text-[#c5221f] transition-colors hover:bg-gcal-red-soft disabled:opacity-60"
                      onClick={() => {
                        if (!window.confirm('이 캘린더의 모든 일정이 삭제됩니다. 초기화할까요?'))
                          return
                        void onReplaceStore({
                          ...store,
                          events: store.events.filter(
                            (e) => e.calendarId !== selectedCalendar.id
                          ),
                          updatedAt: new Date().toISOString()
                        }).then(() => setMessage('일정을 초기화했습니다.'))
                      }}
                    >
                      초기화
                    </button>
                  ) : null}
                  {selectedCalendar.id !== HOLIDAYS_KR_CALENDAR_ID &&
                  selectedCalendar.id !== PRIMARY_CALENDAR_ID ? (
                    <button
                      type="button"
                      style={{ gridArea: 'delete' }}
                      disabled={!user}
                      className="rounded-full border border-[#f6c5c4] bg-gcal-page px-6 py-2.5 text-sm font-medium text-[#c5221f] transition-colors hover:bg-gcal-red-soft disabled:opacity-60"
                      onClick={() => {
                        if (!window.confirm('이 캘린더의 모든 일정이 삭제됩니다. 삭제할까요?'))
                          return
                        void onDeleteCalendar(selectedCalendar.id).then(() => {
                          setSection('general')
                          setSelectedCalendarId(null)
                          setMessage('캘린더를 삭제했습니다.')
                        })
                      }}
                    >
                      삭제
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )}
          </div>
        </InteractionUI>
      </div>
    </div>
  )
}

export default SettingsPanel
