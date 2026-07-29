import { useState, type FormEvent, type ReactElement } from 'react'
import { useAppDialog } from './AppDialogProvider'
import type { AuthUser } from '../../../shared/ipc'
import { memberRoleToLabel } from '../../../shared/members'

const fieldClass =
  'w-full rounded border border-gcal-border bg-gcal-page px-2.5 py-2 text-sm text-gcal-heading focus:border-gcal-blue focus:outline-none focus:ring-2 focus:ring-gcal-blue/15'

export type AccountPanelProps = {
  user: AuthUser | null
}

/** Self-service account panel: identity + password change. */
export function AccountPanel({ user }: AccountPanelProps): ReactElement {
  const { alert } = useAppDialog()
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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

      <form className="space-y-3 rounded-xl border border-gcal-border-light bg-gcal-surface p-4" onSubmit={(e) => void handleSubmit(e)}>
        <h3 className="text-sm font-medium text-gcal-heading">비밀번호 변경</h3>
        <label className="block space-y-1">
          <span className="text-xs text-gcal-muted">현재 비밀번호</span>
          <input
            type="password"
            className={fieldClass}
            autoComplete="current-password"
            value={currentPassword}
            disabled={busy}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-gcal-muted">새 비밀번호</span>
          <input
            type="password"
            className={fieldClass}
            autoComplete="new-password"
            value={nextPassword}
            disabled={busy}
            onChange={(e) => setNextPassword(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-gcal-muted">새 비밀번호 확인</span>
          <input
            type="password"
            className={fieldClass}
            autoComplete="new-password"
            value={confirmPassword}
            disabled={busy}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>
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
