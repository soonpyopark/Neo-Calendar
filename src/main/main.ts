import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { join } from 'node:path'
import { AuthService } from './auth'
import { CalendarStore } from './calendarStore/CalendarStore'
import { EventAttachmentService } from './calendarStore/eventAttachments'
import { MembersStore } from './calendarStore/membersStore'
import { DesktopModeController } from './desktopMode'
import { DesktopIdleEmbedBridge } from './desktopIdleEmbedBridge'
import { PanelWindowManager } from './panelWindowManager'
import { DesktopOutsideClickEmbedBridge } from './desktopOutsideClickEmbedBridge'
import {
  DayCellDblClickBridge,
  type DayCellClientZone
} from './dayCellDblClickBridge'
import {
  PeriodToolbarClickBridge,
  type ClickForwardClientZone
} from './periodToolbarClickBridge'
import { getEnvValue, loadDotEnv, resolveAdminCredentials } from './dotEnv'
import { exportBackupZip, importBackupZip } from './calendarStore/backupZip'
import { applyHolidayKeyFromEnv, syncKoreanHolidays } from './calendarStore/holidaySync'
import { exportCalendarMonth } from './export/exportService'
import { SettingsStore } from './settingsStore'
import { createAppTray, type AppTray } from './tray'
import { focusWindowForTextInput } from './windowFocus'
import { isForeignAppAtPoint, shouldProcessEmbeddedGlobalClick } from './windowAtPoint'
import { isNativeDialogOpen, withNativeDialog } from './nativeDialogGuard'
import { withWallpaperApi, getWindowDipScreenBounds, type WallpaperBrowserWindow } from './wallpaper'
import { snapToTen } from './displayGeometry'
import { APP_NAME, DEFAULT_WIDGET_BOUNDS, MIN_WIDGET_HEIGHT, MIN_WIDGET_WIDTH } from '../shared/constants'
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
import type {
  AppSettings,
  ClientHitRect,
  ClickForwardHitZone,
  DayCellHitZone,
  DesktopQuickEditContext,
  ModeStatus,
  OpenDayQuickEditPayload,
  QuickEditDeferToMainPayload,
  ToolbarClickPayload
} from '../shared/ipc'
import {
  CHROME_TOOLBAR_ACTIONS,
  EMBEDDED_AUTH_CHROME_ACTIONS,
  EMBEDDED_EXPORT_CHROME_ACTIONS,
  EMBEDDED_FLOATING_CHROME_ACTIONS,
  PERIOD_TOOLBAR_ACTIONS
} from '../shared/ipc'
import {
  getShellRunAtStartup,
  projectViewOptionsForClient
} from '../shared/viewOptionsBySurface'

function sanitizeClientHitRects(zones: unknown): ClientHitRect[] {
  if (!Array.isArray(zones)) return []
  const out: ClientHitRect[] = []
  for (const z of zones) {
    if (!z || typeof z !== 'object') continue
    const r = z as Partial<ClientHitRect>
    const x = Number(r.x)
    const y = Number(r.y)
    const width = Number(r.width)
    const height = Number(r.height)
    if (![x, y, width, height].every(Number.isFinite)) continue
    if (width < 1 || height < 1) continue
    out.push({ x, y, width, height })
  }
  return out
}

