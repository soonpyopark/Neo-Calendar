import { useCallback, useLayoutEffect, useRef, type ReactElement } from 'react'
import { HeaderTitleEditorPanel } from '../../components/HeaderTitleEditorPanel'
import { useCalendarStore } from '../../hooks/useCalendarStore'
import { useAppDialog } from '../../components/AppDialogProvider'
import { normalizeHeaderTitle } from '../../../../shared/headerTitle'
import type { HeaderTitleOptions } from '../../../../shared/calendarTypes'
import { usePanelRouter, usePanelTheme } from '../usePanelEventHelpers'

export function HeaderTitleEditorPanelHost(): ReactElement | null {
  const { closePanel } = usePanelRouter()
  const { alert } = useAppDialog()
  const { store, loading, patchStoreSettings } = useCalendarStore()
  usePanelTheme(store.settings, loading)
  const measureRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root) return undefined

    const fitToContent = (): void => {
      const api = window.neoCalendar
      if (!api?.resizePanelWindow) return
      const height = Math.ceil(root.offsetHeight)
      const width = Math.ceil(root.offsetWidth)
      if (width < 280 || height < 200) return
      void api.resizePanelWindow({ width, height })
    }

    fitToContent()
    const observer = new ResizeObserver(fitToContent)
    observer.observe(root)
    return () => observer.disconnect()
  }, [loading, store.settings.viewOptions.headerTitle])

  const handleChange = useCallback(
    (next: HeaderTitleOptions) => {
      void patchStoreSettings({
        viewOptions: {
          ...store.settings.viewOptions,
          headerTitle: normalizeHeaderTitle({ ...next, enabled: true })
        }
      }).catch(async (error) => {
        await alert(
          error instanceof Error ? error.message : '캘린더 이름을 저장하지 못했습니다.'
        )
      })
    },
    [alert, patchStoreSettings, store.settings.viewOptions]
  )

  if (loading) return null

  return (
    <div className="neo-panel-shell flex h-screen w-screen items-start justify-start overflow-hidden">
      <div ref={measureRef} className="w-fit shrink-0">
        <HeaderTitleEditorPanel
          open
          variant="floating"
          value={store.settings.viewOptions.headerTitle}
          onClose={closePanel}
          onChange={handleChange}
        />
      </div>
    </div>
  )
}

export default HeaderTitleEditorPanelHost
