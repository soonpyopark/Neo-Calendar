import { useEffect, useState, type ReactElement } from 'react'
import { WallpaperContainer } from './components/WallpaperContainer'
import { CalendarGrid } from './components/CalendarGrid'
import { WindowResizeHandles } from './components/WindowResizeHandles'
import { isBrowserNeoCalendarHost } from './lib/browserNeoCalendar'
import type { AppSettings, AuthUser, LaunchMode, ModeStatus } from '../../shared/ipc'

function applyOpacitySettings(settings: AppSettings): void {
  const root = document.documentElement
  root.style.setProperty('--neo-header-opacity', String(settings.headerOpacity))
  root.style.setProperty('--neo-shell-opacity', String(settings.shellOpacity))
}

export default function App(): ReactElement {
  const [mode, setMode] = useState<LaunchMode>('window')
  /** True only while WorkerW-embedded (not while temporarily undocked). */
  const [embedded, setEmbedded] = useState(false)
  const [switchReady, setSwitchReady] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    // Match first-run defaults before settings IPC returns.
    document.documentElement.style.setProperty('--neo-header-opacity', '1')
    document.documentElement.style.setProperty('--neo-shell-opacity', '1')

    const api = window.neoCalendar
    if (!api) {
      setAuthReady(true)
      return
    }

    void api.getModeStatus().then((status: ModeStatus) => {
      setMode(status.mode)
      setEmbedded(status.embedded)
      setSwitchReady(status.switchReady !== false)
    })
    void api.getAuth().then((next) => {
      setUser(next)
      setAuthReady(true)
    })
    void api.getSettings().then((next) => {
      setSettings(next)
      applyOpacitySettings(next)
    })

    return api.onModeChanged((status) => {
      setMode(status.mode)
      setEmbedded(status.embedded)
      setSwitchReady(status.switchReady !== false)
    })
  }, [])

  const handleSettingsSaved = async (patch: Partial<AppSettings>): Promise<void> => {
    const next = await window.neoCalendar.patchSettings(patch)
    setSettings(next)
    applyOpacitySettings(next)
  }

  // Undocked desktop must behave like window mode for mouse/scroll/IME.
  // Click-through only while actually under icons.
  const clickThrough = mode === 'desktop' && embedded

  return (
    <WallpaperContainer clickThrough={clickThrough}>
      <CalendarGrid
        mode={mode}
        embedded={embedded}
        switchReady={switchReady}
        user={user}
        authReady={authReady}
        settings={settings}
        onUserChange={setUser}
        onModeChange={setMode}
        onSettingsSaved={handleSettingsSaved}
      />
      {mode === 'window' && !isBrowserNeoCalendarHost() ? <WindowResizeHandles /> : null}
    </WallpaperContainer>
  )
}
