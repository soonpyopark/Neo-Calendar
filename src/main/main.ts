import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron'
import { join } from 'node:path'
import { AuthService } from './auth'
import { CalendarStore } from './calendarStore/CalendarStore'
import { EventAttachmentService } from './calendarStore/eventAttachments'
import { MembersStore } from './calendarStore/membersStore'
import { DesktopModeController } from './desktopMode'
import { getEnvValue, loadDotEnv, resolveAdminCredentials } from './dotEnv'
import { exportBackupZip, importBackupZip } from './calendarStore/backupZip'
import { applyHolidayKeyFromEnv, syncKoreanHolidays } from './calendarStore/holidaySync'
import { exportCalendarMonth } from './export/exportService'
import { SettingsStore } from './settingsStore'
import { createAppTray, type AppTray } from './tray'
import { DayCellDblClickBridge, type DayCellClientZone } from './dayCellDblClickBridge'
import { DesktopInputBridge } from './desktopInputBridge'
import { hwndFromNativeHandle } from './desktopHitTest'
import { withWallpaperApi, type WallpaperBrowserWindow } from './wallpaper'
import { WindowModeHitZone } from './windowModeHitZone'
import { HeaderClickBridge } from './headerClickBridge'
import { snapToTen } from './displayGeometry'
import { APP_NAME, DEFAULT_WIDGET_BOUNDS } from '../shared/constants'
import {
  CalendarWebServer,
  resolveLaunchServerMode
} from './webServer/CalendarWebServer'
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
import {
  getShellRunAtStartup,
  projectViewOptionsForClient
} from '../shared/viewOptionsBySurface'

/**
 * Align Windows login-item with store (MDC StartupRegistrationService.Sync).
 * Skipped in unpackaged/dev builds so electron-vite does not register itself.
 */
function syncLoginItemFromStore(store: CalendarStore): void {
  if (!app.isPackaged) return
  const enabled = getShellRunAtStartup(store.getSnapshot().settings)
  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
    console.log('[startup] login item synced:', enabled)
  } catch (err) {
    console.warn('[startup] setLoginItemSettings failed', err)
  }
}

let mainWindow: WallpaperBrowserWindow | null = null
let calendarStore: CalendarStore
let attachmentService: EventAttachmentService
let membersStore: MembersStore
let settingsStore: SettingsStore
let auth: AuthService
let desktopMode: DesktopModeController
let webServer: CalendarWebServer | null = null
let tray: AppTray | null = null

function notifyStoreChanged(): void {
  try {
    webServer?.broadcastStoreChanged()
  } catch {
    /* ignore */
  }
  // Push to Electron renderer so browser edits appear without restart.
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('store-changed')
    }
  } catch {
    /* ignore */
  }
  try {
    tray?.rebuildMenu?.()
  } catch {
    /* ignore */
  }
}
let windowModeHitZone: WindowModeHitZone | null = null
let headerClickBridge: HeaderClickBridge | null = null
let desktopInputBridge: DesktopInputBridge | null = null
let dayCellDblClickBridge: DayCellDblClickBridge | null = null
let dayCellClientZones: DayCellClientZone[] = []
let interactionBusy = false
/** True only for tray "종료" / OS shutdown — otherwise close hides to tray (MDC). */
let forceQuit = false

function requestQuit(): void {
  forceQuit = true
  desktopMode?.persistSession()
  try {
    webServer?.stop()
  } catch {
    /* ignore */
  }
  app.quit()
}

