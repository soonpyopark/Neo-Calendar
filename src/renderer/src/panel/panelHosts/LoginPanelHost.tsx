import { useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { LoginDialog } from '../../components/LoginDialog'
import { useCalendarStore } from '../../hooks/useCalendarStore'
import type { PanelWindowInit } from '../../../../shared/panelWindows'
import { usePanelRouter, usePanelTheme } from '../usePanelEventHelpers'

type Init = Extract<PanelWindowInit, { kind: 'login' }>

const PANEL_CHROME_PAD = 16

export function LoginPanelHost({ init }: { init: Init }): ReactElement {
  const { closePanel } = usePanelRouter()
  const { store, loading } = useCalendarStore()
  usePanelTheme(store.settings, loading)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root) return undefined

    const fitToContent = (): void => {
      const api = window.neoCalendar
      if (!api?.resizePanelWindow) return
      const height = Math.ceil(root.offsetHeight + PANEL_CHROME_PAD)
      const width = Math.ceil(root.offsetWidth + PANEL_CHROME_PAD)
      void api.resizePanelWindow({ width, height })
    }

    fitToContent()
    const observer = new ResizeObserver(fitToContent)
    observer.observe(root)
    return () => observer.disconnect()
  }, [busy, error])

  const handleLogin = async (
    loginId: string,
    password: string,
    remember: boolean
  ): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.neoCalendar.login(loginId, password, remember)
      if (!result.ok) {
        setError(result.error)
        return
      }
      closePanel()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="neo-panel-shell h-screen w-screen overflow-hidden p-2">
      <div ref={measureRef} className="w-full shrink-0">
        <LoginDialog
          surface="floating"
          open
          busy={busy}
          error={error}
          dismissible={init.dismissible !== false}
          onClose={closePanel}
          onSubmit={handleLogin}
        />
      </div>
    </div>
  )
}

export default LoginPanelHost
