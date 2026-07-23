import { useEffect, useState, type ReactElement } from 'react'
import { WallpaperContainer } from './components/WallpaperContainer'
import { CalendarGrid } from './components/CalendarGrid'
import { WindowResizeHandles } from './components/WindowResizeHandles'
import type { AppSettings, AuthUser, LaunchMode, ModeStatus } from '../../shared/ipc'

function applyOpacitySettings(settings: AppSettings): void {
  const root = document.documentElement
  root.style.setProperty('--neo-header-opacity', String(settings.headerOpacity))
  root.style.setProperty('--neo-shell-opacity', String(settings.shellOpacity))
}

export default function App(): ReactElement {
  const [mode, setMode] = useState<LaunchMode>('window')
  const [switchReady, setSwitchReady] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    const api = window.neoCalendar
    if (!api) return

    void api.getModeStatus().then((status: ModeStatus) => {
      setMode(status.mode)
      setSwitchReady(status.switchReady !== false)
    })
    void api.getAuth().then(setUser)
    void api.getSettings().then((next) => {
      setSettings(next)
      applyOpacitySettings(next)
    })

    return api.onModeChanged((status) => {
      setMode(status.mode)
      setSwitchReady(status.switchReady !== false)
    })
  }, [])

  const handleSettingsSaved = async (patch: Partial<AppSettings>): Promise<void> => {
    const next = await window.neoCalendar.patchSettings(patch)
    setSettings(next)
    applyOpacitySettings(next)
  }

  return (
    <WallpaperContainer clickThrough={mode === 'desktop'}>
      <CalendarGrid
        mode={mode}
        switchReady={switchReady}
        user={user}
        settings={settings}
        onUserChange={setUser}
        onModeChange={setMode}
        onSettingsSaved={handleSettingsSaved}
      />
      {mode === 'window' ? <WindowResizeHandles /> : null}
    </WallpaperContainer>
  )
}
