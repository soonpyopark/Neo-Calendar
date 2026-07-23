import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactElement
} from 'react'
import { InteractionUI } from './InteractionUI'
import type { CalendarEvent } from './CalendarGrid'

const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'] as const

const DAY_COLOR_PALETTE = [
  '#ffeb3b',
  '#ffb74d',
  '#ff9800',
  '#aed581',
  '#8bc34a',
  '#4fc3f7',
  '#1976d2',
  '#80cbc4',
  '#00bcd4',
  '#f48fb1',
  '#e91e63',
  '#ff5722',
  '#388e3c',
  '#e53935',
  '#ba68c8',
  '#9c27b0',
  '#d81b60',
  '#bdbdbd'
] as const

const QUICK_EDIT_CHROME_HEIGHT = 88
const QUICK_EDIT_BODY_EXTRA = 96

export type AnchorRect = {
  top: number
  left: number
  width: number
  height: number
}

export type DayQuickEditPopoverProps = {
  dateKey: string
  date: Date
  events: CalendarEvent[]
  dayColor?: string | null
  anchorRect: AnchorRect | null
  canEdit?: boolean
  onClose: () => void
  onCreate: (title: string) => void
  onToggleCompleted: (id: string, completed: boolean) => void
  onRemove: (id: string) => void
  onDayColorChange: (color: string | null) => void
}

function formatDayHeaderTitle(date: Date): string {
  const m = date.getMonth() + 1
  const d = date.getDate()
  const weekday = WEEKDAY_SHORT[date.getDay()]
  return `${m}. ${d}.(${weekday})`
}

function clampRectToViewport(rect: {
  top: number
  left: number
  width: number
  height: number
  padding?: number
}): { top: number; left: number; width: number; maxHeight: number } {
  const pad = rect.padding ?? 8
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(rect.width, vw - pad * 2)
  const maxHeight = Math.min(rect.height, vh - pad * 2)
  let left = rect.left
  let top = rect.top
  if (left < pad) left = pad
  if (left + width > vw - pad) left = Math.max(pad, vw - pad - width)
  if (top < pad) top = pad
  if (top + maxHeight > vh - pad) top = Math.max(pad, vh - pad - maxHeight)
  return { top, left, width, maxHeight }
}

function buildQuickEditStyle(anchorRect: AnchorRect | null): CSSProperties | undefined {
  if (!anchorRect) {
    return {
      top: '50%',
      left: '50%',
      width: 320,
      height: 280,
      transform: 'translate(-50%, -50%)',
      '--day-quick-edit-body-height': '180px'
    } as CSSProperties
  }

  const padX = 12
  const width = Math.max(anchorRect.width + padX * 2, 300)
  const bodyHeight = Math.max(Math.round(anchorRect.height) + QUICK_EDIT_BODY_EXTRA, 160)
  const height = bodyHeight + QUICK_EDIT_CHROME_HEIGHT
  const left = anchorRect.left + anchorRect.width / 2 - width / 2
  const top = anchorRect.top + anchorRect.height / 2 - height / 2
  const clamped = clampRectToViewport({ top, left, width, height, padding: 8 })

  return {
    top: clamped.top,
    left: clamped.left,
    width: clamped.width,
    height: clamped.maxHeight,
    maxHeight: clamped.maxHeight,
    '--day-quick-edit-body-height': `${bodyHeight}px`
  } as CSSProperties
}

/**
 * MDC-style day quick editor (date-cell double-click / +추가).
 */
