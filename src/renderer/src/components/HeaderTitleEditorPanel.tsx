import { useEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { HeaderTitleOptions } from '../../../shared/calendarTypes'
import {
  HEADER_TITLE_FONT_MAX,
  HEADER_TITLE_FONT_MIN,
  HEADER_TITLE_MAX_LEN,
  normalizeHeaderTitle
} from '../../../shared/headerTitle'
import { insertTextAtCursor } from '../lib/insertAtCursor'
import { setIgnoreMouseEvents } from '../lib/mouseBridge'
import { CalendarColorPalette } from './CalendarColorPalette'
import { EmojiPickerButton } from './EmojiPickerButton'
import { InteractionUI } from './InteractionUI'

export type HeaderTitleEditorPanelProps = {
  open: boolean
  value: HeaderTitleOptions | null | undefined
  /** Floating panel shell omits backdrop; inline modal uses one. */
  variant?: 'floating' | 'inline'
  onClose: () => void
  onChange: (next: HeaderTitleOptions) => void
}

export function HeaderTitleEditorPanel({
  open,
  value,
  variant = 'inline',
  onClose,
  onChange
}: HeaderTitleEditorPanelProps): ReactElement | null {
  const [draft, setDraft] = useState(() => normalizeHeaderTitle(value))
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft(normalizeHeaderTitle(value))
    setIgnoreMouseEvents(false)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Let the emoji picker close first when its panel is open.
      if (document.querySelector('.emoji-picker-panel--header-title')) {
        return
      }
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const persist = (patch: Partial<HeaderTitleOptions>): void => {
    const next = normalizeHeaderTitle({ ...draft, ...patch, enabled: true })
    setDraft(next)
    onChange(next)
  }

  const insertEmoji = (emoji: string): void => {
    const el = inputRef.current
    const { nextValue, nextPos } = insertTextAtCursor(el, draft.text, emoji)
    const text = nextValue.slice(0, HEADER_TITLE_MAX_LEN)
    const next = normalizeHeaderTitle({ ...draft, text, enabled: true })
    setDraft(next)
    onChange(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(Math.min(nextPos, text.length), Math.min(nextPos, text.length))
    })
  }

  const body = (
    <InteractionUI
      className={
        variant === 'floating'
          ? 'header-title-editor-panel header-title-editor-panel--floating neo-modal-shell'
          : 'header-title-editor-panel neo-modal-shell'
      }
      role="dialog"
      aria-label="내 캘린더 이름 편집"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="header-title-editor-header neo-modal-shell-header">
        <h2 className="header-title-editor-title">내 캘린더 이름</h2>
        <button
          type="button"
          className="header-title-editor-close"
          aria-label="닫기"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="header-title-editor-body">
        <div className="header-title-editor-field">
          <span className="header-title-editor-label">
            이름 ({draft.text.length}/{HEADER_TITLE_MAX_LEN})
          </span>
          <div className="header-title-editor-name-row">
            <EmojiPickerButton
              title="이모지 추가"
              panelClassName="emoji-picker-panel--header-title"
              onSelect={insertEmoji}
            />
            <input
              ref={inputRef}
              type="text"
              className="header-title-editor-input"
              value={draft.text}
              maxLength={HEADER_TITLE_MAX_LEN}
              placeholder="😎 당신을 위한 데스크톱 캘린더"
              autoFocus
              onChange={(event) => {
                const text = event.target.value.slice(0, HEADER_TITLE_MAX_LEN)
                setDraft((prev) => ({ ...prev, text }))
              }}
              onBlur={() => persist({ text: draft.text })}
            />
          </div>
        </div>

        <label className="header-title-editor-field">
          <span className="header-title-editor-label">글자 크기 ({draft.fontSizePx}px)</span>
          <input
            type="range"
            min={HEADER_TITLE_FONT_MIN}
            max={HEADER_TITLE_FONT_MAX}
            step={1}
            value={draft.fontSizePx}
            className="header-title-editor-range"
            onChange={(event) => persist({ fontSizePx: Number(event.target.value) })}
          />
        </label>

        <div className="header-title-editor-field">
          <span className="header-title-editor-label">글자 색상</span>
          <CalendarColorPalette
            value={draft.color}
            onChange={(color) => persist({ color })}
          />
        </div>

        <div
          className="header-title-editor-preview"
          style={{
            color: draft.color,
            fontSize: `${draft.fontSizePx}px`,
            fontWeight: 600,
            lineHeight: 1.25
          }}
          aria-hidden="true"
        >
          {draft.text.trim() || '미리보기'}
        </div>
      </div>
    </InteractionUI>
  )

  if (variant === 'floating') {
    return body
  }

  // Browser / unlocked desktop: same transparent overlay stack as search & settings.
  return createPortal(
    <div
      className="header-title-editor-backdrop interaction-ui fixed inset-0 z-[55]"
      role="presentation"
      onClick={onClose}
      onMouseEnter={() => setIgnoreMouseEvents(false)}
      onMouseLeave={() => setIgnoreMouseEvents(true, { forwardToOverlay: true })}
    >
      <div
        className="pointer-events-none fixed inset-0 z-[56] flex items-center justify-center"
        role="presentation"
      >
        <div
          className="header-title-editor-inline-wrap pointer-events-auto relative z-[1] shadow-[0_8px_28px_rgba(0,0,0,0.18)]"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {body}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default HeaderTitleEditorPanel
