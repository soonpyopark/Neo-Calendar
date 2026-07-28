import { useEffect, useState, type ReactElement } from 'react'
import { cn } from '../lib/cn'
import { blockPanelOutsideClose } from '../lib/recurrenceComplete'
import { InteractionUI } from './InteractionUI'

export type RecurrenceScope = 'single' | 'following' | 'all'
export type RecurrenceScopeMode = 'edit' | 'delete' | 'complete'

export type RecurrenceScopeDialogProps = {
  open: boolean
  mode?: RecurrenceScopeMode
  /** overlay = in-shell floating card; panel = fill floating BrowserWindow */
  surface?: 'overlay' | 'panel'
  onClose: () => void
  onSelect: (scope: RecurrenceScope) => void
}

const EDIT_OPTIONS = [
  { value: 'single' as const, label: '이 일정만', description: '선택한 날짜의 일정만 변경합니다.' },
  {
    value: 'following' as const,
    label: '이 일정 및 다음 일정',
    description: '선택한 날짜부터 이후 반복을 변경합니다.'
  },
  { value: 'all' as const, label: '모든 일정', description: '반복 시리즈 전체를 변경합니다.' }
]

const COMPLETE_OPTIONS = [
  {
    value: 'single' as const,
    label: '이 일정만',
    description: '선택한 날짜의 일정만 완료 상태를 변경합니다.'
  },
  {
    value: 'following' as const,
    label: '이 일정 및 다음 일정',
    description: '선택한 날짜부터 이후 반복의 완료 상태를 변경합니다.'
  },
  {
    value: 'all' as const,
    label: '모든 일정',
    description: '반복 시리즈 전체의 완료 상태를 변경합니다.'
  }
]

const DELETE_OPTIONS = [
  {
    value: 'single' as const,
    label: '이 일정만',
    description: '선택한 날짜의 일정만 삭제합니다.'
  },
  {
    value: 'following' as const,
    label: '이 일정 및 다음 일정',
    description: '선택한 날짜부터 이후 반복을 삭제합니다.'
  },
  {
    value: 'all' as const,
    label: '모든 일정',
    description: '반복 시리즈 전체를 삭제합니다.'
  }
]

function CloseIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
      />
    </svg>
  )
}

export function RecurrenceScopeDialog({
  open,
  mode = 'edit',
  surface = 'overlay',
  onClose,
  onSelect
}: RecurrenceScopeDialogProps): ReactElement | null {
  const [scope, setScope] = useState<RecurrenceScope>('single')

  useEffect(() => {
    if (!open) return
    setScope('single')
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation()
        blockPanelOutsideClose(450)
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  if (!open) return null

  const dismiss = (): void => {
    blockPanelOutsideClose(450)
    onClose()
  }

  const confirm = (): void => {
    blockPanelOutsideClose(450)
    onSelect(scope)
  }

  const title =
    mode === 'delete'
      ? '반복 일정 삭제'
      : mode === 'complete'
        ? '반복 일정 완료 처리'
        : '반복 일정 수정'
  const confirmLabel = mode === 'delete' ? '삭제' : '확인'
  const options =
    mode === 'complete' ? COMPLETE_OPTIONS : mode === 'delete' ? DELETE_OPTIONS : EDIT_OPTIONS
  const isPanel = surface === 'panel'

  const card = (
    <InteractionUI
      className={cn(
        'recurrence-scope-shell day-quick-edit interaction-ui flex flex-col overflow-hidden',
        isPanel ? 'relative h-full w-full shadow-none' : 'w-full max-w-[400px]'
      )}
      style={isPanel ? { position: 'relative', inset: 'auto', zIndex: 'auto' } : undefined}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recurrence-scope-title"
    >
      <header className="day-quick-edit-header">
        <h3 id="recurrence-scope-title" className="day-quick-edit-title">
          {title}
        </h3>
        <button
          type="button"
          className="day-quick-edit-close"
          onClick={dismiss}
          aria-label="닫기"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="recurrence-scope-body flex min-h-0 flex-1 flex-col overflow-auto px-3 py-3">
        <p className="mb-2 px-1 text-sm text-gcal-muted">적용 범위를 선택해 주세요.</p>
        <div className="flex flex-col gap-1">
          {options.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-gcal-surface-2',
                scope === option.value && 'bg-gcal-blue-soft'
              )}
            >
              <input
                type="radio"
                name="recurrence-scope"
                className="mt-1 accent-[var(--gcal-blue)]"
                checked={scope === option.value}
                onChange={() => setScope(option.value)}
              />
              <span>
                <span className="block text-sm font-medium text-gcal-heading">{option.label}</span>
                <span className="mt-0.5 block text-xs text-gcal-muted">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="day-quick-edit-footer justify-end gap-2">
        <button
          type="button"
          className="rounded-full px-5 py-2 text-sm font-medium text-gcal-body transition-colors hover:bg-gcal-surface-2"
          onClick={dismiss}
        >
          취소
        </button>
        <button
          type="button"
          className={cn(
            'rounded-full px-5 py-2 text-sm font-medium text-white transition-colors',
            mode === 'delete' ? 'bg-[#c5221f] hover:bg-[#a50e0e]' : 'bg-gcal-blue hover:bg-[#1765cc]'
          )}
          onClick={confirm}
        >
          {confirmLabel}
        </button>
      </div>
    </InteractionUI>
  )

  if (isPanel) {
    return card
  }

  return (
    <div
      className="interaction-ui fixed inset-0 z-[75] flex items-center justify-center bg-transparent p-4"
      onClick={dismiss}
      role="presentation"
    >
      {card}
    </div>
  )
}

export default RecurrenceScopeDialog
