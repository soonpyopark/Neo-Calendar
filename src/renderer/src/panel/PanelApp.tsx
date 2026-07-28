import { useEffect, useState, type ReactElement } from 'react'
import type { PanelWindowInit } from '../../../shared/panelWindows'
import { QuickEditPanelHost } from './panelHosts/QuickEditPanelHost'
import { EventEditorPanelHost } from './panelHosts/EventEditorPanelHost'
import { SettingsPanelHost } from './panelHosts/SettingsPanelHost'
import { SearchPanelHost } from './panelHosts/SearchPanelHost'
import { EventDetailPanelHost } from './panelHosts/EventDetailPanelHost'
import { ExportConfirmPanelHost } from './panelHosts/ExportConfirmPanelHost'
import { LoginPanelHost } from './panelHosts/LoginPanelHost'

export function PanelApp(): ReactElement | null {
  const [init, setInit] = useState<PanelWindowInit | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const payload = await window.neoCalendar.getPanelInit?.()
        if (cancelled) return
        if (payload?.kind) {
          setInit(payload)
        }
      } catch (error) {
        console.error('[panel-window] init failed', error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!init) return null

  switch (init.kind) {
    case 'quickEdit':
      return <QuickEditPanelHost init={init} />
    case 'eventEditor':
      return <EventEditorPanelHost init={init} />
    case 'settings':
      return <SettingsPanelHost />
    case 'search':
      return <SearchPanelHost init={init} />
    case 'eventDetail':
      return <EventDetailPanelHost init={init} />
    case 'exportConfirm':
      return <ExportConfirmPanelHost init={init} />
    case 'login':
      return <LoginPanelHost init={init} />
    default:
      return null
  }
}

export default PanelApp
