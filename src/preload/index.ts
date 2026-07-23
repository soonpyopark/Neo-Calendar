import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  ClientHitRect,
  DayCellHitZone,
  LoginResult,
  ModeStatus,
  NeoCalendarApi,
  OpenDayQuickEditPayload,
  SetIgnoreMouseOptions
} from '../shared/ipc'

const api: NeoCalendarApi = {
  setIgnoreMouse: (ignore: boolean, options: SetIgnoreMouseOptions = { forwardToOverlay: true }) => {
    ipcRenderer.send('set-ignore-mouse', ignore, options)
  },
  getModeStatus: () => ipcRenderer.invoke('get-mode-status') as Promise<ModeStatus>,
  enterDesktop: () => ipcRenderer.invoke('enter-desktop') as Promise<ModeStatus>,
  enterWindow: () => ipcRenderer.invoke('enter-window') as Promise<ModeStatus>,
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  setWindowBounds: (bounds) => ipcRenderer.invoke('set-window-bounds', bounds),
  setWindowModeHitZone: (rect: ClientHitRect | null) => {
    ipcRenderer.send('set-window-mode-hit-zone', rect)
  },
  setHeaderHitZone: (rect: ClientHitRect | null) => {
    ipcRenderer.send('set-header-hit-zone', rect)
  },
  setWakeHitZones: (zones: ClientHitRect[]) => {
    ipcRenderer.send('set-wake-hit-zones', zones)
  },
  setDayCellHitZones: (zones: DayCellHitZone[]) => {
    ipcRenderer.send('set-day-cell-hit-zones', zones)
  },
  setInteractionBusy: (busy: boolean) => {
    ipcRenderer.send('set-interaction-busy', Boolean(busy))
  },
  onModeChanged: (listener: (status: ModeStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: ModeStatus): void => {
      listener(status)
    }
    ipcRenderer.on('mode-changed', handler)
    return () => {
      ipcRenderer.removeListener('mode-changed', handler)
    }
  },
  onOpenDayQuickEdit: (listener: (payload: OpenDayQuickEditPayload) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: OpenDayQuickEditPayload
    ): void => {
      listener(payload)
    }
    ipcRenderer.on('open-day-quick-edit', handler)
    return () => {
      ipcRenderer.removeListener('open-day-quick-edit', handler)
    }
  },
  getAuth: () => ipcRenderer.invoke('get-auth'),
  login: (loginId: string, password: string, remember?: boolean) =>
    ipcRenderer.invoke('login', loginId, password, remember) as Promise<LoginResult>,
  logout: () => ipcRenderer.invoke('logout') as Promise<void>,
  getSettings: () => ipcRenderer.invoke('get-settings') as Promise<AppSettings>,
  patchSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke('patch-settings', patch) as Promise<AppSettings>
}

contextBridge.exposeInMainWorld('neoCalendar', api)

export type { NeoCalendarApi, SetIgnoreMouseOptions }
