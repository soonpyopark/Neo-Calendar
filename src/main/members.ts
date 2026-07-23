/**
 * Member account storage (userData/data/members.json).
 * Loosely mirrors My Desktop Calendar's shared/members.js conventions
 * (roles, bootstrap admin id, default password rule) but persists real
 * salted password hashes instead of the WPF app's `.env`-based admin.
 */

import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import type { MemberRecord, MemberRole, PublicMember } from './store/types'

export type { MemberRole } from './store/types'

/** Default administrator credentials (mirrors DEFAULT_ADMIN_ID / DEFAULT_ADMIN_PW). */
export const DEFAULT_ADMIN_ID = 'admin'
export const DEFAULT_ADMIN_PW = 'admin1234'

/** Fixed id of the seeded bootstrap admin row (mirrors MembersService / BOOTSTRAP_ADMIN_MEMBER_ID). */
export const BOOTSTRAP_ADMIN_MEMBER_ID = 'member-bootstrap-admin'

export interface PasswordHash {
  algo: 'scrypt' | 'sha256'
  salt: string
  hash: string
}

/* ------------------------------------------------------------------------ *
 * Password hashing helpers
 * ------------------------------------------------------------------------ */

export function hashPassword(password: string): PasswordHash {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password ?? ''), salt, 64).toString('hex')
  return { algo: 'scrypt', salt, hash }
}

