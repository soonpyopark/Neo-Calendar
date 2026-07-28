import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppDialogProvider } from './components/AppDialogProvider'
import { PanelApp } from './panel/PanelApp'
import { installTextInputFocusBridge } from './lib/textInputFocus'
import { bootstrapPanelWindowTheme } from './lib/colorScheme'
import './index.css'

document.documentElement.classList.add('neo-panel-window')
bootstrapPanelWindowTheme()

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element #root not found')
}

installTextInputFocusBridge()

createRoot(container).render(
  <StrictMode>
    <div className="neo-panel-shell h-screen w-screen overflow-hidden">
      <AppDialogProvider>
        <PanelApp />
      </AppDialogProvider>
    </div>
  </StrictMode>
)
