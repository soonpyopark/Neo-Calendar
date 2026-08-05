import { useEffect, useState, type ReactElement } from 'react'
import type { PanelWindowInit } from '../../../shared/panelWindows'
import { QuickEditPanelHost } from './panelHosts/QuickEditPanelHost'
import { EventEditorPanelHost } from './panelHosts/EventEditorPanelHost'
import { SettingsPanelHost } from './panelHosts/SettingsPanelHost'
import { SearchPanelHost } from './panelHosts/SearchPanelHost'
import { EventDetailPanelHost } from './panelHosts/EventDetailPanelHost'
import { ExportOptionsPanelHost } from './panelHosts/ExportOptionsPanelHost'
import { RecurrenceScopePanelHost } from './panelHosts/RecurrenceScopePanelHost'
import { LoginPanelHost } from './panelHosts/LoginPanelHost'
import { DayListPreviewPanelHost } from './panelHosts/DayListPreviewPanelHost'
import { EventResourceListPanelHost } from './panelHosts/EventResourceListPanelHost'
import { AttachmentViewerPanelHost } from './panelHosts/AttachmentViewerPanelHost'
import { HeaderTitleEditorPanelHost } from './panelHosts/HeaderTitleEditorPanelHost'
import { FooterHelpPanelHost } from './panelHosts/FooterHelpPanelHost'

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
    case 'exportOptions':
      return <ExportOptionsPanelHost init={init} />
    case 'recurrenceScope':
      return <RecurrenceScopePanelHost init={init} />
    case 'login':
      return <LoginPanelHost init={init} />
    case 'dayListPreview':
      return <DayListPreviewPanelHost init={init} />
    case 'eventResourceList':
      return <EventResourceListPanelHost init={init} />
    case 'attachmentViewer':
      return <AttachmentViewerPanelHost init={init} />
    case 'headerTitleEditor':
      return <HeaderTitleEditorPanelHost />
    case 'footerHelp':
      return <FooterHelpPanelHost />
    default:
      return null
  }
}

export default PanelApp
