/// <reference types="vite/client" />

import type { NeoCalendarApi } from '../../shared/ipc'

declare global {
  interface Window {
    neoCalendar: NeoCalendarApi
  }
}

export {}
