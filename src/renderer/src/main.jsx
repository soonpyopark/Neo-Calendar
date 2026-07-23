import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import { AppDialogProvider } from './components/AppDialogProvider.jsx';
import DesktopShell from './neo/DesktopShell.jsx';
import { bootstrapColorScheme } from './lib/colorScheme.js';
import { bootstrapAccentColor } from './lib/accentColor.js';
import './index.css';
import './neo/desktop-overlay.css';

// Apply cached/system theme before first paint of React tree.
bootstrapColorScheme();
bootstrapAccentColor();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AppDialogProvider>
        <DesktopShell>
          <App />
        </DesktopShell>
      </AppDialogProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
