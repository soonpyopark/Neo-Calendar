import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppDialogProvider } from './components/AppDialogProvider'
import { AttachmentViewerProvider } from './components/AttachmentViewerProvider'
import { installBrowserNeoCalendar } from './lib/browserNeoCalendar'
import { installTextInputFocusBridge } from './lib/textInputFocus'
import './index.css'

// Browser (HTTP) host: polyfill window.neoCalendar before React mounts.
installBrowserNeoCalendar()

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element #root not found')
}

installTextInputFocusBridge()

createRoot(container).render(
  <StrictMode>
    <AppDialogProvider>
      <AttachmentViewerProvider>
        <App />
      </AttachmentViewerProvider>
    </AppDialogProvider>
  </StrictMode>
)
