import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { TagRecord } from '../../../shared/calendarTypes'
import { setIgnoreMouseEvents } from '../lib/mouseBridge'
import { InteractionUI } from './InteractionUI'

export type QuickEditTagButtonProps = {
  tags: TagRecord[]
  value?: string[]
  onChange: (tagIds: string[]) => void
  disabled?: boolean
  title?: string
  buttonClassName?: string
}

function TagGlyph(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"
      />
    </svg>
  )
}

export function QuickEditTagButton({
  tags,
  value = [],
  onChange,
  disabled = false,
  title = '태그 선택',
  buttonClassName
}: QuickEditTagButtonProps): ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<React.CSSProperties | undefined>()

  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)),
    [tags]
  )
  const selectedIds = useMemo(
    () => Array.from(new Set((value ?? []).filter(Boolean))),
    [value]
  )
  const selectedCount = selectedIds.length
  const primaryColor = sortedTags.find((tag) => selectedIds.includes(tag.id))?.color ?? null

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  useEffect(() => {
    if (!open) return
    setIgnoreMouseEvents(false)
    const place = (): void => {
      const btn = rootRef.current?.querySelector('button')
      if (!btn) return
      const ar = btn.getBoundingClientRect()
      const width = 220
      const height = 200
      const left = Math.min(Math.max(8, ar.left), window.innerWidth - width - 8)
      const top = Math.min(Math.max(8, ar.bottom + 8), window.innerHeight - height - 8)
      setStyle({
        position: 'fixed',
        left,
        top,
        zIndex: 80
      })
    }
    place()
    const onDown = (e: PointerEvent): void => {
      const t = e.target
      if (!(t instanceof Element)) return
      if (t.closest('.quick-edit-tag-root') || t.closest('.quick-edit-calendar-flyout')) return
      setOpen(false)
    }
    window.addEventListener('resize', place)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  const toggleTag = (tagId: string): void => {
    const next = selectedIds.includes(tagId)
      ? selectedIds.filter((id) => id !== tagId)
      : [...selectedIds, tagId]
    onChange(next)
  }

  return (
    <div ref={rootRef} className="quick-edit-calendar-root quick-edit-tag-root">
      <button
        type="button"
        className={[
          'quick-edit-calendar-trigger',
          selectedCount > 0 ? 'has-tags' : '',
          buttonClassName
        ]
          .filter(Boolean)
          .join(' ')}
        title={
          selectedCount > 0
            ? `${title}: ${sortedTags.filter((t) => selectedIds.includes(t.id)).map((t) => t.name).join(', ')}`
            : `${title}: 없음`
        }
        aria-label={title}
        aria-expanded={open}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!disabled) setOpen((v) => !v)
        }}
      >
        <TagGlyph />
        {primaryColor ? (
          <span className="quick-edit-calendar-trigger-dot" style={{ backgroundColor: primaryColor }} />
        ) : null}
        {selectedCount > 1 ? <span className="quick-edit-tag-count">{selectedCount}</span> : null}
      </button>
      {open && !disabled
        ? createPortal(
            <InteractionUI
              className="quick-edit-calendar-flyout"
              style={style}
              role="listbox"
              aria-multiselectable
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={`quick-edit-calendar-option${selectedCount === 0 ? ' is-active' : ''}`}
                onClick={() => {
                  onChange([])
                  setOpen(false)
                }}
              >
                <span
                  className="quick-edit-calendar-swatch"
                  style={{
                    backgroundColor: 'transparent',
                    borderRadius: '0.2rem',
                    boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.18)'
                  }}
                />
                <span className="quick-edit-calendar-name">없음</span>
              </button>
              {sortedTags.length === 0 ? (
                <div className="quick-edit-calendar-empty">등록된 태그가 없습니다</div>
              ) : null}
              {sortedTags.map((tag) => {
                const isActive = selectedIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={`quick-edit-calendar-option${isActive ? ' is-active' : ''}`}
                    onClick={() => toggleTag(tag.id)}
                  >
                    <span
                      className="quick-edit-calendar-swatch"
                      style={{
                        backgroundColor: tag.color || '#9aa0a6',
                        borderRadius: '0.2rem'
                      }}
                    />
                    <span className="quick-edit-calendar-name">{tag.name}</span>
                  </button>
                )
              })}
            </InteractionUI>,
            document.body
          )
        : null}
    </div>
  )
}

export default QuickEditTagButton
