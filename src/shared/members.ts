import type { MemberRole } from './calendarTypes'

/** Fixed id of the seeded .env bootstrap admin row. */
export const BOOTSTRAP_ADMIN_MEMBER_ID = 'member-bootstrap-admin'

export function isBootstrapAdminMember(
  member: { id?: string; isBootstrapAdmin?: boolean } | null | undefined
): boolean {
  if (!member) return false
  if (member.isBootstrapAdmin === true) return true
  return member.id === BOOTSTRAP_ADMIN_MEMBER_ID
}

export function memberRoleToLabel(role: MemberRole | string | undefined): string {
  return role === 'super_admin' || role === 'admin' ? '총괄관리자' : '일반사용자'
}

export function defaultMemberPassword(loginId: string): string {
  return `${String(loginId ?? '').trim()}!!`
}

export function normalizeMemberRole(value: unknown): 'member' | 'super_admin' {
  return value === 'super_admin' || value === 'admin' ? 'super_admin' : 'member'
}
