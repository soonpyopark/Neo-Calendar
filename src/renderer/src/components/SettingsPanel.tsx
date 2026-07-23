import { useEffect, useState, type ReactElement } from 'react'
import { InteractionUI } from './InteractionUI'
import type { AppSettings } from '../../../shared/ipc'

export type SettingsPanelProps = {
  open: boolean
  settings: AppSettings | null
  onClose: () => void
  onSave: (patch: Partial<AppSettings>) => void | Promise<void>
}

export function SettingsPanel({
  open,
  settings,
  onClose,
  onSave
}: SettingsPanelProps): ReactElement | null {
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(0)
  const [headerOpacity, setHeaderOpacity] = useState(0.62)
  const [shellOpacity, setShellOpacity] = useState(0.35)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!settings) return
    setWeekStartsOn(settings.weekStartsOn)
    setHeaderOpacity(settings.headerOpacity)
    setShellOpacity(settings.shellOpacity)
  }, [settings, open])

  if (!open) return null

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave({ weekStartsOn, headerOpacity, shellOpacity })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel-backdrop interaction-ui" role="presentation" onClick={onClose}>
      <InteractionUI
        className="panel-card settings-panel"
        role="dialog"
        aria-label="설정"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-card-header">
          <h2>설정</h2>
          <button type="button" className="panel-close" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-body">
          <label className="settings-field">
            <span>주 시작일</span>
            <select
              value={weekStartsOn}
              onChange={(e) => setWeekStartsOn(Number(e.target.value) === 1 ? 1 : 0)}
            >
              <option value={0}>일요일</option>
              <option value={1}>월요일</option>
            </select>
          </label>

          <label className="settings-field">
            <span>헤더 불투명도 ({Math.round(headerOpacity * 100)}%)</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.01}
              value={headerOpacity}
              onChange={(e) => setHeaderOpacity(Number(e.target.value))}
            />
          </label>

          <label className="settings-field">
            <span>캘린더 불투명도 ({Math.round(shellOpacity * 100)}%)</span>
            <input
              type="range"
              min={0.15}
              max={1}
              step={0.01}
              value={shellOpacity}
              onChange={(e) => setShellOpacity(Number(e.target.value))}
            />
          </label>

          <p className="settings-note">
            바탕화면 모드는 현재 창의 위치·크기를 유지한 채 클릭스루 데스크톱 오버레이로 고정합니다.
          </p>
        </div>

        <div className="panel-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button type="button" className="is-primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </InteractionUI>
    </div>
  )
}

export default SettingsPanel
