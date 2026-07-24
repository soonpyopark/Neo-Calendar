import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { getDefaultCalendarColor } from '../../../shared/calendarColorPalette'
import { sortTags } from '../../../shared/mdcExport/eventTags.js'
import type { TagRecord } from '../../../shared/calendarTypes'
import { cn } from '../lib/cn'
import { useAppDialog } from './AppDialogProvider'
import { CalendarColorPalette } from './CalendarColorPalette'

const fieldBoxClass =
  'rounded-lg border border-gcal-border bg-gcal-input px-4 py-3 focus-within:border-gcal-blue focus-within:ring-2 focus-within:ring-gcal-blue/15'

function FieldLabel({ children }: { children: ReactNode }): ReactElement {
  return <span className="mb-1 block text-xs text-gcal-muted">{children}</span>
}

function TagDragHandleIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 5h2v2H9V5zm4 0h2v2h-2V5zM9 11h2v2H9v-2zm4 0h2v2h-2v-2zM9 17h2v2H9v-2zm4 0h2v2h-2v-2z"
      />
    </svg>
  )
}

/** `<input type="color">` needs #rrggbb; fall back when tag color is missing/invalid. */
function toColorInputValue(color: string | null | undefined, fallback = '#9aa0a6'): string {
  const raw = String(color ?? '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const r = raw[1]
    const g = raw[2]
    const b = raw[3]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return fallback
}

function NewTagForm({
  tagsCount,
  busy,
  onCreate
}: {
  tagsCount: number
  busy: boolean
  onCreate: (payload: { name: string; color: string }) => Promise<void>
}): ReactElement {
  const { alert } = useAppDialog()
  const [nameDraft, setNameDraft] = useState('')
  const [colorDraft, setColorDraft] = useState(() => getDefaultCalendarColor(0))

  const handleCreate = async (): Promise<void> => {
    const name = nameDraft.trim()
    if (!name) {
      await alert('태그 이름을 입력해 주세요.')
      return
    }
    try {
      await onCreate({ name, color: colorDraft })
      setNameDraft('')
      setColorDraft(getDefaultCalendarColor(tagsCount + 1))
    } catch (err) {
      await alert(err instanceof Error ? err.message : '태그를 추가하지 못했습니다.')
    }
  }

  return (
    <div className="mb-6 space-y-4 rounded-xl border border-gcal-border-light bg-gcal-surface p-4">
      <div>
        <FieldLabel>태그 색상</FieldLabel>
        <CalendarColorPalette value={colorDraft} onChange={setColorDraft} />
      </div>
      <div>
        <FieldLabel>새 태그</FieldLabel>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            type="text"
            className={cn(fieldBoxClass, 'min-w-[10rem] flex-1')}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="예: 행정"
            maxLength={32}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleCreate()
              }
            }}
          />
          <button
            type="button"
            className="settings-btn-primary inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium disabled:opacity-40"
            disabled={busy || !nameDraft.trim()}
            onClick={() => void handleCreate()}
          >
            추가
          </button>
        </div>
      </div>
    </div>
  )
}

export type TagsPanelProps = {
  tags: TagRecord[]
  onCreateTag: (payload: { name: string; color: string }) => Promise<TagRecord>
  onUpdateTag: (
    id: string,
    patch: Partial<Pick<TagRecord, 'name' | 'color' | 'sortOrder'>>
  ) => Promise<TagRecord>
  onDeleteTag: (id: string) => Promise<void>
}