function sanitizeDayCellHitZones(zones: unknown): DayCellClientZone[] {
  if (!Array.isArray(zones)) return []
  const out: DayCellClientZone[] = []
  for (const z of zones) {
    if (!z || typeof z !== 'object') continue
    const r = z as Partial<DayCellHitZone>
    const x = Number(r.x)
    const y = Number(r.y)
    const width = Number(r.width)
    const height = Number(r.height)
    const dateKey = typeof r.dateKey === 'string' ? r.dateKey.trim() : ''
    if (!dateKey || ![x, y, width, height].every(Number.isFinite)) continue
    if (width < 1 || height < 1) continue
    out.push({ x, y, width, height, dateKey })
  }
  return out
}

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
const PERIOD_TOOLBAR_ACTION_IDS = new Set<string>(Object.values(PERIOD_TOOLBAR_ACTIONS))
/** Visible day-cell footprints for WorkerW custom double-click → quick edit. */
let dayCellHitZones: DayCellClientZone[] = []
/** Header/shell rects where day double-click must not fire. */
let dayDblClickExcludeZones: ClientHitRect[] = []
/** View context for WorkerW embedded floating quick edit. */
let desktopQuickEditContext: DesktopQuickEditContext = {
  viewMode: 'month',
  eventsHidden: false
}
let panelWindowManager: PanelWindowManager | null = null
/** Period toolbar footprints for WorkerW embedded click → action (stay embedded). */
let clickForwardHitZones: ClickForwardClientZone[] = []

function notifyAuthChanged(): void {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth-changed')
    }
  } catch {
    /* ignore */
  }
}

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

function hitTestScreenOrigin(): { x: number; y: number } | null {
  const locked = desktopMode?.getLockedBounds() ?? null
  const live =
    mainWindow && !mainWindow.isDestroyed() ? getWindowDipScreenBounds(mainWindow) : null
  const origin = live ?? locked
  return origin ? { x: origin.x, y: origin.y } : null
}

function isForeignClickAtPoint(pt: { x: number; y: number }): boolean {
  return isForeignAppAtPoint(mainWindow, pt)
}

function shouldProcessEmbeddedClickAtPoint(pt: { x: number; y: number }): boolean {
  if (panelWindowManager?.isPointInsideAnyPanel(pt)) return false
  return shouldProcessEmbeddedGlobalClick(mainWindow, pt)
}

function restoreMainWindowMouseAfterPanels(): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  if (desktopMode.isInputLocked()) {
    win.setIgnoreMouseEvents(true)
    return
  }
  if (desktopMode.getLaunchMode() === 'window' || desktopMode.isInteractionSuspended()) {
    win.setIgnoreMouseEvents(false)
    return
  }
  if (desktopMode.isWorkerEmbedded()) {
    win.setIgnoreMouseEvents(true)
    return
  }
  win.setIgnoreMouseEvents(true, { forward: true })
}

function shieldMainWindowWhilePanelsOpen(): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  win.setIgnoreMouseEvents(true, { forward: false })
}

/** Mirror main-process day-dblclick logs into renderer DevTools (dev only). */
function sendDayDblClickLog(msg: string, data?: Record<string, unknown>): void {
  if (app.isPackaged) return
  const win = mainWindow
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
  win.webContents.send('day-dblclick-log', { msg, data })
}

function sanitizeClickForwardHitZones(zones: unknown): ClickForwardClientZone[] {
  if (!Array.isArray(zones)) return []
  const out: ClickForwardClientZone[] = []
  for (const z of zones) {
    if (!z || typeof z !== 'object') continue
    const r = z as Partial<ClickForwardHitZone>
    const x = Number(r.x)
    const y = Number(r.y)
    const width = Number(r.width)
    const height = Number(r.height)
    const action = typeof r.action === 'string' ? r.action.trim() : ''
    if (!action || ![x, y, width, height].every(Number.isFinite)) continue
    if (width < 1 || height < 1) continue
    out.push({ x, y, width, height, action })
  }
  return out
}

/** Unlock WorkerW embed, focus HWND, then open quick edit in renderer. */
function unlockAndOpenDayQuickEdit(payload: OpenDayQuickEditPayload): void {
  desktopMode.suspendForInteraction()
  const win = mainWindow
  if (!win || win.isDestroyed()) return

  focusWindowForTextInput(win)
  win.setIgnoreMouseEvents(false)

  // Wait for detach + mode-changed before mounting the popover.
  setTimeout(() => {
    if (win.isDestroyed()) return
    win.setIgnoreMouseEvents(false)
    win.webContents.send('open-day-quick-edit', payload)
    focusWindowForTextInput(win)
  }, 60)
}