export function verifyPassword(password: string, stored: PasswordHash | string | null | undefined): boolean {
  if (stored == null) return false
  const candidatePassword = String(password ?? '')

  if (typeof stored === 'string') {
    // Legacy / plain-text row — direct compare only.
    return stored === candidatePassword
  }
  if (!stored.salt || !stored.hash) return false

  try {
    if (stored.algo === 'sha256') {
      const candidate = createHash('sha256').update(`${stored.salt}:${candidatePassword}`).digest('hex')
      return timingSafeEqualHex(candidate, stored.hash)
    }
    const candidate = scryptSync(candidatePassword, stored.salt, 64).toString('hex')
    return timingSafeEqualHex(candidate, stored.hash)
  } catch {
    return false
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/* ------------------------------------------------------------------------ *
 * Member helpers (mirrors shared/members.js)
 * ------------------------------------------------------------------------ */

export function defaultMemberPassword(loginId: string): string {
  return `${String(loginId ?? '').trim()}!!`
}

export function normalizeMemberRole(value: unknown): MemberRole {
  return value === 'super_admin' ? 'super_admin' : 'member'
}

export function memberRoleToLabel(role?: string | null): string {
  return role === 'super_admin' ? '총괄관리자' : '일반사용자'
}

export function isBootstrapAdminMember(
  member: (Pick<MemberRecord, 'id'> & { isBootstrapAdmin?: boolean }) | null | undefined,
): boolean {
  if (!member) return false
  if (member.isBootstrapAdmin === true) return true
  return member.id === BOOTSTRAP_ADMIN_MEMBER_ID
}

function toPublicMember(member: MemberRecord): PublicMember {
  return {
    id: member.id,
    loginId: member.loginId,
    displayName: member.displayName,
    role: normalizeMemberRole(member.role),
    active: member.active !== false,
    isBootstrapAdmin: isBootstrapAdminMember(member) || undefined,
  }
}

function getBootstrapAdminDefaultPublic(): PublicMember {
  return {
    id: BOOTSTRAP_ADMIN_MEMBER_ID,
    loginId: DEFAULT_ADMIN_ID,
    displayName: '총괄관리자',
    role: 'super_admin',
    active: true,
    isBootstrapAdmin: true,
  }
}

/* ------------------------------------------------------------------------ *
 * MembersRepository — reads/writes userData/data/members.json
 * ------------------------------------------------------------------------ */

export class MembersRepository {
  private readonly membersPath: string
  private members: MemberRecord[] | null = null

  constructor(dataRoot: string) {
    this.membersPath = path.join(dataRoot, 'members.json')
    this.ensureBootstrapAdmin()
  }

  /** Seed admin / admin1234 on first run so login always works out of the box. */
  private ensureBootstrapAdmin(): void {
    const members = this.ensureLoaded()
    const existing = members.find(
      (member) =>
        member.id === BOOTSTRAP_ADMIN_MEMBER_ID ||
        member.loginId.trim().toLowerCase() === DEFAULT_ADMIN_ID
    )
    if (existing) return

    const now = new Date().toISOString()
    members.push({
      id: BOOTSTRAP_ADMIN_MEMBER_ID,
      loginId: DEFAULT_ADMIN_ID,
      displayName: '총괄관리자',
      passwordHash: hashPassword(DEFAULT_ADMIN_PW),
      role: 'super_admin',
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    this.persist()
  }

  private ensureLoaded(): MemberRecord[] {
    if (!this.members) this.members = this.readFromDisk()
    return this.members
  }

  private readFromDisk(): MemberRecord[] {
    try {
      if (!fs.existsSync(this.membersPath)) return []
      const raw = fs.readFileSync(this.membersPath, 'utf-8')
      const parsed = JSON.parse(raw)
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.members) ? parsed.members : []
      return list.filter((member: any) => member && typeof member.loginId === 'string')
    } catch (error) {
      console.warn('[members] failed to read members.json:', error)
      return []
    }
  }

  private persist(): void {
    const members = this.ensureLoaded()
    fs.mkdirSync(path.dirname(this.membersPath), { recursive: true })
    fs.writeFileSync(
      this.membersPath,
      JSON.stringify({ members, updatedAt: new Date().toISOString() }, null, 2),
      'utf-8',
    )
  }

  findRawByLoginId(loginId: string): MemberRecord | undefined {
    const normalized = String(loginId ?? '').trim().toLowerCase()
    if (!normalized) return undefined
    return this.ensureLoaded().find((member) => member.loginId.trim().toLowerCase() === normalized)
  }

  findRawById(id: string): MemberRecord | undefined {
    return this.ensureLoaded().find((member) => member.id === id)
  }

  /** Public member list, always including a virtual bootstrap-admin row unless overridden. */
  listPublic(): PublicMember[] {
    const members = this.ensureLoaded()
    const hasBootstrapOverride = members.some((member) => member.id === BOOTSTRAP_ADMIN_MEMBER_ID)
    const list = members.map(toPublicMember)
    return hasBootstrapOverride ? list : [getBootstrapAdminDefaultPublic(), ...list]
  }

  create(payload: Record<string, any>): MemberRecord {
    const members = this.ensureLoaded()
    const loginId = String(payload.loginId ?? '').trim()
    if (!loginId) throw new Error('로그인 아이디는 필수입니다.')
    if (this.findRawByLoginId(loginId)) throw new Error(`이미 존재하는 아이디입니다: ${loginId}`)

    const password = payload.password ? String(payload.password) : defaultMemberPassword(loginId)
    const now = new Date().toISOString()
    const member: MemberRecord = {
      id: payload.id ? String(payload.id) : randomUUID(),
      loginId,
      displayName: String(payload.displayName ?? loginId),
      passwordHash: hashPassword(password),
      role: normalizeMemberRole(payload.role),
      active: payload.active !== false,
      createdAt: now,
      updatedAt: now,
    }
    members.push(member)
    this.persist()
    return member
  }

  update(id: string, payload: Record<string, any>): MemberRecord {
    const members = this.ensureLoaded()
    const index = members.findIndex((member) => member.id === id)
    if (index === -1) {
      if (id === BOOTSTRAP_ADMIN_MEMBER_ID) {
        return this.create({
          ...payload,
          id: BOOTSTRAP_ADMIN_MEMBER_ID,
          loginId: payload.loginId ?? DEFAULT_ADMIN_ID,
          role: 'super_admin',
        })
      }
      throw new Error(`존재하지 않는 회원입니다: ${id}`)
    }

    const current = members[index]
    const next: MemberRecord = {
      ...current,
      displayName: payload.displayName ?? current.displayName,
      role: payload.role ? normalizeMemberRole(payload.role) : current.role,
      active: payload.active ?? current.active,
      updatedAt: new Date().toISOString(),
    }
    if (payload.password) next.passwordHash = hashPassword(String(payload.password))

    members[index] = next
    this.persist()
    return next
  }

  remove(id: string): { ok: true } {
    if (id === BOOTSTRAP_ADMIN_MEMBER_ID) {
      throw new Error('기본 관리자 계정은 삭제할 수 없습니다.')
    }
    const members = this.ensureLoaded()
    const next = members.filter((member) => member.id !== id)
    if (next.length === members.length) throw new Error(`존재하지 않는 회원입니다: ${id}`)
    this.members = next
    this.persist()
    return { ok: true }
  }

  /** Full replace, used by AuthService.saveMembers — accepts `{ members: [...] }` or a bare array. */
  replaceAll(payload: Record<string, any> | any[]): PublicMember[] {
    const incoming: Array<Record<string, any>> = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as any)?.members)
        ? (payload as any).members
        : []

    const now = new Date().toISOString()
    const next: MemberRecord[] = []
    for (const raw of incoming) {
      const loginId = String(raw?.loginId ?? '').trim()
      if (!loginId) continue
      const existing = raw.id ? this.findRawById(String(raw.id)) : this.findRawByLoginId(loginId)
      const passwordHash = raw.password
        ? hashPassword(String(raw.password))
        : (existing?.passwordHash ?? hashPassword(defaultMemberPassword(loginId)))

      next.push({
        id: raw.id ? String(raw.id) : (existing?.id ?? randomUUID()),
        loginId,
        displayName: String(raw.displayName ?? loginId),
        passwordHash,
        role: normalizeMemberRole(raw.role),
        active: raw.active !== false,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
    }

    this.members = next
    this.persist()
    return this.listPublic()
  }
}
