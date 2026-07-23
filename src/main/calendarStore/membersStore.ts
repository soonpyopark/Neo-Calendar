import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveAdminCredentials } from '../dotEnv'
import type { MemberRecord, MemberSaveInput } from '../../shared/calendarTypes'

type MembersFile = {
  members: MemberRecord[]
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
      isBootstrapAdmin: rest.id === 'member-bootstrap-admin'
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

    // Fallback: .env bootstrap when no matching hashed member
    const admin = resolveAdminCredentials()
    if (id === admin.id && password === admin.password) {
      return {
        id: 'member-bootstrap-admin',
        loginId: admin.id,
        displayName: admin.id,
        role: 'super_admin',
        active: true,
        isBootstrapAdmin: true
      }
    }
    return null
  }

  saveMembers(members: MemberSaveInput[]): MemberRecord[] {
    const prev = this.read()
    const prevById = new Map(prev.map((m) => [m.id, m]))
    const next = members.map((m) => {
      const old = prevById.get(m.id)
      let passwordHash = old?.passwordHash
      if (m.password && m.password.length > 0) {
        passwordHash = hashPassword(m.password)
      } else if (m.passwordHash && m.passwordHash.length > 0) {
        passwordHash =
          m.passwordHash.length === 64 && /^[a-f0-9]+$/i.test(m.passwordHash)
            ? m.passwordHash
            : hashPassword(m.passwordHash)
      }
      return {
        id: m.id || randomUUID(),
        loginId: m.loginId.trim(),
        displayName: m.displayName?.trim() || m.loginId.trim(),
        role: m.role === 'member' ? 'member' : 'super_admin',
        active: m.active !== false,
        passwordHash
      } as MemberRecord
    })
    this.write(next)
    return this.listPublic()
  }

  private ensureBootstrapAdmin(): void {
    const admin = resolveAdminCredentials()
    const members = this.read()
    if (members.some((m) => m.loginId === admin.id)) return
    members.unshift({
      id: 'member-bootstrap-admin',
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