export function TagsPanel({
  tags,
  onCreateTag,
  onUpdateTag,
  onDeleteTag
}: TagsPanelProps): ReactElement {
  const { alert, confirm } = useAppDialog()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(() => getDefaultCalendarColor(0))
  const [busy, setBusy] = useState(false)
  const [orderIds, setOrderIds] = useState<string[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const base = sortTags(tags ?? [])
    if (!orderIds?.length) return base
    const byId = new Map(base.map((tag) => [tag.id, tag]))
    const ordered: TagRecord[] = []
    for (const id of orderIds) {
      const tag = byId.get(id)
      if (tag) {
        ordered.push(tag)
        byId.delete(id)
      }
    }
    ordered.push(...Array.from(byId.values()))
    return ordered
  }, [tags, orderIds])

  useEffect(() => {
    if (!orderIds?.length) return
    const live = sortTags(tags ?? [])
      .map((tag) => tag.id)
      .join('\0')
    if (live === orderIds.join('\0')) setOrderIds(null)
  }, [tags, orderIds])

  const handleCreate = useCallback(
    async (payload: { name: string; color: string }) => {
      setBusy(true)
      try {
        await onCreateTag(payload)
      } finally {
        setBusy(false)
      }
    },
    [onCreateTag]
  )

  const handleSaveEdit = async (tag: TagRecord): Promise<void> => {
    const name = editName.trim()
    if (!name) {
      await alert('태그 이름을 입력해 주세요.')
      return
    }
    const color = toColorInputValue(editColor, tag.color || getDefaultCalendarColor(0))
    setBusy(true)
    try {
      await onUpdateTag(tag.id, { name, color })
      setEditingId(null)
    } catch (err) {
      await alert(err instanceof Error ? err.message : '태그를 수정하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (tag: TagRecord): Promise<void> => {
    const ok = await confirm(
      `태그 “${tag.name}”을(를) 삭제할까요?\n이 태그가 붙은 일정에서는 태그가 제거됩니다.`,
      {
        variant: 'danger',
        confirmLabel: '삭제'
      }
    )
    if (!ok) return
    setBusy(true)
    try {
      await onDeleteTag(tag.id)
    } catch (err) {
      await alert(err instanceof Error ? err.message : '태그를 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const reorderTags = async (fromId: string | null, toId: string): Promise<void> => {
    if (busy || editingId || !fromId || !toId || fromId === toId) return
    const fromIndex = sorted.findIndex((tag) => tag.id === fromId)
    const toIndex = sorted.findIndex((tag) => tag.id === toId)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return

    const next = [...sorted]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    const nextIds = next.map((tag) => tag.id)
    setOrderIds(nextIds)
    setBusy(true)
    try {
      for (let i = 0; i < next.length; i += 1) {
        const tag = next[i]
        if (tag.sortOrder === i) continue
        await onUpdateTag(tag.id, { sortOrder: i })
      }
    } catch (err) {
      setOrderIds(null)
      await alert(err instanceof Error ? err.message : '태그 순서를 바꾸지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const canDrag = !busy && !editingId

  return (
    <div className="w-full max-w-full text-left">
      <h2 className="mb-2 text-[22px] font-normal text-gcal-heading">태그 관리</h2>
      <p className="mb-8 text-sm text-gcal-muted">
        일정에 붙일 태그를 등록합니다. 왼쪽 핸들을 끌어 순서를 바꿀 수 있습니다.
      </p>

      <NewTagForm tagsCount={tags?.length ?? 0} busy={busy} onCreate={handleCreate} />

      <ul className="m-0 list-none space-y-2 p-0">
        {sorted.length === 0 ? (
          <li className="rounded-lg border border-dashed border-gcal-border px-4 py-6 text-center text-sm text-gcal-muted">
            등록된 태그가 없습니다.
          </li>
        ) : null}
        {sorted.map((tag) => {
          const isEditing = editingId === tag.id
          const isDragging = dragId === tag.id
          const isDropTarget = dropId === tag.id && dragId && dragId !== tag.id
          return (
            <li
              key={tag.id}
              className={cn(
                'flex flex-wrap items-center gap-2 rounded-lg border border-gcal-border-light px-3 py-2.5 transition-colors',
                isDragging && 'opacity-45',
                isDropTarget && 'border-gcal-blue bg-gcal-blue-soft/40'
              )}
              onDragOver={(e) => {
                if (!canDrag || !dragId || dragId === tag.id) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dropId !== tag.id) setDropId(tag.id)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropId((current) => (current === tag.id ? null : current))
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const fromId = e.dataTransfer.getData('text/plain') || dragId
                setDragId(null)
                setDropId(null)
                void reorderTags(fromId, tag.id)
              }}
            >
              <button
                type="button"
                className={cn(
                  'inline-flex h-8 w-7 shrink-0 items-center justify-center rounded text-gcal-muted',
                  canDrag
                    ? 'cursor-grab hover:bg-gcal-surface-2 hover:text-gcal-heading active:cursor-grabbing'
                    : 'cursor-default opacity-40'
                )}
                draggable={canDrag}
                disabled={!canDrag}
                title="끌어 순서 변경"
                aria-label={`${tag.name} 순서 변경`}
                onDragStart={(e) => {
                  if (!canDrag) {
                    e.preventDefault()
                    return
                  }
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', tag.id)
                  setDragId(tag.id)
                }}
                onDragEnd={() => {
                  setDragId(null)
                  setDropId(null)
                }}
              >
                <TagDragHandleIcon />
              </button>
              {isEditing ? null : (
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-sm"
                  style={{ background: tag.color || '#9aa0a6' }}
                  aria-hidden="true"
                />
              )}
              {isEditing ? (
                <input
                  type="text"
                  className={cn(fieldBoxClass, 'min-w-0 flex-1 py-2')}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={32}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleSaveEdit(tag)
                    }
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <span className="min-w-0 flex-1 text-sm text-gcal-heading">{tag.name}</span>
              )}
              <div className="flex shrink-0 items-center gap-1">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      className="settings-btn-secondary rounded-lg border-transparent px-3 py-1.5 text-sm text-gcal-blue"
                      disabled={busy}
                      onClick={() => void handleSaveEdit(tag)}
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-1.5 text-sm text-gcal-muted hover:bg-gcal-surface-2"
                      onClick={() => setEditingId(null)}
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-1.5 text-sm text-gcal-muted hover:bg-gcal-surface-2 hover:text-gcal-heading"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(tag.id)
                        setEditName(tag.name ?? '')
                        setEditColor(toColorInputValue(tag.color, getDefaultCalendarColor(0)))
                      }}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="settings-btn-danger rounded-lg border-transparent px-3 py-1.5 text-sm"
                      disabled={busy}
                      onClick={() => void handleDelete(tag)}
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
              {isEditing ? (
                <div className="basis-full pl-9 pt-1">
                  <FieldLabel>태그 색상</FieldLabel>
                  <CalendarColorPalette value={editColor} onChange={setEditColor} />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
