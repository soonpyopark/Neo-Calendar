import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { MemberRecord, MemberRole, MemberSaveInput } from '../../../shared/calendarTypes'

type MemberDraft = MemberRecord & {
  password?: string
  isNew?: boolean
  markedDelete?: boolean
}

export type MembersPanelProps = {
  listMembers: () => Promise<MemberRecord[]>
  saveMembers: (members: MemberSaveInput[]) => Promise<MemberRecord[]>
}

function roleLabel(role: MemberRole): string {
  if (role === 'super_admin' || role === 'admin') return '관리자'
  return '회원'
}

export function MembersPanel({ listMembers, saveMembers }: MembersPanelProps): ReactElement {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [members, setMembers] = useState<MemberDraft[]>([])
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loginId, setLoginId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<MemberRole>('member')
  const [active, setActive] = useState(true)
  const [password, setPassword] = useState('')
  const [tab, setTab] = useState<'list' | 'edit'>('list')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await listMembers()
      setMembers(rows.map((m) => ({ ...m, password: '', isNew: false, markedDelete: false })))
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [listMembers])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(
    () =>
      members.filter((m) => {
        if (m.markedDelete) return false
        const q = query.trim().toLowerCase()
        if (!q) return true
        return (
          m.loginId.toLowerCase().includes(q) ||
          m.displayName.toLowerCase().includes(q)
        )
      }),
    [members, query]
  )

  const resetForm = (): void => {
    setEditingId(null)
    setLoginId('')
    setDisplayName('')
    setRole('member')
    setActive(true)
    setPassword('')
  }

  const persist = async (draft: MemberDraft[]): Promise<boolean> => {
    setSaving(true)
    setError('')
    try {
      const payload: MemberSaveInput[] = draft
        .filter((m) => !(m.markedDelete && m.isNew))
        .filter((m) => !m.markedDelete)
        .map((m) => ({
          id: m.id,
          loginId: m.loginId,
          displayName: m.displayName,
          role: m.role === 'member' ? 'member' : 'super_admin',
          active: m.active !== false,
          ...(m.password ? { password: m.password } : {})
        }))
      const next = await saveMembers(payload)
      setMembers(next.map((m) => ({ ...m, password: '', isNew: false, markedDelete: false })))
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원 저장에 실패했습니다.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const startAdd = (): void => {
    resetForm()
    setTab('edit')
  }

  const startEdit = (m: MemberDraft): void => {
    setEditingId(m.id)
    setLoginId(m.loginId)
    setDisplayName(m.displayName)
    setRole(m.role === 'member' ? 'member' : 'super_admin')
    setActive(m.active !== false)
    setPassword('')
    setTab('edit')
  }

  const submitForm = async (): Promise<void> => {
    const id = loginId.trim()
    if (!id) {
      setError('로그인 아이디를 입력하세요.')
      return
    }
    if (!editingId && password.trim().length < 6) {
      setError('새 회원 비밀번호는 6자 이상이어야 합니다.')
      return
    }
    let next = [...members]
    if (editingId) {
      next = next.map((m) =>
        m.id === editingId
          ? {
              ...m,
              loginId: m.isBootstrapAdmin ? m.loginId : id,
              displayName: displayName.trim() || id,
              role,
              active,
              password: password.trim() || undefined
            }
          : m
      )
    } else {
      next.push({
        id: `member-${Date.now().toString(36)}`,
        loginId: id,
        displayName: displayName.trim() || id,
        role,
        active,
        password: password.trim(),
        isNew: true
      })
    }
    const ok = await persist(next)
    if (ok) {
      resetForm()
      setTab('list')
    }
  }

  const markDelete = async (m: MemberDraft): Promise<void> => {
    if (m.isBootstrapAdmin) {
      setError('부트스트랩 관리자는 삭제할 수 없습니다.')
      return
    }
    if (!window.confirm(`회원 "${m.loginId}"을(를) 삭제할까요?`)) return
    const next = members.map((row) =>
      row.id === m.id ? { ...row, markedDelete: true } : row
    )
    await persist(next)
  }

  if (loading) {
    return <p className="settings-note">회원 목록을 불러오는 중…</p>
  }

  return (
    <div className="members-panel">
      {error ? <p className="settings-error">{error}</p> : null}

      {tab === 'list' ? (
        <>
          <div className="members-toolbar">
            <input
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="회원 검색"
            />
            <button type="button" className="is-primary" onClick={startAdd}>
              회원 추가
            </button>
          </div>
          <ul className="members-list">
            {visible.length === 0 ? (
              <li className="search-empty">회원이 없습니다.</li>
            ) : (
              visible.map((m) => (
                <li key={m.id} className="members-row">
                  <div>
                    <strong>{m.displayName}</strong>
                    <span className="members-meta">
                      {m.loginId} · {roleLabel(m.role)}
                      {!m.active ? ' · 비활성' : ''}
                      {m.isBootstrapAdmin ? ' · 부트스트랩' : ''}
                    </span>
                  </div>
                  <div className="members-row-actions">
                    <button type="button" onClick={() => startEdit(m)}>
                      편집
                    </button>
                    <button type="button" className="is-danger" onClick={() => void markDelete(m)}>
                      삭제
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </>
      ) : (
        <div className="members-form">
          <h3>{editingId ? '회원 편집' : '회원 추가'}</h3>
          <label className="settings-field">
            <span>로그인 아이디</span>
            <input
              value={loginId}
              disabled={Boolean(members.find((m) => m.id === editingId)?.isBootstrapAdmin)}
              onChange={(e) => setLoginId(e.target.value)}
            />
          </label>
          <label className="settings-field">
            <span>표시 이름</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="settings-field">
            <span>역할</span>
            <select
              value={role === 'member' ? 'member' : 'super_admin'}
              onChange={(e) =>
                setRole(e.target.value === 'member' ? 'member' : 'super_admin')
              }
            >
              <option value="member">회원</option>
              <option value="super_admin">관리자</option>
            </select>
          </label>
          <label className="settings-field">
            <span>비밀번호 {editingId ? '(변경 시에만)' : ''}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="mdc-login-remember">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            활성
          </label>
          <div className="panel-actions">
            <button
              type="button"
              onClick={() => {
                resetForm()
                setTab('list')
              }}
              disabled={saving}
            >
              취소
            </button>
            <button
              type="button"
              className="is-primary"
              disabled={saving}
              onClick={() => void submitForm()}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default MembersPanel
