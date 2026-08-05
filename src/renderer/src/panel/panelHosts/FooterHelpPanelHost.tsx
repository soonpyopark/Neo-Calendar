import { type ReactElement } from 'react'
import { FooterHelpPanel } from '../../components/FooterHelpPanel'
import { usePanelRouter } from '../usePanelEventHelpers'

export function FooterHelpPanelHost(): ReactElement {
  const { closePanel } = usePanelRouter()

  return (
    <div className="neo-panel-shell h-screen w-screen overflow-hidden">
      <FooterHelpPanel surface="floating" open onClose={closePanel} />
    </div>
  )
}

export default FooterHelpPanelHost
