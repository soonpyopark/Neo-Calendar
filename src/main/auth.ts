import { randomBytes } from 'node:crypto'
import type { AuthUser, LoginResult } from '../shared/ipc'
import type { MembersStore } from './calendarStore/membersStore'
import type { SettingsStore } from './settingsStore'

export type BrowserLoginResult =
  | { ok: true; user: AuthUser; token: string }
  | { ok: false; error: string }

/**
 * Desktop shell keeps a single IPC session; browser HTTP uses a separate token map
 * (MDC: shell login does not steal browser Bearer sessions).
 */
export class AuthService {
  private sessionToken: string | null = null
  private sessionUser: AuthUser | null = null
  private readonly browserSessions = new Map<string, AuthUser>()

  constructor(
    private readonly store: SettingsStore,
    private readonly members: MembersStore
  ) {
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
    const member = this.authenticate(loginId, password)
    if (!member.ok) return member

    const user = member.user
    this.sessionUser = user
    this.sessionToken = randomBytes(24).toString('hex')

    if (remember) {
      this.store.setAuthSession({ token: this.sessionToken, loginId: user.loginId })
    } else {
      this.store.setAuthSession(null)
    }

    return { ok: true, user }
  }

  /** HTTP/browser login — returns Bearer token (separate from shell session). */
  loginBrowser(loginId: string, password: string, remember = false): BrowserLoginResult {
    const member = this.authenticate(loginId, password)
    if (!member.ok) return member

    const token = randomBytes(24).toString('hex')
    this.browserSessions.set(token, member.user)
    if (remember) {
      // Persist browser token alongside shell format for cold start convenience.
      this.store.setAuthSession({ token, loginId: member.user.loginId })
    } else {
      this.store.setAuthSession(null)
    }
    return { ok: true, user: member.user, token }
  }

  logout(): void {
    this.sessionToken = null
    this.sessionUser = null
    this.store.setAuthSession(null)
  }

  logoutBrowser(token: string | null | undefined): void {
    const t = String(token ?? '').trim()
    if (!t) return
    this.browserSessions.delete(t)
    const saved = this.store.getAuthSession()
    if (saved?.token === t) this.store.setAuthSession(null)
  }

  getBrowserUser(token: string | null | undefined): AuthUser | null {
    const t = String(token ?? '').trim()
    if (!t) return null
    const user = this.browserSessions.get(t)
    if (user) return { ...user }
    // Accept persisted token from previous run (restore into map).
    const saved = this.store.getAuthSession()
    if (saved?.token === t && saved.loginId) {
      const restored: AuthUser = { loginId: saved.loginId, role: 'admin' }
      this.browserSessions.set(t, restored)
      return { ...restored }
    }
    return null
  }

  isBrowserTokenValid(token: string | null | undefined): boolean {
    return this.getBrowserUser(token) !== null
  }

  revokeSessionsForLoginId(loginId: string): void {
    const target = loginId.trim().toLowerCase()
    if (!target) return
    for (const [token, user] of this.browserSessions) {
      if (user.loginId.toLowerCase() === target) this.browserSessions.delete(token)
    }
    if (this.sessionUser?.loginId.toLowerCase() === target) {
      this.logout()
    }
  }

  static extractToken(
    authorizationHeader: string | null | undefined,
    adminTokenHeader?: string | null
  ): string | null {
    const auth = String(authorizationHeader ?? '').trim()
    if (auth.toLowerCase().startsWith('bearer ')) {
      return auth.slice(7).trim() || null
    }
    const admin = String(adminTokenHeader ?? '').trim()
    return admin || null
  }

  private authenticate(
    loginId: string,
    password: string
  ): { ok: true; user: AuthUser } | { ok: false; error: string } {
    const id = String(loginId ?? '').trim()
    const pw = String(password ?? '')
    if (!id || !pw) {
      return { ok: false, error: '아이디와 비밀번호를 입력하세요.' }
    }
    const member = this.members.verifyLogin(id, pw)
    if (!member) {
      return { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' }
    }
    return { ok: true, user: { loginId: member.loginId, role: 'admin' } }
  }
}
