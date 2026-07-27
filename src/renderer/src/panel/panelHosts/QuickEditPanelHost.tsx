import type { ReactElement } from 'react'
import { QuickEditWindowApp } from '../../components/QuickEditWindowApp'
import type { PanelWindowInit } from '../../../shared/panelWindows'

type Init = Extract<PanelWindowInit, { kind: 'quickEdit' }>

/** Quick edit uses the existing floating window app (panel init via legacy getQuickEditInit). */
export function QuickEditPanelHost(_props: { init: Init }): ReactElement {
  return <QuickEditWindowApp />
}

export default QuickEditPanelHost
