import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { BOOTSTRAP_ADMIN_MEMBER_ID, normalizeMemberRole } from '../../shared/members'
import type { MemberRecord, MemberSaveInput } from '../../shared/calendarTypes'
import { resolveAdminCredentials } from '../dotEnv'

type MembersFile = {
  members: MemberRecord[]
}

export type SaveMembersResult = {
  members: MemberRecord[]
  deletedLoginIds: string[]
}

function hashPassword(password: string): string {
  return createHash('sha256').update(String(password), 'utf8').digest('hex')
}

export class MembersStore {
  private readonly filePath: string

  constructor(dataRoot: string) {
    this.filePath = join(dataRoot, 'members.json')
    mkdirSync(dirname(this.filePath), { recursive: true })
    this.ensureBootstrapAdmin()
  }

  listPublic(): MemberRecord[] {
    return this.read().map(({ passwordHash: _pw, ...rest }) => ({
      ...rest,
      isBootstrapAdmin: rest.id === BOOTSTRAP_ADMIN_MEMBER_ID
    }))
  }

  verifyLogin(loginId: string, password: string): MemberRecord | null {
    const id = loginId.trim()
    const members = this.read()
    const row = members.find((m) => m.active !== false && m.loginId === id)
    if (row?.passwordHash) {
      if (row.passwordHash === hashPassword(password)) {
        const { passwordHash: _p, ...rest } = row
        return rest
      }
      return null
    }

    const admin = resolveAdminCredentials()
    if (id === admin.id && password === admin.password) {
      return {
        id: BOOTSTRAP_ADMIN_MEMBER_ID,
        loginId: admin.id,
        displayName: admin.id,
        role: 'super_admin',
        active: true,
        isBootstrapAdmin: true
      }
    }
    return null
  }

  saveMembers(members: MemberSaveInput[]): SaveMembersResult {
    const prev = this.read()
    const prevById = new Map(prev.map((m) => [m.id, m]))
    const deletedLoginIds: string[] = []

    const next: MemberRecord[] = []
    for (const m of members) {
      if (m._delete) {
        const old = m.id ? prevById.get(m.id) : undefined
        const loginId = (old?.loginId ?? m.loginId ?? '').trim()
        if (old?.id === BOOTSTRAP_ADMIN_MEMBER_ID) {
          throw new Error('기본 관리자(admin) 계정은 삭제할 수 없습니다.')
        }
        if (loginId) deletedLoginIds.push(loginId)
        continue
      }

      const loginId = String(m.loginId ?? '').trim()
      if (!loginId) throw new Error('로그인 아이디를 입력해 주세요.')

      const old = m.id ? prevById.get(m.id) : undefined
      const isBootstrap = old?.id === BOOTSTRAP_ADMIN_MEMBER_ID || m.id === BOOTSTRAP_ADMIN_MEMBER_ID
      let passwordHash = old?.passwordHash
      if (m.password && m.password.length > 0) {
        if (m.password.trim().length < 6) {
          throw new Error('비밀번호는 6자 이상이어야 합니다.')
        }
        passwordHash = hashPassword(m.password)
      } else if (m.passwordHash && m.passwordHash.length > 0) {
        passwordHash =
          m.passwordHash.length === 64 && /^[a-f0-9]+$/i.test(m.passwordHash)
            ? m.passwordHash
            : hashPassword(m.passwordHash)
      }

      if (!old && !passwordHash) {
        throw new Error('비밀번호는 6자 이상이어야 합니다.')
      }

      const role = isBootstrap ? 'super_admin' : normalizeMemberRole(m.role)
      const active = isBootstrap ? true : m.active !== false
      const displayName = isBootstrap
        ? old?.displayName || loginId
        : loginId

      const row: MemberRecord = {
        id: isBootstrap ? BOOTSTRAP_ADMIN_MEMBER_ID : m.id || old?.id || randomUUID(),
        loginId: isBootstrap ? old?.loginId || loginId : loginId,
        displayName,
        role,
        active,
        passwordHash
      }
      next.push(row)
    }

    // Keep bootstrap if somehow missing from payload
    if (!next.some((m) => m.id === BOOTSTRAP_ADMIN_MEMBER_ID)) {
      const bootstrap = prev.find((m) => m.id === BOOTSTRAP_ADMIN_MEMBER_ID)
      if (bootstrap) next.unshift(bootstrap)
    }

    const seen = new Set<string>()
    for (const m of next) {
      const key = m.loginId.toLowerCase()
      if (seen.has(key)) throw new Error(`아이디 「${m.loginId}」가 이미 사용 중입니다.`)
      seen.add(key)
    }

    this.write(next)
    return {
      members: this.listPublic(),
      deletedLoginIds
    }
  }

  private ensureBootstrapAdmin(): void {
    const admin = resolveAdminCredentials()
    const members = this.read()
    if (members.some((m) => m.loginId === admin.id || m.id === BOOTSTRAP_ADMIN_MEMBER_ID)) return
    members.unshift({
      id: BOOTSTRAP_ADMIN_MEMBER_ID,
      loginId: admin.id,
      displayName: admin.id,
      role: 'super_admin',
      active: true,
      passwordHash: hashPassword(admin.password)
    })
    this.write(members)
  }

  private read(): MemberRecord[] {
    if (!existsSync(this.filePath)) return []
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as MembersFile
      return Array.isArray(raw.members) ? raw.members : []
    } catch {
      return []
    }
  }

  private write(members: MemberRecord[]): void {
    const payload: MembersFile = { members }
    writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf8')
  }
}
