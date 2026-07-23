import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { join } from 'node:path'
import { AuthService } from './auth'
import { CalendarStore } from './calendarStore/CalendarStore'
import { MembersStore } from './calendarStore/membersStore'
import { DesktopModeController } from './desktopMode'
import { getEnvValue, loadDotEnv } from './dotEnv'
import { applyHolidayKeyFromEnv, syncKoreanHolidays } from './calendarStore/holidaySync'
import { exportCalendarMonth } from './export/exportService'
import { SettingsStore } from './settingsStore'
import { createAppTray, type AppTray } from './tray'
import { DayCellDblClickBridge, type DayCellClientZone } from './dayCellDblClickBridge'
import { DesktopInputBridge } from './desktopInputBridge'
import { withWallpaperApi, type WallpaperBrowserWindow } from './wallpaper'
import { WindowModeHitZone } from './windowModeHitZone'
import { snapToTen } from './displayGeometry'
import { APP_NAME, DEFAULT_WIDGET_BOUNDS } from '../shared/constants'
import type {
  CalendarEvent,
  CalendarRecord,
  CalendarStoreSnapshot,
  EventInput,
  MemberSaveInput,
  StoreSettings,
  SyncHolidaysInput,
  TagRecord
} from '../shared/calendarTypes'
import type { AppSettings, ClientHitRect, DayCellHitZone, ModeStatus } from '../shared/ipc'

let mainWindow: WallpaperBrowserWindow | null = null
let calendarStore: CalendarStore
let membersStore: MembersStore
let settingsStore: SettingsStore
let auth: AuthService
let desktopMode: DesktopModeController
let tray: AppTray | null = null
let windowModeHitZone: WindowModeHitZone | null = null
let desktopInputBridge: DesktopInputBridge | null = null
let dayCellDblClickBridge: DayCellDblClickBridge | null = null
let dayCellClientZones: DayCellClientZone[] = []
let interactionBusy = false

function broadcastMode(status: ModeStatus): void {
  mainWindow?.webContents.send('mode-changed', status)
  tray?.rebuildMenu?.()
}