/** WorkerW embedded: open quick edit in a top-level window above desktop icons. */
function openFloatingDayQuickEdit(payload: OpenDayQuickEditPayload): void {
  if (!auth?.getUser()) return
  const win = mainWindow
  if (!win || win.isDestroyed() || !panelWindowManager) return
  if (!win.webContents.isDestroyed()) {
    win.webContents.send('focus-day-cell', { dateKey: payload.dateKey })
  }
  panelWindowManager.openQuickEditFromEmbeddedDblClick(
    win,
    payload,
    desktopQuickEditContext,
    dayCellHitZones
  )
}

function deferQuickEditToMain(payload: QuickEditDeferToMainPayload): void {
  desktopMode.suspendForInteraction()
  const win = mainWindow
  if (!win || win.isDestroyed()) return

  focusWindowForTextInput(win)
  win.setIgnoreMouseEvents(false)

  setTimeout(() => {
    if (win.isDestroyed()) return
    win.setIgnoreMouseEvents(false)
    win.webContents.send('quick-edit-deferred', payload)
    focusWindowForTextInput(win)
  }, 60)
}

/** WorkerW embedded: run period-toolbar action in renderer without undocking. */
function triggerEmbeddedPeriodToolbar(payload: ToolbarClickPayload): void {
  if (payload.action === CHROME_TOOLBAR_ACTIONS.enterWindow) {
    panelWindowManager?.closeAll()
    desktopMode.enterWindow()
    return
  }
  if (
    !PERIOD_TOOLBAR_ACTION_IDS.has(payload.action) &&
    !EMBEDDED_FLOATING_CHROME_ACTIONS.has(payload.action) &&
    !EMBEDDED_EXPORT_CHROME_ACTIONS.has(payload.action) &&
    !EMBEDDED_AUTH_CHROME_ACTIONS.has(payload.action)
  ) {
    return
  }
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  win.webContents.send('toolbar-click', payload)
}

