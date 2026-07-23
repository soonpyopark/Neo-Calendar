export type SetIgnoreMouseOptions = {
  /** Electron native option mapped in main */
  forward?: boolean
  /** Project alias; treated the same as `forward` in main */
  forwardToOverlay?: boolean
}

export type LaunchMode = 'desktop' | 'window'

export type WidgetBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type AppSettings = {
  widget: {
    launchMode: LaunchMode
    bounds: WidgetBounds
  }
  weekStartsOn: 0 | 1
  headerOpacity: number
  shellOpacity: number
}

export type AuthUser = {
  loginId: string
  role: 'admin'
}

export type LoginResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string }

export type ModeStatus = {
  mode: LaunchMode
  embedded: boolean
  bounds: WidgetBounds
  /** False while mode buttons are gated (cursor still on header after a switch). */
  switchReady: boolean
}

export type ClientHitRect = {
  x: number
  y: number
  width: number
  height: number
}

export type DayCellHitZone = ClientHitRect & {
  dateKey: string
}

export type OpenDayQuickEditPayload = {
  dateKey: string
  clientX?: number
  clientY?: number
}

export type NeoCalendarApi = {
  setIgnoreMouse: (ignore: boolean, options?: SetIgnoreMouseOptions) => void
  getModeStatus: () => Promise<ModeStatus>
  enterDesktop: () => Promise<ModeStatus>
  enterWindow: () => Promise<ModeStatus>
  getWindowBounds: () => Promise<WidgetBounds>
  setWindowBounds: (bounds: WidgetBounds) => Promise<WidgetBounds>
  /** Client-space rect of the window-mode button (for WorkerW click bridging). */
  setWindowModeHitZone: (rect: ClientHitRect | null) => void
  /** Client-space rect of the app chrome header (legacy; prefer setWakeHitZones). */
  setHeaderHitZone: (rect: ClientHitRect | null) => void
  /** Client-space zones that temporarily undock under-icons mode on hover. */
  setWakeHitZones: (zones: ClientHitRect[]) => void
  /** In-month day cells for WorkerW double-click → quick edit (no hover wake). */
  setDayCellHitZones: (zones: DayCellHitZone[]) => void
  /**
   * True while a desktop-mode UI task is open (quick edit / search / settings / login).
   * Keeps the temporary undock from re-embedding until work finishes + idle timeout.
   */
  setInteractionBusy: (busy: boolean) => void
  onModeChanged: (listener: (status: ModeStatus) => void) => () => void
  onOpenDayQuickEdit: (listener: (payload: OpenDayQuickEditPayload) => void) => () => void
  getAuth: () => Promise<AuthUser | null>
  login: (loginId: string, password: string, remember?: boolean) => Promise<LoginResult>
  logout: () => Promise<void>
  getSettings: () => Promise<AppSettings>
  patchSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
}
