/**
 * Neo Calendar authentication service.
 *
 * Wraps MembersRepository (members.ts) with login verification and session
 * token management. Sessions created with `persistent: true` survive app
 * restarts via `admin-sessions.json`; non-persistent sessions live only in
 * memory for the current process lifetime.
 */

import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { BOOTSTRAP_ADMIN_MEMBER_ID, DEFAULT_ADMIN_ID, DEFAULT_ADMIN_PW, MembersRepository, verifyPassword } from './members'
import type { MemberRole, PublicMember } from './store/types'

export interface AuthIdentity {
  loginId: string
  role: MemberRole
  isBootstrapAdmin: boolean
}

export interface SessionRecord extends AuthIdentity {
  token: string
  persistent: boolean
  createdAt: string
  lastSeenAt: string
}

interface SessionsFile {
  sessions: SessionRecord[]
  updatedAt: string
}

export class AuthService {
  private readonly members: MembersRepository
  private readonly sessionsPath: string
  private readonly sessions = new Map<string, SessionRecord>()

  constructor(dataRoot: string) {
    this.members = new MembersRepository(dataRoot)
    this.sessionsPath = path.join(dataRoot, 'admin-sessions.json')
    this.loadPersistentSessions()
  }

  /* ------------------------------ sessions -------------------------------- */

  private loadPersistentSessions(): void {
    try {
      if (!fs.existsSync(this.sessionsPath)) return
      const raw = fs.readFileSync(this.sessionsPath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<SessionsFile>
      for (const session of parsed.sessions ?? []) {
        if (session?.token) this.sessions.set(session.token, { ...session, persistent: true })
      }
    } catch (error) {
      console.warn('[auth] failed to read admin-sessions.json:', error)
    }
  }

  private persistSessions(): void {
    const persistent = [...this.sessions.values()].filter((session) => session.persistent)
    try {
      fs.mkdirSync(path.dirname(this.sessionsPath), { recursive: true })
      fs.writeFileSync(
        this.sessionsPath,
        JSON.stringify({ sessions: persistent, updatedAt: new Date().toISOString() }, null, 2),
        'utf-8',
      )
    } catch (error) {
      console.warn('[auth] failed to write admin-sessions.json:', error)
    }
  }

  /**
   * Verify credentials. Resolution order:
   *   1. A stored member row matching loginId (bootstrap-admin row included if present).
   *   2. The `.env`-style default bootstrap admin (admin / admin1234) when no row overrides it.
   */
  tryAuthenticate(id: string, pw: string): AuthIdentity | null {
    const loginId = String(id ?? '').trim()
    const password = String(pw ?? '')
    if (!loginId || !password) return null

    // Bootstrap credentials always work (avoids stale/corrupt members.json lock-out).
    if (
      loginId.toLowerCase() === DEFAULT_ADMIN_ID.toLowerCase() &&
      password === DEFAULT_ADMIN_PW
    ) {
      return { loginId: DEFAULT_ADMIN_ID, role: 'super_admin', isBootstrapAdmin: true }
    }

    const record = this.members.findRawByLoginId(loginId)
    if (!record || record.active === false) return null
    if (!verifyPassword(password, record.passwordHash)) return null

    return {
      loginId: record.loginId,
      role: record.role === 'super_admin' ? 'super_admin' : 'member',
      isBootstrapAdmin: record.id === BOOTSTRAP_ADMIN_MEMBER_ID,
    }
  }

  createSession(persistent: boolean, session: AuthIdentity): string {
    const token = randomUUID()
    const now = new Date().toISOString()
    const record: SessionRecord = {
      token,
      loginId: session.loginId,
      role: session.role,
      isBootstrapAdmin: Boolean(session.isBootstrapAdmin),
      persistent: Boolean(persistent),
      createdAt: now,
      lastSeenAt: now,
    }
    this.sessions.set(token, record)
    if (record.persistent) this.persistSessions()
    return token
  }

  destroySession(token: string): void {
    const existed = this.sessions.delete(String(token ?? ''))
    if (existed) this.persistSessions()
  }

  getSession(token: string): SessionRecord | null {
    const session = this.sessions.get(String(token ?? ''))
    if (!session) return null
    session.lastSeenAt = new Date().toISOString()
    return { ...session }
  }

  /* ------------------------------- members --------------------------------- */

  listMembers(): PublicMember[] {
    return this.members.listPublic()
  }

  saveMembers(payload: Record<string, any>): PublicMember[] {
    return this.members.replaceAll(payload)
  }
}