function broadcastMode(status: ModeStatus): void {
  if (status.mode === 'desktop') {
    panelWindowManager?.closeAll()
  }
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
  const startWidth = Math.min(Math.max(MIN_WIDGET_WIDTH, snapToTen(saved.width)), area.width)
  const startHeight = Math.min(Math.max(MIN_WIDGET_HEIGHT, snapToTen(saved.height)), area.height)
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

  win.setMinimumSize(MIN_WIDGET_WIDTH, MIN_WIDGET_HEIGHT)

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
    win.webContents.once('did-finish-load', () => {
      if (win.isDestroyed()) return
      win.webContents.openDevTools({ mode: 'detach' })
    })
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
      // Window mode + unlocked desktop: always capture.
      if (
        desktopMode.getLaunchMode() === 'window' ||
        desktopMode.isInteractionSuspended()
      ) {
        mainWindow.setIgnoreMouseEvents(false)
        return
      }
      // WorkerW-embedded: full click-through.
      if (desktopMode.isWorkerEmbedded()) {
        mainWindow.setIgnoreMouseEvents(true)
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

  // Legacy hit-zone IPCs — period toolbar + day-cell bridges active when embedded.
  ipcMain.on('set-window-mode-hit-zone', () => undefined)
  ipcMain.on('set-header-hit-zone', () => undefined)
  ipcMain.on('set-wake-hit-zones', () => undefined)
  ipcMain.on('set-click-forward-hit-zones', (_event, zones: ClickForwardHitZone[]) => {
    clickForwardHitZones = sanitizeClickForwardHitZones(zones)
  })
  ipcMain.on('set-day-cell-hit-zones', (_event, zones: DayCellHitZone[]) => {
    dayCellHitZones = sanitizeDayCellHitZones(zones)
    sendDayDblClickLog('[day-dblclick] main received zones', { count: dayCellHitZones.length })
  })
  ipcMain.on('set-day-dblclick-exclude-zones', (_event, zones: ClientHitRect[]) => {
    dayDblClickExcludeZones = sanitizeClientHitRects(zones)
  })
  ipcMain.on('set-desktop-quick-edit-context', (_event, context: DesktopQuickEditContext) => {
    const viewMode = context?.viewMode
    desktopQuickEditContext = {
      viewMode:
        viewMode === 'year' || viewMode === 'week' || viewMode === 'month'
          ? viewMode
          : desktopQuickEditContext.viewMode,
      eventsHidden: Boolean(context?.eventsHidden)
    }
  })
  ipcMain.on('set-interaction-busy', () => undefined)

  ipcMain.on('focus-for-text-input', (event) => {
    if (panelWindowManager?.isPanelWebContents(event.sender.id)) {
      const panelWin = panelWindowManager.getWindowForWebContents(event.sender.id)
      if (panelWin && !panelWin.isDestroyed()) {
        focusWindowForTextInput(panelWin)
      }
      return
    }
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
  ipcMain.handle('enter-window', () => {
    panelWindowManager?.closeAll()
    return desktopMode.enterWindow()
  })
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
        notifyStoreChanged()
        notifyAuthChanged()
      }
      return result
    }
  )
  ipcMain.handle('logout', () => {
    auth.logout()
    notifyStoreChanged()
    notifyAuthChanged()
  })

  ipcMain.handle('get-settings', () => settingsStore.getSettings())
  ipcMain.handle('patch-settings', (_event, patch: Partial<AppSettings>) =>
    settingsStore.patchSettings(patch ?? {})
  )
  ipcMain.on('apply-main-opacity-preview', (_event, patch: Partial<AppSettings>) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('main-opacity-preview', patch ?? {})
  })

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
    const loginId = auth.getUser()?.loginId
    if (!loginId) {
      throw new Error('가져오기는 로그인 후 사용할 수 있습니다.')
    }
    calendarStore.importStore(payload, loginId)
    notifyStoreChanged()
    return calendarStore.getSnapshotForLogin(loginId)
  })
  ipcMain.handle('calendar:export-backup-zip', async () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    return exportBackupZip(calendarStore, win)
  })
  ipcMain.handle('calendar:import-backup-zip', async () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    const loginId = auth.getUser()?.loginId
    if (!loginId) {
      throw new Error('가져오기는 로그인 후 사용할 수 있습니다.')
    }
    return importBackupZip(calendarStore, win, loginId)
  })
  ipcMain.handle('calendar:pick-import-file', async () => {
    const options: Electron.OpenDialogOptions = {
      title: '캘린더 가져오기',
      filters: [
        { name: '캘린더 파일', extensions: ['json', 'ics', 'csv'] },
        { name: '모든 파일', extensions: ['*'] }
      ],
      properties: ['openFile']
    }
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
    const result = await withNativeDialog(async () =>
      win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
    )
    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true as const }
    }
    const filePath = result.filePaths[0]
    const content = await readFile(filePath, 'utf8')
    return { cancelled: false as const, content, filename: basename(filePath) }
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
    const result = await withNativeDialog(async () =>
      win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
    )
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
      event,
      input: { format: 'excel' | 'pdf'; year: number; month: number; asAdmin?: boolean }
    ) => {
      const raw = calendarStore.getSnapshot()
      const store: CalendarStoreSnapshot = {
        ...raw,
        settings: projectViewOptionsForClient(raw.settings, 'native')
      }
      const senderWin = BrowserWindow.fromWebContents(event.sender)
      const parent =
        senderWin &&
        !senderWin.isDestroyed() &&
        panelWindowManager?.isPanelWebContents(event.sender.id)
          ? senderWin
          : mainWindow
      return exportCalendarMonth(
        {
          store,
          year: Number(input?.year),
          month: Number(input?.month),
          format: input?.format === 'pdf' ? 'pdf' : 'excel',
          asAdmin: input?.asAdmin !== false
        },
        parent && !parent.isDestroyed() ? parent : null
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
      } else {
        const info = webServer.getSyncInfo()
        if (info.editorUrl) {
          console.log(`[dev:browser] Browser test URL: ${info.editorUrl}`)
        } else if (info.port) {
          console.log(`[dev:browser] Browser test URL: http://127.0.0.1:${info.port}/`)
        }
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

  panelWindowManager = new PanelWindowManager(() => mainWindow, {
    onPanelStackChanged: (hasOpenPanels) => {
      if (hasOpenPanels) shieldMainWindowWhilePanelsOpen()
      else restoreMainWindowMouseAfterPanels()
    },
    isWorkerEmbedded: () => desktopMode.isWorkerEmbedded(),
    getMainFootprint: () => {
      const locked = desktopMode.getLockedBounds()
      if (desktopMode.isWorkerEmbedded() && locked) return locked
      const live =
        mainWindow && !mainWindow.isDestroyed() ? getWindowDipScreenBounds(mainWindow) : null
      return live ?? locked
    }
  })

  // Cold-start unlocked desktop: 10s without input → WorkerW embed.
  const idleEmbed = new DesktopIdleEmbedBridge({
    isArmed: () =>
      desktopMode.getLaunchMode() === 'desktop' && desktopMode.isInteractionSuspended(),
    onEmbed: () => {
      desktopMode.resumeUnderIcons()
    }
  })
  idleEmbed.start()
  mainWindow?.webContents.on('before-input-event', () => {
    idleEmbed.noteActivity()
  })

  // Unlocked desktop: click outside calendar → re-embed under icons.
  const outsideClickEmbed = new DesktopOutsideClickEmbedBridge({
    isArmed: () =>
      desktopMode.getLaunchMode() === 'desktop' && desktopMode.isInteractionSuspended(),
    getAppBounds: () => {
      const locked = desktopMode.getLockedBounds()
      const live =
        mainWindow && !mainWindow.isDestroyed() ? getWindowDipScreenBounds(mainWindow) : null
      return live ?? locked
    },
    isForeignAppAtPoint: (pt) => isForeignClickAtPoint(pt),
    shouldSkipClick: (pt) => panelWindowManager?.isPointInsideAnyPanel(pt) ?? false,
    onEmbed: () => {
      desktopMode.resumeUnderIcons()
    }
  })
  outsideClickEmbed.start()

  // WorkerW-embedded: click period toolbar → action (stay embedded).
  const toolbarClick = new PeriodToolbarClickBridge({
    isArmed: () => desktopMode.isWorkerEmbedded(),
    getScreenOrigin: () => hitTestScreenOrigin(),
    getZones: () => clickForwardHitZones,
    shouldProcessEmbeddedClick: (pt) => shouldProcessEmbeddedClickAtPoint(pt),
    onToolbarClick: (payload) => {
      triggerEmbeddedPeriodToolbar({ action: payload.action })
    }
  })
  toolbarClick.start()

  // WorkerW-embedded: custom double-click on date cell → unlock + quick edit.
  const dayDblClick = new DayCellDblClickBridge({
    isArmed: () => desktopMode.isWorkerEmbedded(),
    getScreenOrigin: () => hitTestScreenOrigin(),
    getZones: () => dayCellHitZones,
    getExcludeZones: () => dayDblClickExcludeZones,
    shouldProcessEmbeddedClick: (pt) => shouldProcessEmbeddedClickAtPoint(pt),
    onDebug: (msg, data) => sendDayDblClickLog(msg, data),
    onQuickEditClick: (payload) => {
      openFloatingDayQuickEdit(payload)
    }
  })
  dayDblClick.start()

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
