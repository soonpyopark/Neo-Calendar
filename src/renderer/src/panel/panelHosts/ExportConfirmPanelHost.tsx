import { useCallback, useState, type ReactElement } from 'react'
import { InteractionUI } from '../../components/InteractionUI'
import { useAppDialog } from '../../components/AppDialogProvider'
import { useCalendarStore } from '../../hooks/useCalendarStore'
import type { PanelWindowInit } from '../../../../shared/panelWindows'
import { usePanelRouter, usePanelTheme } from '../usePanelEventHelpers'

type Init = Extract<PanelWindowInit, { kind: 'exportConfirm' }>

export function ExportConfirmPanelHost({ init }: { init: Init }): ReactElement | null {
  const { closePanel } = usePanelRouter()
  const { alert } = useAppDialog()
  const { store, loading } = useCalendarStore()
  const [busy, setBusy] = useState(false)
  usePanelTheme(store.settings)

  const formatLabel = init.format === 'excel' ? 'Excel' : 'PDF'
  const message = `${init.year}년 ${init.month}월 일정을 ${formatLabel} 파일로 저장하시겠습니까?`

  const handleCancel = useCallback((): void => {
    if (busy) return
    closePanel()
  }, [busy, closePanel])

  const handleConfirm = useCallback(async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const result = await window.neoCalendar.exportCalendar({
        format: init.format,
        year: init.year,
        month: init.month,
        asAdmin: true
      })
      if (result.canceled) {
        closePanel()
        return
      }
      if (!result.ok) {
        await alert(result.error || `${formatLabel} 내보내기에 실패했습니다.`)
        closePanel()
        return
      }
      await alert(`${init.year}년 ${init.month}월 일정을 ${formatLabel} 파일로 저장했습니다.`)
      closePanel()
    } catch (error) {
      await alert(error instanceof Error ? error.message : `${formatLabel} 내보내기에 실패했습니다.`)
      closePanel()
    } finally {
      setBusy(false)
    }
  }, [alert, busy, closePanel, formatLabel, init.format, init.month, init.year])

  if (loading) return null

  return (
    <div className="neo-panel-shell h-screen w-screen overflow-hidden p-2">
      <div
        className="export-confirm-shell shell-solid-surface flex h-full flex-col overflow-hidden rounded-xl border border-[var(--gcal-border)] shadow-[0_8px_28px_rgba(0,0,0,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-confirm-message"
      >
        <p
          id="export-confirm-message"
          className="flex-1 whitespace-pre-line px-6 py-6 text-sm leading-relaxed text-gcal-body"
        >
          {message}
        </p>
        <div className="flex justify-end gap-2 border-t border-[#cccccc] px-4 py-3">
          <InteractionUI
            as="button"
            type="button"
            className="rounded-full px-5 py-2 text-sm font-medium text-gcal-body transition-colors hover:bg-gcal-surface-2 disabled:opacity-50"
            disabled={busy}
            onClick={handleCancel}
          >
            취소
          </InteractionUI>
          <InteractionUI
            as="button"
            type="button"
            className="rounded-full bg-gcal-blue px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1765cc] disabled:opacity-50"
            disabled={busy}
            onClick={() => void handleConfirm()}
          >
            {busy ? '저장 중…' : '확인'}
          </InteractionUI>
        </div>
      </div>
    </div>
  )
}

export default ExportConfirmPanelHost
