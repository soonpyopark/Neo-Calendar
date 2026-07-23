import { contextBridge, ipcRenderer } from 'electron'
import type { NeoCalendarApi, SetIgnoreMouseOptions } from '../shared/ipc'

const api: NeoCalendarApi = {
  setIgnoreMouse: (ignore: boolean, options: SetIgnoreMouseOptions = { forwardToOverlay: true }) => {
    ipcRenderer.send('set-ignore-mouse', ignore, options)
  }
}

contextBridge.exposeInMainWorld('neoCalendar', api)

export type { NeoCalendarApi, SetIgnoreMouseOptions }
