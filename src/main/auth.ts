import { randomBytes } from 'node:crypto'
import type { AuthUser, LoginResult } from '../shared/ipc'
import { resolveAdminCredentials } from './dotEnv'
import type { SettingsStore } from './settingsStore'

export class AuthService {
  private sessionToken: string | null = null
  private sessionUser: AuthUser | null = null

  constructor(private readonly store: SettingsStore) {
    const saved = store.getAuthSession()
    if (saved) {
      this.sessionToken = saved.token
      this.sessionUser = { loginId: saved.loginId, role: 'admin' }
    }
  }

  getUser(): AuthUser | null {
    return this.sessionUser ? { ...this.sessionUser } : null
  }

  login(loginId: string, password: string, remember = false): LoginResult {
    const id = String(loginId ?? '').trim()
    const pw = String(password ?? '')
    if (!id || !pw) {
      return { ok: false, error: '아이디와 비밀번호를 입력하세요.' }
    }

    const admin = resolveAdminCredentials()
    if (id !== admin.id || pw !== admin.password) {
      return { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' }
    }

    const user: AuthUser = { loginId: id, role: 'admin' }
    this.sessionUser = user
    this.sessionToken = randomBytes(24).toString('hex')

    if (remember) {
      this.store.setAuthSession({ token: this.sessionToken, loginId: user.loginId })
    } else {
      this.store.setAuthSession(null)
    }

    return { ok: true, user }
  }

  logout(): void {
    this.sessionToken = null
    this.sessionUser = null
    this.store.setAuthSession(null)
  }
}