export function DayQuickEditPopover({
  dateKey,
  date,
  events,
  dayColor = null,
  anchorRect,
  canEdit = true,
  onClose,
  onCreate,
  onToggleCompleted,
  onRemove,
  onDayColorChange
}: DayQuickEditPopoverProps): ReactElement {
  const [title, setTitle] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [optimisticColor, setOptimisticColor] = useState<string | null>(dayColor)
  const inputRef = useRef<HTMLInputElement>(null)

  const dayEvents = useMemo(
    () => events.filter((item) => item.dateKey === dateKey),
    [events, dateKey]
  )

  const style = useMemo(() => buildQuickEditStyle(anchorRect), [anchorRect])

  useEffect(() => {
    setTitle('')
    setSelectedId(null)
    setPaletteOpen(false)
    setOptimisticColor(dayColor)
    const id = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(id)
  }, [dateKey, dayColor])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const submitTitle = (event: FormEvent): void => {
    event.preventDefault()
    const next = title.trim()
    if (!canEdit || !next) return
    onCreate(next)
    setTitle('')
    setSelectedId(null)
  }

  return (
    <>
      <div className="day-quick-edit-backdrop interaction-ui" onClick={onClose} role="presentation" />
      <InteractionUI
        className="day-quick-edit"
        style={style}
        role="dialog"
        aria-label={`${formatDayHeaderTitle(date)} 빠른 편집`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="day-quick-edit-header">
          <h2 className="day-quick-edit-title">{formatDayHeaderTitle(date)}</h2>
          <button type="button" className="day-quick-edit-close" onClick={onClose} aria-label="닫기">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>
        </header>

        <div className="day-quick-edit-body">
          <form className="day-quick-edit-create" onSubmit={submitTitle}>
            <input
              ref={inputRef}
              type="text"
              className="day-quick-edit-input"
              placeholder={canEdit ? '일정 추가 (종일)' : '로그인 후 추가할 수 있습니다'}
              value={title}
              disabled={!canEdit}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => setSelectedId(null)}
            />
          </form>

          <ul className="day-quick-edit-list">
            {dayEvents.length === 0 ? (
              <li className="day-quick-edit-empty">등록된 일정이 없습니다</li>
            ) : (
              dayEvents.map((item) => {
                const completed = Boolean(item.completed)
                const accent = completed ? '#9aa0a6' : (item.color ?? '#f6bf26')
                const selected = selectedId === item.id
                return (
                  <li key={item.id} className="day-quick-edit-item">
                    <div
                      className={`day-quick-edit-row${completed ? ' is-completed' : ''}${
                        selected ? ' is-selected' : ''
                      }`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <input
                        type="checkbox"
                        className="day-quick-edit-check"
                        checked={completed}
                        disabled={!canEdit}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          setSelectedId(item.id)
                          onToggleCompleted(item.id, e.target.checked)
                        }}
                      />
                      <span
                        className="day-quick-edit-dot"
                        style={{ backgroundColor: accent }}
                        aria-hidden
                      />
                      <span className="day-quick-edit-item-title">{item.title}</span>
                      {canEdit ? (
                        <button
                          type="button"
                          className="day-quick-edit-remove"
                          aria-label={`${item.title} 삭제`}
                          onClick={(e) => {
                            e.stopPropagation()
                            onRemove(item.id)
                          }}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </div>

        <footer className="day-quick-edit-footer">
          <div className="day-quick-edit-footer-left">
            <button
              type="button"
              className={`day-quick-edit-color-trigger${optimisticColor ? ' has-color' : ''}`}
              style={optimisticColor ? { backgroundColor: optimisticColor } : undefined}
              title="날짜 배경 색상"
              aria-label="날짜 배경 색상"
              aria-expanded={paletteOpen}
              disabled={!canEdit}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setPaletteOpen((open) => !open)
              }}
            >
              {!optimisticColor ? (
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2s10 4.04 10 9c0 3.31-2.69 6-6 6h-1.77c-.28 0-.5.22-.5.5 0 .12.05.23.13.33.41.47.64 1.06.64 1.67A2.5 2.5 0 0 1 12 22zm0-16c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm-5 3.5c-.83 0-1.5-.67-1.5-1.5S6.17 6.5 7 6.5s1.5.67 1.5 1.5S7.83 9.5 7 9.5zm10 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM7 15.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3-8c-.83 0-1.5-.67-1.5-1.5S9.17 4.5 10 4.5s1.5.67 1.5 1.5S10.83 7.5 10 7.5z"
                  />
                </svg>
              ) : null}
            </button>
          </div>
          {paletteOpen && canEdit ? (
            <div
              className="day-quick-edit-palette"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={`day-color-swatch is-clear${!optimisticColor ? ' is-active' : ''}`}
                title="색상 없음"
                aria-label="색상 없음"
                onClick={() => {
                  setOptimisticColor(null)
                  onDayColorChange(null)
                  setPaletteOpen(false)
                }}
              >
                /
              </button>
              {DAY_COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`day-color-swatch${optimisticColor === color ? ' is-active' : ''}`}
                  style={{ backgroundColor: color }}
                  title={color}
                  aria-label={`날짜 색상 ${color}`}
                  onClick={() => {
                    setOptimisticColor(color)
                    onDayColorChange(color)
                    setPaletteOpen(false)
                  }}
                />
              ))}
            </div>
          ) : null}
        </footer>
      </InteractionUI>
    </>
  )
}

export default DayQuickEditPopover
