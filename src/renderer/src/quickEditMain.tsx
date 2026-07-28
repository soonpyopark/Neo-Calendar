import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppDialogProvider } from './components/AppDialogProvider'
import { QuickEditWindowApp } from './components/QuickEditWindowApp'
import { installTextInputFocusBridge } from './lib/textInputFocus'
import { bootstrapPanelWindowTheme } from './lib/colorScheme'
import './index.css'

document.documentElement.classList.add('neo-quick-edit-window')
bootstrapPanelWindowTheme()

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element #root not found')
}

installTextInputFocusBridge()

createRoot(container).render(
  <StrictMode>
    <AppDialogProvider>
      <QuickEditWindowApp />
    </AppDialogProvider>
  </StrictMode>
)
