import { useState, type FormEvent, type ReactElement } from 'react'
import { InteractionUI } from './InteractionUI'
import { DEFAULT_ADMIN_ID } from '../../../shared/constants'

export type LoginDialogProps = {
  open: boolean
  busy?: boolean
  error?: string | null
  onClose: () => void
  onSubmit: (loginId: string, password: string, remember: boolean) => void | Promise<void>
}

export function LoginDialog({
  open,
  busy = false,
  error = null,
  onClose,
  onSubmit
}: LoginDialogProps): ReactElement | null {
  const [loginId, setLoginId] = useState(DEFAULT_ADMIN_ID)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)

  if (!open) return null

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    void onSubmit(loginId.trim(), password, remember)
  }

  return (
    <div className="panel-backdrop interaction-ui" role="presentation" onClick={onClose}>
      <InteractionUI
        className="panel-card login-panel"
        role="dialog"
        aria-label="로그인"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-card-header">
          <h2>로그인</h2>
          <button type="button" className="panel-close" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>아이디</span>
            <input
              type="text"
              autoFocus
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              disabled={busy}
            />
          </label>
          <label>
            <span>비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
          </label>
          <label className="login-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={busy}
            />
            <span>로그인 유지</span>
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          <div className="panel-actions">
            <button type="button" onClick={onClose} disabled={busy}>
              취소
            </button>
            <button type="submit" className="is-primary" disabled={busy}>
              {busy ? '확인 중…' : '로그인'}
            </button>
          </div>
        </form>
      </InteractionUI>
    </div>
  )
}

export default LoginDialog
