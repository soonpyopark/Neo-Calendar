import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import type {
  HolidaysKrSettings,
  StoreSettings,
  SyncHolidaysInput,
  SyncHolidaysResult
} from '../../../shared/calendarTypes'
import { useAppDialog } from './AppDialogProvider'

const fieldBoxClass =
  'rounded-lg border border-gcal-border bg-gcal-input px-4 py-3 focus-within:border-gcal-blue focus-within:ring-2 focus-within:ring-gcal-blue/15'

function FieldLabel({ children }: { children: ReactNode }): ReactElement {
  return <span className="mb-1 block text-xs text-gcal-muted">{children}</span>
}

function formatHolidaySyncTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('ko-KR')
  } catch {
    return iso
  }
}

function friendlyHolidaySyncError(message: string): string {
  const text = String(message ?? '').trim()
  if (!text || /native bridge timeout|native host unavailable|timeout/i.test(text)) {
    return '동기화에 실패하였습니다. 잠시 후 다시 시도해 보세요.'
  }
  return text
}

async function ensureOnlineOrNotify(
  alert: (message: string, options?: { title?: string }) => Promise<void>,
  featureLine: string
): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await alert(
      `${featureLine}\n\n이 기능은 인터넷에 연결되어 있을 때만 사용할 수 있습니다.\n네트워크 연결을 확인한 뒤 다시 시도해 주세요.`,
      { title: '인터넷 연결 필요' }
    )
    return false
  }
  return true
}

export type HolidaysSyncPanelProps = {
  settings: StoreSettings
  onSyncHolidays: (input?: SyncHolidaysInput) => Promise<SyncHolidaysResult>
  onSaveSettings: (patch: Partial<StoreSettings>) => Promise<void>
}