/** Display owner name follows the signed-in member loginId. */
function syncOwnerNameFromLoginId(loginId: string): void {
  const id = loginId.trim()
  if (!id) return
  const current = calendarStore.getSnapshot().settings.ownerName?.trim() ?? ''
  if (current === id) return
  calendarStore.patchStoreSettings({ ownerName: id })
}

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

  let sessionRestored = false
  const restoreSession = (): void => {
    if (sessionRestored) return
    sessionRestored = true
    desktopMode.restoreFromSettings()
  }

  win.once('ready-to-show', () => {
    restoreSession()
  })

  // Packaged / remote installs: if the renderer never paints, still surface a window
  // (or tray) instead of leaving a forever-hidden BrowserWindow.
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[main] did-fail-load', { code, desc, url })
  })
  setTimeout(() => {
    if (win.isDestroyed()) return
    if (!sessionRestored) {
      console.warn('[main] ready-to-show timed out — forcing window restore')
      restoreSession()
    }
  }, 4000)

  // Window mode: keep footprint in sync while dragging/resizing.
  const persistBounds = (): void => {
    if (desktopMode.getLaunchMode() === 'window') {
      desktopMode.persistWindowBounds()
    }
  }
  win.on('moved', persistBounds)
  win.on('resized', persistBounds)
  win.on('close', (event) => {
    desktopMode.persistSession()
    if (forceQuit) return
    // MDC: Alt+F4 / system close → tray, not quit.
    event.preventDefault()
    tray?.hideToTray?.()
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

  ipcMain.on('set-click-forward-hit-zones', (_event, zones: ClientHitRect[] | null) => {
    headerClickBridge?.setClientZones(Array.isArray(zones) ? zones : [])
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
  ipcMain.handle('get-sync-info', () => webServer?.getSyncInfo() ?? {
    running: false,
    port: null,
    hostname: null,
    lanMode: false,
    addresses: [],
    editorUrl: null
  })
  ipcMain.handle(
    'login',
    (_event, loginId: string, password: string, remember?: boolean) => {
      const result = auth.login(loginId, password, Boolean(remember))
      if (result.ok && result.user?.loginId) {
        syncOwnerNameFromLoginId(result.user.loginId)
      }
      return result
    }
  )
  ipcMain.handle('logout', () => {
    auth.logout()
  })

  ipcMain.handle('get-settings', () => settingsStore.getSettings())
  ipcMain.handle('patch-settings', (_event, patch: Partial<AppSettings>) =>
    settingsStore.patchSettings(patch ?? {})
  )

  ipcMain.handle('calendar:get-store', () => {
    const snap = calendarStore.getSnapshotForLogin(auth.getUser()?.loginId)
    return snap
  })
  ipcMain.handle('calendar:get-data-root', () => calendarStore.dataRoot)
  ipcMain.handle('calendar:patch-settings', (_event, patch: Partial<StoreSettings>) => {
    const loginId = auth.getUser()?.loginId
    calendarStore.patchStoreSettings(patch ?? {}, loginId, 'native')
    if (patch?.viewOptions && typeof patch.viewOptions.runAtStartup === 'boolean') {
      syncLoginItemFromStore(calendarStore)
    }
    notifyStoreChanged()
    return calendarStore.getSnapshotForLogin(loginId, 'native')
  })
  ipcMain.handle('calendar:replace-store', (_event, store: CalendarStoreSnapshot) => {
    const next = calendarStore.replaceStore(store)
    notifyStoreChanged()
    return calendarStore.getSnapshotForLogin(auth.getUser()?.loginId) ?? next
  })
  ipcMain.handle('calendar:import-store', (_event, payload: unknown) => {
    calendarStore.importStore(payload)
    notifyStoreChanged()
    return calendarStore.getSnapshotForLogin(auth.getUser()?.loginId)
  })
  ipcMain.handle('calendar:export-backup-zip', async () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    return exportBackupZip(calendarStore, win)
  })
  ipcMain.handle('calendar:import-backup-zip', async () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    return importBackupZip(calendarStore, win)
  })
  ipcMain.handle('calendar:add-event', (_event, input: EventInput) => {
    const created = calendarStore.addEvent(input)
    notifyStoreChanged()
    return created
  })
  ipcMain.handle('calendar:edit-event', (_event, id: string, patch: Partial<CalendarEvent>) => {
    const updated = calendarStore.editEvent(id, patch ?? {})
    notifyStoreChanged()
    return updated
  })
  ipcMain.handle('calendar:remove-event', (_event, id: string) => {
    calendarStore.removeEvent(id)
    attachmentService.deleteAllForEvent(id)
    notifyStoreChanged()
  })
  ipcMain.handle('calendar:add-attachments', async (_event, eventId: string) => {
    const options: Electron.OpenDialogOptions = {
      title: '일정에 첨부할 파일 선택',
      properties: ['openFile', 'multiSelections'],
      buttonLabel: '첨부'
    }
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) {
      const current = calendarStore.getSnapshot().events.find((item) => item.id === eventId)
      if (!current) throw new Error('일정을 찾을 수 없습니다.')
      return current
    }
    const updated = attachmentService.addFromPaths(eventId, result.filePaths)
    notifyStoreChanged()
    return updated
  })
  ipcMain.handle(
    'calendar:remove-attachment',
    (_event, eventId: string, attachmentId: string) => {
      const updated = attachmentService.remove(eventId, attachmentId)
      notifyStoreChanged()
      return updated
    }
  )
  ipcMain.handle(
    'calendar:open-attachment',
    async (_event, eventId: string, attachmentId: string) => {
      await attachmentService.open(eventId, attachmentId)
    }
  )
  ipcMain.handle(
    'calendar:create-calendar',
    (_event, input: Partial<CalendarRecord> & { name: string; color: string }) => {
      const created = calendarStore.createCalendar(input)
      const adminId = resolveAdminCredentials().id
      calendarStore.hideNewMemberCalendarForAdmin(created, adminId)
      const projected = calendarStore
        .getSnapshotForLogin(auth.getUser()?.loginId)
        .calendars.find((c) => c.id === created.id)
      notifyStoreChanged()
      return projected ?? created
    }
  )
  ipcMain.handle(
    'calendar:patch-calendar',
    (_event, id: string, patch: Partial<CalendarRecord>) => {
      const body = { ...(patch ?? {}) }
      const loginId = auth.getUser()?.loginId?.trim() ?? ''
      // Eye-toggle is per-member, not shared calendar.visible (MDC).
      if (Object.prototype.hasOwnProperty.call(body, 'visible') && loginId) {
        const wantVisible = body.visible !== false
        calendarStore.setCalendarHiddenForLogin(loginId, id, !wantVisible)
        delete body.visible
      }
      const updated =
        Object.keys(body).length > 0
          ? calendarStore.patchCalendar(id, body)
          : (calendarStore.getSnapshot().calendars.find((c) => c.id === id) ?? null)
      if (!updated) throw new Error('캘린더를 찾을 수 없습니다.')
      const projected = calendarStore
        .getSnapshotForLogin(loginId || auth.getUser()?.loginId)
        .calendars.find((c) => c.id === id)
      notifyStoreChanged()
      return projected ?? updated
    }
  )
  ipcMain.handle('calendar:reorder-calendars', (_event, orderedIds: string[]) => {
    const ids = Array.isArray(orderedIds)
      ? orderedIds.map((id) => String(id ?? '').trim()).filter(Boolean)
      : []
    calendarStore.reorderCalendars(ids)
    notifyStoreChanged()
    return calendarStore.getSnapshotForLogin(auth.getUser()?.loginId).calendars
  })
  ipcMain.handle('calendar:delete-calendar', (_event, id: string) => {
    calendarStore.deleteCalendar(id)
    notifyStoreChanged()
  })
  ipcMain.handle('calendar:clear-events', (_event, id: string) => {
    calendarStore.clearCalendarEvents(id)
    notifyStoreChanged()
  })
  ipcMain.handle(
    'calendar:import-into-calendar',
    (_event, id: string, events: unknown[]) => {
      const loginId = auth.getUser()?.loginId ?? resolveAdminCredentials().id
      const result = calendarStore.importEventsIntoCalendar(
        id,
        Array.isArray(events) ? events : [],
        loginId
      )
      notifyStoreChanged()
      return result
    }
  )
  ipcMain.handle('calendar:set-tags', (_event, tags: TagRecord[]) => {
    const next = calendarStore.setTags(Array.isArray(tags) ? tags : [])
    notifyStoreChanged()
    return next
  })
  ipcMain.handle(
    'calendar:create-tag',
    (_event, input: { name: string; color: string; sortOrder?: number }) => {
      const created = calendarStore.createTag(input ?? { name: '', color: '' })
      notifyStoreChanged()
      return created
    }
  )
  ipcMain.handle(
    'calendar:patch-tag',
    (_event, id: string, patch: Partial<Pick<TagRecord, 'name' | 'color' | 'sortOrder'>>) => {
      const updated = calendarStore.patchTag(id, patch ?? {})
      notifyStoreChanged()
      return updated
    }
  )
  ipcMain.handle('calendar:delete-tag', (_event, id: string) => {
    calendarStore.deleteTag(id)
    notifyStoreChanged()
  })
  ipcMain.handle('calendar:list-members', () => membersStore.listPublic())
  ipcMain.handle('calendar:save-members', (_event, members: MemberSaveInput[]) => {
    const result = membersStore.saveMembers(Array.isArray(members) ? members : [])
    for (const loginId of result.deletedLoginIds) {
      try {
        calendarStore.purgeMemberOwnedData(loginId)
      } catch (err) {
        console.warn('[members] purge failed', loginId, err)
      }
    }
    // MDC: ensure a personal calendar for every active member after each save.
    const adminId = auth.getUser()?.loginId ?? resolveAdminCredentials().id
    for (const member of result.members) {
      if (member.active === false) continue
      const loginId = String(member.loginId ?? '').trim()
      if (!loginId) continue
      try {
        calendarStore.ensurePersonalCalendar(loginId, member.displayName, adminId)
      } catch (err) {
        console.warn('[members] ensure personal calendar failed', loginId, err)
      }
    }
    notifyStoreChanged()
    return result.members
  })
  ipcMain.handle('calendar:sync-holidays', async (_event, body: SyncHolidaysInput) => {
    const result = await syncKoreanHolidays(calendarStore, body ?? {})
    notifyStoreChanged()
    return result
  })
  ipcMain.handle(
    'calendar:export',
    async (
      _event,
      input: { format: 'excel' | 'pdf'; year: number; month: number; asAdmin?: boolean }
    ) => {
      const raw = calendarStore.getSnapshot()
      const store: CalendarStoreSnapshot = {
        ...raw,
        settings: projectViewOptionsForClient(raw.settings, 'native')
      }
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
  try {
    bootApp()
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error('[main] startup failed:', message)
    try {
      dialog.showErrorBox('Neo Calendar 시작 실패', message)
    } catch {
      /* ignore */
    }
    app.quit()
  }
})

function bootApp(): void {
  loadDotEnv()
  calendarStore = new CalendarStore()
  attachmentService = new EventAttachmentService(calendarStore)
  const holidayKey = getEnvValue('DATA_GO_KR_SERVICE_KEY', 'HOLIDAY_API_KEY')
  if (holidayKey) applyHolidayKeyFromEnv(calendarStore, holidayKey)
  membersStore = new MembersStore(calendarStore.dataRoot)
  settingsStore = new SettingsStore(calendarStore)
  auth = new AuthService(settingsStore, membersStore)
  try {
    const adminId = resolveAdminCredentials().id
    const memberIds = membersStore
      .listPublic()
      .filter((m) => m.active !== false)
      .map((m) => m.loginId)
    calendarStore.ensureMemberOwnership(adminId, memberIds)
  } catch (err) {
    console.warn('[calendar-store] ensure member ownership failed', err)
  }
  const sessionUser = auth.getUser()
  if (sessionUser?.loginId) {
    syncOwnerNameFromLoginId(sessionUser.loginId)
  }
  syncLoginItemFromStore(calendarStore)
  console.log('[calendar-store] Data root:', calendarStore.dataRoot)
  desktopMode = new DesktopModeController({
    getWindow: () => mainWindow,
    store: settingsStore,
    onModeChanged: broadcastMode
  })

  registerIpc()

  webServer = new CalendarWebServer({
    auth,
    calendarStore,
    membersStore,
    attachments: attachmentService,
    getWwwroot: () => join(__dirname, '../renderer'),
    getViteOrigin: () => process.env.ELECTRON_RENDERER_URL?.trim() || null,
    onStoreMutated: () => notifyStoreChanged()
  })
  // Tray first so a later window/bridge failure still leaves a visible shell icon.
  tray = createAppTray({
    getWindow: () => mainWindow,
    desktopMode,
    getDataRoot: () => calendarStore.dataRoot,
    requestQuit,
    webServer
  })

  // MDC StartWebServerOnLaunch — default Local; refresh tray checkmarks after listen.
  void (async () => {
    try {
      const mode = resolveLaunchServerMode()
      const started = await webServer.tryStart({ mode, requirePortInEnv: false })
      if (!started.ok) {
        console.warn('[web-server] auto-start skipped:', started.message)
      }
    } catch (err) {
      console.warn('[web-server] auto-start failed', err)
    } finally {
      try {
        tray?.rebuildMenu?.()
      } catch {
        /* ignore */
      }
    }
  })()

  createWindow()

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

  // Period toolbar (연/주/월/nav/오늘/internet/eye/check): click while staying embedded.
  headerClickBridge = new HeaderClickBridge(
    () => mainWindow,
    () => desktopMode.getLockedBounds(),
    () => desktopMode.isWorkerEmbedded()
  )
  headerClickBridge.start()

  // Hover IME/modal chrome (search/settings/login…) → temporary undock;
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
    getOurHwnd: () => {
      const win = mainWindow
      if (!win || win.isDestroyed()) return null
      try {
        return hwndFromNativeHandle(win.getNativeWindowHandle())
      } catch {
        return null
      }
    },
    getZones: () => dayCellClientZones,
    onDoubleClick: ({ dateKey, clientX, clientY }) => {
      const win = mainWindow
      if (!win || win.isDestroyed()) return

      // Re-hit-test in the live DOM before undocking. Published zones can be stale after
      // month scroll (infinite buffer), which opened quick-edit for off-screen days.
      void win.webContents
        .executeJavaScript(
          `(() => {
            const el = document.elementFromPoint(${clientX}, ${clientY});
            if (!el || !el.closest) return { ok: false };
            if (el.closest('.day-quick-edit')) return { ok: false };
            const cell = el.closest('.neo-cal-shell .day-cell[data-date-key]');
            if (!cell) return { ok: false };
            const key = cell.getAttribute('data-date-key') || '';
            if (!key) return { ok: false };
            const body = cell.closest('.month-body');
            if (body) {
              const br = body.getBoundingClientRect();
              const cr = cell.getBoundingClientRect();
              const visible =
                cr.bottom > br.top + 2 &&
                cr.top < br.bottom - 2 &&
                cr.right > br.left + 2 &&
                cr.left < br.right - 2;
              if (!visible) return { ok: false };
            }
            return { ok: true, dateKey: key };
          })()`,
          true
        )
        .then((result: unknown) => {
          const hit = result as { ok?: boolean; dateKey?: string } | null
          if (!hit?.ok || !hit.dateKey) return
          if (!desktopMode.isInteractionSuspended()) {
            desktopMode.suspendForInteraction()
          }
          win.webContents.send('open-day-quick-edit', {
            dateKey: hit.dateKey,
            clientX,
            clientY
          })
        })
        .catch(() => {
          if (!desktopMode.isInteractionSuspended()) {
            desktopMode.suspendForInteraction()
          }
          win.webContents.send('open-day-quick-edit', { dateKey, clientX, clientY })
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
}

app.on('before-quit', () => {
  forceQuit = true
  desktopMode?.persistSession()
  try {
    webServer?.stop()
  } catch {
    /* ignore */
  }
})

app.on('window-all-closed', () => {
  // Keep running in the tray while the BrowserWindow is only hidden.
  if (!forceQuit) return
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