function createWindow(): void {
  const saved = settingsStore.getSettings().widget.bounds ?? DEFAULT_WIDGET_BOUNDS
  // Prefer the monitor of the last footprint; otherwise the monitor under the cursor.
  const anchor = {
    x: Math.round(saved.x + saved.width / 2),
    y: Math.round(saved.y + saved.height / 2)
  }
  const hasSaved = Number.isFinite(saved.x) && Number.isFinite(saved.y)
  const display = hasSaved
    ? screen.getDisplayNearestPoint(anchor)
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const startWidth = Math.min(Math.max(640, snapToTen(saved.width)), area.width)
  const startHeight = Math.min(Math.max(480, snapToTen(saved.height)), area.height)
  const startX = snapToTen(
    Math.min(
      Math.max(hasSaved ? saved.x : area.x + Math.round((area.width - startWidth) / 2), area.x),
      area.x + Math.max(0, area.width - startWidth)
    )
  )
  const startY = snapToTen(
    Math.min(
      Math.max(hasSaved ? saved.y : area.y + Math.round((area.height - startHeight) / 2), area.y),
      area.y + Math.max(0, area.height - startHeight)
    )
  )

  const win = withWallpaperApi(
    new BrowserWindow({
      x: startX,
      y: startY,
      width: startWidth,
      height: startHeight,
      frame: false,
      transparent: true,
      skipTaskbar: false,
      resizable: true,
      movable: true,
      maximizable: true,
      minimizable: true,
      fullscreenable: false,
      hasShadow: true,
      focusable: true,
      show: false,
      backgroundColor: '#00000000',
      title: APP_NAME,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
  )

  mainWindow = win

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.once('ready-to-show', () => {
    desktopMode.restoreFromSettings()
  })

  // Window mode: keep footprint in sync while dragging/resizing.
  const persistBounds = (): void => {
    if (desktopMode.getLaunchMode() === 'window') {
      desktopMode.persistWindowBounds()
    }
  }
  win.on('moved', persistBounds)
  win.on('resized', persistBounds)
  win.on('close', () => {
    desktopMode.persistSession()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    mainWindow = null
  })
}

function registerIpc(): void {
  ipcMain.on(
    'set-ignore-mouse',
    (_event, ignore: boolean, options?: { forward?: boolean; forwardToOverlay?: boolean }) => {
      if (!mainWindow) return
      // Mode-switch swallow: do not let renderer clear ignore-mouse early.
      if (desktopMode.isInputLocked()) {
        mainWindow.setIgnoreMouseEvents(true)
        return
      }
      if (desktopMode.getLaunchMode() === 'window') {
        mainWindow.setIgnoreMouseEvents(false)
        return
      }
      const shouldForward = options?.forwardToOverlay ?? options?.forward ?? true
      if (ignore) {
        mainWindow.setIgnoreMouseEvents(true, { forward: shouldForward })
      } else {
        mainWindow.setIgnoreMouseEvents(false)
      }
    }
  )

  ipcMain.on('set-window-mode-hit-zone', (_event, rect: ClientHitRect | null) => {
    windowModeHitZone?.setClientRect(rect ?? null)
  })

  ipcMain.on('set-header-hit-zone', (_event, rect: ClientHitRect | null) => {
    if (rect && rect.height > 0) {
      desktopMode.setHeaderHitHeight(Math.round(rect.height + rect.y))
    }
  })

  ipcMain.on('set-wake-hit-zones', (_event, zones: ClientHitRect[] | null) => {
    desktopMode.setWakeClientZones(Array.isArray(zones) ? zones : [])
  })

  ipcMain.on('set-day-cell-hit-zones', (_event, zones: DayCellHitZone[] | null) => {
    dayCellClientZones = Array.isArray(zones)
      ? zones
          .filter(
            (z) =>
              z &&
              typeof z.dateKey === 'string' &&
              z.dateKey.length > 0 &&
              z.width > 0 &&
              z.height > 0
          )
          .map((z) => ({
            x: Math.round(z.x),
            y: Math.round(z.y),
            width: Math.round(z.width),
            height: Math.round(z.height),
            dateKey: z.dateKey
          }))
      : []
  })

  ipcMain.on('set-interaction-busy', (_event, busy: boolean) => {
    interactionBusy = Boolean(busy)
  })

  ipcMain.on('focus-for-text-input', () => {
    desktopMode.focusForTextInput()
  })

  ipcMain.handle('open-external', async (_event, url: string) => {
    const target = String(url ?? '').trim()
    if (!/^https?:\/\//i.test(target)) {
      throw new Error('지원하지 않는 URL입니다.')
    }
    await shell.openExternal(target)
  })

  ipcMain.handle('get-mode-status', () => desktopMode.getStatus())
  // No force: respects post-restore switch gate so a stray click on the
  // desktop-mode button right after launch cannot yank the window under icons.
  ipcMain.handle('enter-desktop', () =>
    desktopMode.enterDesktop({ intentional: true, force: false })
  )
  ipcMain.handle('enter-window', () => desktopMode.enterWindow())
  ipcMain.handle('get-window-bounds', () => desktopMode.getWindowBounds())
  ipcMain.handle('set-window-bounds', (_event, bounds) => desktopMode.setWindowBounds(bounds))

  ipcMain.handle('get-auth', () => auth.getUser())
  ipcMain.handle(
    'login',
    (_event, loginId: string, password: string, remember?: boolean) =>
      auth.login(loginId, password, Boolean(remember))
  )
  ipcMain.handle('logout', () => {
    auth.logout()
  })

  ipcMain.handle('get-settings', () => settingsStore.getSettings())
  ipcMain.handle('patch-settings', (_event, patch: Partial<AppSettings>) =>
    settingsStore.patchSettings(patch ?? {})
  )

  ipcMain.handle('calendar:get-store', () => calendarStore.getSnapshot())
  ipcMain.handle('calendar:get-data-root', () => calendarStore.dataRoot)
  ipcMain.handle('calendar:patch-settings', (_event, patch: Partial<StoreSettings>) => {
    const next = calendarStore.patchStoreSettings(patch ?? {})
    if (patch?.viewOptions && typeof patch.viewOptions.runAtStartup === 'boolean') {
      try {
        app.setLoginItemSettings({ openAtLogin: patch.viewOptions.runAtStartup })
      } catch (err) {
        console.warn('[settings] setLoginItemSettings failed', err)
      }
    }
    return next
  })
  ipcMain.handle('calendar:replace-store', (_event, store: CalendarStoreSnapshot) =>
    calendarStore.replaceStore(store)
  )
  ipcMain.handle('calendar:add-event', (_event, input: EventInput) => calendarStore.addEvent(input))
  ipcMain.handle('calendar:edit-event', (_event, id: string, patch: Partial<CalendarEvent>) =>
    calendarStore.editEvent(id, patch ?? {})
  )
  ipcMain.handle('calendar:remove-event', (_event, id: string) => {
    calendarStore.removeEvent(id)
  })
  ipcMain.handle(
    'calendar:create-calendar',
    (_event, input: Partial<CalendarRecord> & { name: string; color: string }) =>
      calendarStore.createCalendar(input)
  )
  ipcMain.handle(
    'calendar:patch-calendar',
    (_event, id: string, patch: Partial<CalendarRecord>) =>
      calendarStore.patchCalendar(id, patch ?? {})
  )
  ipcMain.handle('calendar:delete-calendar', (_event, id: string) => {
    calendarStore.deleteCalendar(id)
  })
  ipcMain.handle('calendar:set-tags', (_event, tags: TagRecord[]) =>
    calendarStore.setTags(Array.isArray(tags) ? tags : [])
  )
  ipcMain.handle('calendar:list-members', () => membersStore.listPublic())
  ipcMain.handle('calendar:save-members', (_event, members: MemberSaveInput[]) =>
    membersStore.saveMembers(Array.isArray(members) ? members : [])
  )
  ipcMain.handle('calendar:sync-holidays', (_event, body: SyncHolidaysInput) =>
    syncKoreanHolidays(calendarStore, body ?? {})
  )
  ipcMain.handle(
    'calendar:export',
    async (
      _event,
      input: { format: 'excel' | 'pdf'; year: number; month: number; asAdmin?: boolean }
    ) => {
      const store = calendarStore.getSnapshot()
      return exportCalendarMonth(
        {
          store,
          year: Number(input?.year),
          month: Number(input?.month),
          format: input?.format === 'pdf' ? 'pdf' : 'excel',
          asAdmin: input?.asAdmin !== false
        },
        mainWindow
      )
    }
  )
}

app.whenReady().then(() => {
  loadDotEnv()
  calendarStore = new CalendarStore()
  const holidayKey = getEnvValue('DATA_GO_KR_SERVICE_KEY', 'HOLIDAY_API_KEY')
  if (holidayKey) applyHolidayKeyFromEnv(calendarStore, holidayKey)
  membersStore = new MembersStore(calendarStore.dataRoot)
  settingsStore = new SettingsStore(calendarStore)
  auth = new AuthService(settingsStore, membersStore)
  console.log('[calendar-store] Data root:', calendarStore.dataRoot)
  desktopMode = new DesktopModeController({
    getWindow: () => mainWindow,
    store: settingsStore,
    onModeChanged: broadcastMode
  })

  registerIpc()
  createWindow()
  tray = createAppTray({
    getWindow: () => mainWindow,
    desktopMode
  })

  // Fully embedded: window-mode button still works via hit-zone.
  windowModeHitZone = new WindowModeHitZone(
    () => mainWindow,
    () => desktopMode.getLockedBounds(),
    () => desktopMode.isWorkerEmbedded(),
    () => {
      desktopMode.enterWindow({ force: true })
    }
  )
  windowModeHitZone.start()

  // Hover header/period buttons → temporary undock;
  // outside click → re-embed immediately; else 10s idle → under icons.
  // After button/tray desktop enter, wake is held until the cursor leaves those buttons.
  desktopInputBridge = new DesktopInputBridge({
    isArmed: () => desktopMode.getLaunchMode() === 'desktop',
    isSuspended: () => desktopMode.isInteractionSuspended(),
    isBusy: () => interactionBusy,
    shouldHoldWake: () => desktopMode.shouldHoldWake(),
    noteWakeCursor: (over) => desktopMode.noteWakeCursor(over),
    getEnterZones: () => desktopMode.getWakeScreenZones(),
    getWidgetBounds: () => desktopMode.getLockedBounds(),
    onEnter: () => desktopMode.suspendForInteraction(),
    onLeave: () => desktopMode.resumeUnderIcons()
  })
  desktopInputBridge.start()

  // Date-cell double-click: undock + open/retarget quick edit (no hover wake).
  // Also armed while undocked + busy so another day can be opened without closing first.
  dayCellDblClickBridge = new DayCellDblClickBridge({
    isArmed: () =>
      desktopMode.getLaunchMode() === 'desktop' &&
      (desktopMode.isWorkerEmbedded() ||
        (desktopMode.isInteractionSuspended() && interactionBusy)),
    getScreenOrigin: () => desktopMode.getLockedBounds(),
    getZones: () => dayCellClientZones,
    onDoubleClick: ({ dateKey, clientX, clientY }) => {
      const win = mainWindow
      if (!win || win.isDestroyed()) return

      const open = (): void => {
        if (!desktopMode.isInteractionSuspended()) {
          desktopMode.suspendForInteraction()
        }
        win.webContents.send('open-day-quick-edit', { dateKey, clientX, clientY })
      }

      // Ignore double-clicks that land on the open quick-edit chrome itself.
      void win.webContents
        .executeJavaScript(
          `(() => {
            const el = document.elementFromPoint(${clientX}, ${clientY});
            return Boolean(el && el.closest && el.closest('.day-quick-edit'));
          })()`,
          true
        )
        .then((onPopover: unknown) => {
          if (onPopover) return
          open()
        })
        .catch(() => {
          open()
        })
    }
  })
  dayCellDblClickBridge.start()

  const onDisplayChanged = (): void => {
    desktopMode.onDisplayTopologyChanged()
  }
  screen.on('display-added', onDisplayChanged)
  screen.on('display-removed', onDisplayChanged)
  screen.on('display-metrics-changed', onDisplayChanged)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  desktopMode?.persistSession()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
