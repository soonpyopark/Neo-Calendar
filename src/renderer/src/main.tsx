import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installTextInputFocusBridge } from './lib/textInputFocus'
import './index.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element #root not found')
}

installTextInputFocusBridge()

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
