import { useState, type FormEvent, type ReactElement } from 'react'
import { useAppDialog } from './AppDialogProvider'
import type { AuthUser } from '../../../shared/ipc'
import { memberRoleToLabel } from '../../../shared/members'

const fieldClass =
  'w-full rounded border border-gcal-border bg-gcal-page py-2 pl-2.5 pr-10 text-sm text-gcal-heading focus:border-gcal-blue focus:outline-none focus:ring-2 focus:ring-gcal-blue/15'

export type AccountPanelProps = {
  user: AuthUser | null
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }): ReactElement {
  if (visible) {
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

function PasswordField({
  label,
  autoComplete,
  value,
  disabled,
  visible,
  onVisibleChange,
  onChange
}: {
  label: string
  autoComplete: string
  value: string
  disabled: boolean
  visible: boolean
  onVisibleChange: (next: boolean) => void
  onChange: (value: string) => void
}): ReactElement {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-gcal-muted">{label}</span>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          className={fieldClass}
          autoComplete={autoComplete}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="mdc-login-eye"
          aria-label={visible ? `${label} 숨기기` : `${label} 표시`}
          aria-pressed={visible}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onVisibleChange(!visible)}
        >
          <PasswordVisibilityIcon visible={visible} />
        </button>
      </div>
    </label>
  )
}

/** Self-service account panel: identity + password change. */
export function AccountPanel({ user }: AccountPanelProps): ReactElement {
  const { alert } = useAppDialog()
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNextPassword, setShowNextPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!user) {
      await alert('로그인이 필요합니다.')
      return
    }
    if (nextPassword.trim().length < 6) {
      await alert('새 비밀번호는 6자 이상이어야 합니다.')
      return
    }
    if (nextPassword !== confirmPassword) {
      await alert('새 비밀번호 확인이 일치하지 않습니다.')
      return
    }
    setBusy(true)
    try {
      await window.neoCalendar.changePassword({
        currentPassword,
        nextPassword: nextPassword.trim()
      })
      setCurrentPassword('')
      setNextPassword('')
      setConfirmPassword('')
      setShowCurrentPassword(false)
      setShowNextPassword(false)
      setShowConfirmPassword(false)
      await alert('비밀번호를 변경했습니다.')
    } catch (error) {
      await alert(error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  if (!user) {
    return <p className="text-sm text-gcal-muted">로그인 후 계정 설정을 사용할 수 있습니다.</p>
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2 rounded-xl border border-gcal-border-light bg-gcal-surface p-4">
        <h3 className="text-sm font-medium text-gcal-heading">내 계정</h3>
        <p className="text-sm text-gcal-body">
          로그인 아이디:{' '}
          <span className="font-medium text-gcal-heading">{user.loginId}</span>
        </p>
        <p className="text-xs text-gcal-muted">역할: {memberRoleToLabel(user.role)}</p>
      </section>

      <form
        className="space-y-3 rounded-xl border border-gcal-border-light bg-gcal-surface p-4"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <h3 className="text-sm font-medium text-gcal-heading">비밀번호 변경</h3>
        <PasswordField
          label="현재 비밀번호"
          autoComplete="current-password"
          value={currentPassword}
          disabled={busy}
          visible={showCurrentPassword}
          onVisibleChange={setShowCurrentPassword}
          onChange={setCurrentPassword}
        />
        <PasswordField
          label="새 비밀번호"
          autoComplete="new-password"
          value={nextPassword}
          disabled={busy}
          visible={showNextPassword}
          onVisibleChange={setShowNextPassword}
          onChange={setNextPassword}
        />
        <PasswordField
          label="새 비밀번호 확인"
          autoComplete="new-password"
          value={confirmPassword}
          disabled={busy}
          visible={showConfirmPassword}
          onVisibleChange={setShowConfirmPassword}
          onChange={setConfirmPassword}
        />
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            className="settings-btn-primary rounded-full px-5 py-2 text-sm font-medium disabled:opacity-50"
            disabled={
              busy || !currentPassword || !nextPassword.trim() || !confirmPassword.trim()
            }
          >
            {busy ? '변경 중…' : '비밀번호 변경'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default AccountPanel
