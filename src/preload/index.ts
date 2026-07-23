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
import type {
  CalendarEvent,
  CalendarRecord,
  CalendarStoreSnapshot,
  EventInput,
  MemberRecord,
  MemberSaveInput,
  StoreSettings,
  TagRecord
} from '../shared/calendarTypes'

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
  setClickForwardHitZones: (zones: ClientHitRect[]) => {
    ipcRenderer.send('set-click-forward-hit-zones', zones)
  },
  setDayCellHitZones: (zones: DayCellHitZone[]) => {
    ipcRenderer.send('set-day-cell-hit-zones', zones)
  },
  setInteractionBusy: (busy: boolean) => {
    ipcRenderer.send('set-interaction-busy', Boolean(busy))
  },
  focusForTextInput: () => {
    ipcRenderer.send('focus-for-text-input')
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
    ipcRenderer.invoke('patch-settings', patch) as Promise<AppSettings>,
  getCalendarStore: () =>
    ipcRenderer.invoke('calendar:get-store') as Promise<CalendarStoreSnapshot>,
  patchStoreSettings: (patch: Partial<StoreSettings>) =>
    ipcRenderer.invoke('calendar:patch-settings', patch) as Promise<CalendarStoreSnapshot>,
  replaceCalendarStore: (store: CalendarStoreSnapshot) =>
    ipcRenderer.invoke('calendar:replace-store', store) as Promise<CalendarStoreSnapshot>,
  addEvent: (input: EventInput) =>
    ipcRenderer.invoke('calendar:add-event', input) as Promise<CalendarEvent>,
  editEvent: (id: string, patch: Partial<CalendarEvent>) =>
    ipcRenderer.invoke('calendar:edit-event', id, patch) as Promise<CalendarEvent>,
  removeEvent: (id: string) => ipcRenderer.invoke('calendar:remove-event', id) as Promise<void>,
  createCalendar: (input: Partial<CalendarRecord> & { name: string; color: string }) =>
    ipcRenderer.invoke('calendar:create-calendar', input) as Promise<CalendarRecord>,
  patchCalendar: (id: string, patch: Partial<CalendarRecord>) =>
    ipcRenderer.invoke('calendar:patch-calendar', id, patch) as Promise<CalendarRecord>,
  deleteCalendar: (id: string) =>
    ipcRenderer.invoke('calendar:delete-calendar', id) as Promise<void>,
  setTags: (tags: TagRecord[]) =>
    ipcRenderer.invoke('calendar:set-tags', tags) as Promise<TagRecord[]>,
  listMembers: () => ipcRenderer.invoke('calendar:list-members') as Promise<MemberRecord[]>,
  saveMembers: (members: MemberSaveInput[]) =>
    ipcRenderer.invoke('calendar:save-members', members) as Promise<MemberRecord[]>,
  syncHolidays: (input) =>
    ipcRenderer.invoke('calendar:sync-holidays', input ?? {}) as ReturnType<
      NeoCalendarApi['syncHolidays']
    >,
  exportCalendar: (input) =>
    ipcRenderer.invoke('calendar:export', input) as ReturnType<NeoCalendarApi['exportCalendar']>,
  getDataRoot: () => ipcRenderer.invoke('calendar:get-data-root') as Promise<string>,
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url) as Promise<void>
}

contextBridge.exposeInMainWorld('neoCalendar', api)

export type { NeoCalendarApi, SetIgnoreMouseOptions }