export function HolidaysSyncPanel({
  settings,
  onSyncHolidays,
  onSaveSettings
}: HolidaysSyncPanelProps): ReactElement {
  const { alert } = useAppDialog()
  const [syncing, setSyncing] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [serviceKey, setServiceKey] = useState(settings?.holidaysKr?.serviceKey ?? '')
  const [rememberKey, setRememberKey] = useState(Boolean(settings?.holidaysKr?.rememberKey))
  const [keySaved, setKeySaved] = useState(false)
  const status: HolidaysKrSettings | null = settings?.holidaysKr ?? null

  useEffect(() => {
    setServiceKey(settings?.holidaysKr?.serviceKey ?? '')
    setRememberKey(Boolean(settings?.holidaysKr?.rememberKey))
    setKeySaved(false)
  }, [settings?.holidaysKr?.serviceKey, settings?.holidaysKr?.rememberKey])

  const handleSaveKey = async (): Promise<void> => {
    const trimmed = serviceKey.trim()
    if (rememberKey && !trimmed) {
      await alert('저장할 API 인증키를 입력해 주세요.')
      return
    }
    setSavingKey(true)
    setKeySaved(false)
    try {
      await onSaveSettings({
        holidaysKr: {
          ...(status ?? {
            serviceKey: '',
            rememberKey: false,
            ok: null,
            skipped: false,
            reason: null,
            message: null,
            years: [],
            count: 0,
            lastSyncedAt: null
          }),
          serviceKey: rememberKey ? trimmed : '',
          rememberKey: rememberKey && Boolean(trimmed)
        }
      })
      setKeySaved(true)
    } catch (err) {
      await alert(err instanceof Error ? err.message : 'API 키를 저장하지 못했습니다.')
    } finally {
      setSavingKey(false)
    }
  }

  const handleSync = async (): Promise<void> => {
    const trimmed = serviceKey.trim()
    if (!trimmed) {
      await alert('API 인증키를 입력해 주세요.')
      return
    }
    const online = await ensureOnlineOrNotify(alert, '공휴일 동기화는 인터넷 연결이 필요합니다.')
    if (!online) return

    setSyncing(true)
    try {
      const result = await onSyncHolidays({
        serviceKey: trimmed,
        rememberKey
      })
      if (result?.skipped) {
        await alert(result.message || '공휴일 API 인증키가 필요합니다.')
        return
      }
      if (!result?.ok) {
        const raw = String(result?.message ?? result?.error ?? '')
        const offline =
          result?.reason === 'offline' ||
          /인터넷 연결이 필요합니다|fetch failed|network|offline/i.test(raw)
        if (offline) {
          await ensureOnlineOrNotify(alert, '공휴일 동기화는 인터넷 연결이 필요합니다.')
          return
        }
        await alert(
          friendlyHolidaySyncError(raw) || '동기화에 실패하였습니다. 잠시 후 다시 시도해 보세요.'
        )
        return
      }
      await alert(result.message || '공휴일을 동기화했습니다.')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? '')
      const offline =
        /인터넷 연결이 필요합니다|fetch failed|network|offline|Failed to fetch/i.test(message)
      if (offline) {
        await ensureOnlineOrNotify(alert, '공휴일 동기화는 인터넷 연결이 필요합니다.')
        return
      }
      await alert(
        friendlyHolidaySyncError(message) || '동기화에 실패하였습니다. 잠시 후 다시 시도해 보세요.'
      )
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="w-full max-w-full text-left">
      <h2 className="mb-8 text-[22px] font-normal text-gcal-heading">대한민국의 휴일</h2>
      <div className="space-y-4">
        <div className="rounded-lg border border-gcal-border bg-gcal-surface p-5">
          <h3 className="mb-2 text-base font-medium text-gcal-heading">API 인증키</h3>
          <p className="mb-4 text-sm text-gcal-muted">
            공공데이터포털 특일 정보 API 인증키를 입력하세요.{' '}
            <span className="text-gcal-heading">저장</span>을 체크하면 다음 실행 후에도 유지되며,
            동기화 버튼에 사용됩니다.
          </p>
          <div className={fieldBoxClass}>
            <FieldLabel>Service Key</FieldLabel>
            <input
              type="password"
              autoComplete="off"
              className="w-full border-0 bg-transparent p-0 text-base text-gcal-heading outline-none placeholder:text-gcal-muted/70"
              value={serviceKey}
              onChange={(e) => {
                setServiceKey(e.target.value)
                setKeySaved(false)
              }}
              placeholder="공공데이터포털 인증키"
            />
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-gcal-body">
            <input
              type="checkbox"
              checked={rememberKey}
              onChange={(e) => {
                setRememberKey(e.target.checked)
                setKeySaved(false)
              }}
            />
            저장
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSaveKey()}
              disabled={savingKey || syncing}
              className="settings-btn-secondary rounded-full px-5 py-2 text-sm font-medium disabled:opacity-60"
            >
              {savingKey ? '저장 중…' : '키 저장'}
            </button>
            <p className="min-h-[1.25rem] text-sm text-gcal-muted">
              {keySaved && !savingKey ? '저장되었습니다.' : ''}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-gcal-border bg-gcal-surface p-5">
          <h3 className="mb-2 text-base font-medium text-gcal-heading">공휴일 동기화</h3>
          <p className="mb-4 text-sm text-gcal-muted">
            공휴일·대체공휴일을 가져와{' '}
            <span className="text-gcal-heading">대한민국의 휴일</span> 캘린더에 반영합니다. 이
            캘린더의 일정은 동기화로만 갱신됩니다.
          </p>
          {status?.lastSyncedAt ? (
            <p className="mb-4 text-sm text-gcal-muted">
              최근 동기화: {formatHolidaySyncTime(status.lastSyncedAt)}
              {typeof status.count === 'number' ? ` · ${status.count}건` : ''}
            </p>
          ) : null}
          {status && status.ok === false && status.message ? (
            <p className="mb-4 text-sm text-[#c5221f]">{status.message}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing || savingKey}
            className="settings-btn-primary rounded-full px-5 py-2 text-sm font-medium disabled:opacity-60"
          >
            {syncing ? '동기화 중…' : '지금 동기화'}
          </button>
        </div>
      </div>
    </div>
  )
}
