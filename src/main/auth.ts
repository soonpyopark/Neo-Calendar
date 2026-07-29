import { randomBytes } from 'node:crypto'
import type { AuthUser, LoginResult } from '../shared/ipc'
import {
  authUserFromMember,
  can,
  isSuperAdminUser,
  type AppCapability
} from '../shared/members'
import type { MembersStore } from './calendarStore/membersStore'
import type { SettingsStore } from './settingsStore'
import { resolveAdminCredentials } from './dotEnv'

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
      this.sessionUser = this.resolveUserByLoginId(saved.loginId)
    }
  }

  getUser(): AuthUser | null {
    if (!this.sessionUser) return null
    // Re-resolve role so demotions apply without re-login when possible.
    const fresh = this.resolveUserByLoginId(this.sessionUser.loginId)
    if (!fresh) {
      this.logout()
      return null
    }
    this.sessionUser = fresh
    return { ...fresh }
  }

  isSuperAdmin(): boolean {
    return isSuperAdminUser(this.getUser())
  }

  requireCapability(capability: AppCapability): AuthUser {
    const user = this.getUser()
    if (!user) throw new Error('로그인이 필요합니다.')
    if (!can(user, capability)) {
      throw new Error('권한이 없습니다.')
    }
    return user
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
    const cached = this.browserSessions.get(t)
    if (cached) {
      const fresh = this.resolveUserByLoginId(cached.loginId)
      if (!fresh) {
        this.browserSessions.delete(t)
        return null
      }
      this.browserSessions.set(t, fresh)
      return { ...fresh }
    }
    // Accept persisted token from previous run (restore into map).
    const saved = this.store.getAuthSession()
    if (saved?.token === t && saved.loginId) {
      const restored = this.resolveUserByLoginId(saved.loginId)
      if (!restored) return null
      this.browserSessions.set(t, restored)
      return { ...restored }
    }
    return null
  }

  requireBrowserCapability(
    token: string | null | undefined,
    capability: AppCapability
  ): AuthUser {
    const user = this.getBrowserUser(token)
    if (!user) throw new Error('로그인이 필요합니다.')
    if (!can(user, capability)) {
      throw new Error('권한이 없습니다.')
    }
    return user
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

  private resolveUserByLoginId(loginId: string | null | undefined): AuthUser | null {
    const member = this.members.findActiveByLoginId(loginId)
    if (member) return authUserFromMember(member)
    const id = String(loginId ?? '').trim()
    if (!id) return null
    // Safety net: env bootstrap admin id without a members.json row.
    if (id === resolveAdminCredentials().id) {
      return { loginId: id, role: 'super_admin' }
    }
    return null
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
    return { ok: true, user: authUserFromMember(member) }
  }
}
