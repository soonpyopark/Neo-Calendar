import {
  computeQuickEditPanelSize,
  computeQuickEditWindowBounds,
  type QuickEditAnchorRect,
  type QuickEditViewMode
} from './quickEditLayout'

export type PanelKind =
  | 'quickEdit'
  | 'eventEditor'
  | 'settings'
  | 'search'
  | 'eventDetail'
  | 'exportConfirm'
  | 'login'

export type PanelAnchorRect = QuickEditAnchorRect

export type PanelReturnQuickEdit = {
  dateKey: string
  anchor?: PanelAnchorRect | null
}

export type PanelWindowInit =
  | {
      kind: 'quickEdit'
      dateKey: string
      viewMode: QuickEditViewMode
      eventsHidden: boolean
      anchor?: PanelAnchorRect | null
    }
  | {
      kind: 'eventEditor'
      eventId?: string | null
      defaultDate?: string
      occurrenceDate?: string | null
      returnQuickEdit?: PanelReturnQuickEdit | null
    }
  | {
      kind: 'settings'
    }
  | {
      kind: 'search'
      eventsHidden: boolean
    }
  | {
      kind: 'eventDetail'
      eventId: string
      dayKey?: string
      anchor?: PanelAnchorRect | null
      /** Screen DIP pointer — used when opening from another floating panel window. */
      pointerScreen?: { x: number; y: number } | null
      fromSearch?: boolean
    }
  | {
      kind: 'exportConfirm'
      format: 'excel' | 'pdf'
      year: number
      month: number
    }
  | {
      kind: 'login'
      /** When false, backdrop/close/cancel cannot dismiss (login wall). */
      dismissible?: boolean
    }

export type OpenPanelWindowRequest = PanelWindowInit & {
  /** Client-space anchor when opening from the main renderer. */
  anchorClient?: PanelAnchorRect | null
}

const VIEWPORT_PAD = 5

/** Event detail popover / floating panel width (px). */
export const EVENT_DETAIL_PANEL_WIDTH = 530

/** Floating search panel size (px). */
export const SEARCH_PANEL_WIDTH = 880
export const SEARCH_PANEL_MIN_HEIGHT = 300
export const SEARCH_PANEL_MAX_HEIGHT = 540
export const SEARCH_PANEL_CHROME_PAD = 16

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function centeredBounds(options: {
  mainOrigin: { x: number; y: number }
  mainSize: { width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  width: number
  height: number
  topBias?: number
}): { x: number; y: number; width: number; height: number } {
  const pad = VIEWPORT_PAD
  const { mainOrigin, mainSize, workArea, topBias = 0 } = options
  const safeWidth = Math.min(options.width, Math.max(0, workArea.width - pad * 2))
  const safeHeight = Math.min(options.height, Math.max(0, workArea.height - pad * 2))
  const centerX = mainOrigin.x + mainSize.width / 2
  const centerY = mainOrigin.y + mainSize.height / 2 + topBias
  const left = centerX - safeWidth / 2
  const top = centerY - safeHeight / 2
  const minLeft = workArea.x + pad
  const minTop = workArea.y + pad
  const maxLeft = workArea.x + workArea.width - pad - safeWidth
  const maxTop = workArea.y + workArea.height - pad - safeHeight
  return {
    x: Math.round(clamp(left, minLeft, Math.max(minLeft, maxLeft))),
    y: Math.round(clamp(top, minTop, Math.max(minTop, maxTop))),
    width: Math.round(safeWidth),
    height: Math.round(safeHeight)
  }
}

/** Center within the main calendar window; clamp only if the panel exceeds work area. */
function centerInMainWindow(options: {
  mainOrigin: { x: number; y: number }
  mainSize: { width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  width: number
  height: number
}): { x: number; y: number; width: number; height: number } {
  const pad = VIEWPORT_PAD
  const { mainOrigin, mainSize, workArea } = options
  const safeWidth = Math.min(
    options.width,
    Math.max(0, mainSize.width - pad * 2),
    Math.max(0, workArea.width - pad * 2)
  )
  const safeHeight = Math.min(
    options.height,
    Math.max(0, mainSize.height - pad * 2),
    Math.max(0, workArea.height - pad * 2)
  )
  let x = mainOrigin.x + Math.round((mainSize.width - safeWidth) / 2)
  let y = mainOrigin.y + Math.round((mainSize.height - safeHeight) / 2)
  const minX = workArea.x + pad
  const minY = workArea.y + pad
  const maxX = workArea.x + workArea.width - pad - safeWidth
  const maxY = workArea.y + workArea.height - pad - safeHeight
  return {
    x: Math.round(clamp(x, minX, Math.max(minX, maxX))),
    y: Math.round(clamp(y, minY, Math.max(minY, maxY))),
    width: Math.round(safeWidth),
    height: Math.round(safeHeight)
  }
}

/** Place panel top edge just below an anchor (header toolbar button), clamped to main window. */
function belowAnchoredBounds(options: {
  anchorScreen: PanelAnchorRect
  panelWidth: number
  panelHeight: number
  workArea: { x: number; y: number; width: number; height: number }
  mainOrigin: { x: number; y: number }
  mainSize: { width: number; height: number }
  gap?: number
}): { x: number; y: number; width: number; height: number } {
  const pad = VIEWPORT_PAD
  const gap = options.gap ?? 8
  const { anchorScreen, workArea, mainOrigin, mainSize } = options
  const panelWidth = Math.min(
    options.panelWidth,
    Math.max(0, mainSize.width - pad * 2),
    Math.max(0, workArea.width - pad * 2)
  )
  const panelHeight = Math.min(
    options.panelHeight,
    Math.max(0, mainSize.height - pad * 2),
    Math.max(0, workArea.height - pad * 2)
  )

  let left = anchorScreen.left + anchorScreen.width / 2 - panelWidth / 2
  let top = anchorScreen.bottom + gap

  const boundsLeft = mainOrigin.x + pad
  const boundsTop = mainOrigin.y + pad
  const boundsRight = mainOrigin.x + mainSize.width - pad
  const boundsBottom = mainOrigin.y + mainSize.height - pad

  left = clamp(left, boundsLeft, Math.max(boundsLeft, boundsRight - panelWidth))
  top = clamp(top, boundsTop, Math.max(boundsTop, boundsBottom - panelHeight))

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(panelWidth),
    height: Math.round(panelHeight)
  }
}

function anchoredBounds(options: {
  anchorScreen: PanelAnchorRect
  panelWidth: number
  panelHeight: number
  workArea: { x: number; y: number; width: number; height: number }
}): { x: number; y: number; width: number; height: number } {
  const pad = VIEWPORT_PAD
  const { anchorScreen, workArea } = options
  const panelWidth = Math.min(options.panelWidth, Math.max(0, workArea.width - pad * 2))
  const panelHeight = Math.min(options.panelHeight, Math.max(0, workArea.height - pad * 2))
  let left = anchorScreen.left + anchorScreen.width / 2 - panelWidth / 2
  let top = anchorScreen.top + anchorScreen.height / 2 - panelHeight / 2
  const minLeft = workArea.x + pad
  const minTop = workArea.y + pad
  const maxLeft = workArea.x + workArea.width - pad - panelWidth
  const maxTop = workArea.y + workArea.height - pad - panelHeight
  return {
    x: Math.round(clamp(left, minLeft, Math.max(minLeft, maxLeft))),
    y: Math.round(clamp(top, minTop, Math.max(minTop, maxTop))),
    width: Math.round(panelWidth),
    height: Math.round(panelHeight)
  }
}

function isPointerAnchorRect(anchor: PanelAnchorRect): boolean {
  return anchor.width > 0 && anchor.height > 0 && anchor.width <= 32 && anchor.height <= 32
}

/** Place near the pointer (below/right with flip), clamped to the main calendar window. */
function pointerAnchoredBounds(options: {
  pointerClient: { x: number; y: number }
  mainOrigin: { x: number; y: number }
  mainSize: { width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  panelWidth: number
  panelHeight: number
  gap?: number
}): { x: number; y: number; width: number; height: number } {
  const pad = VIEWPORT_PAD
  const gap = options.gap ?? 8
  const { pointerClient, mainOrigin, mainSize, workArea } = options
  const panelWidth = Math.min(
    options.panelWidth,
    Math.max(0, mainSize.width - pad * 2),
    Math.max(0, workArea.width - pad * 2)
  )
  const panelHeight = Math.min(
    options.panelHeight,
    Math.max(0, mainSize.height - pad * 2),
    Math.max(0, workArea.height - pad * 2)
  )
  const boundsLeft = mainOrigin.x + pad
  const boundsTop = mainOrigin.y + pad
  const boundsRight = mainOrigin.x + mainSize.width - pad
  const boundsBottom = mainOrigin.y + mainSize.height - pad

  const screenX = mainOrigin.x + pointerClient.x
  const screenY = mainOrigin.y + pointerClient.y

  let left = screenX + gap
  if (left + panelWidth > boundsRight) {
    left = screenX - panelWidth - gap
  }
  left = clamp(left, boundsLeft, Math.max(boundsLeft, boundsRight - panelWidth))

  let top = screenY + gap
  if (top + panelHeight > boundsBottom) {
    const aboveTop = screenY - gap - panelHeight
    if (aboveTop >= boundsTop) {
      top = aboveTop
    }
  }
  top = clamp(top, boundsTop, Math.max(boundsTop, boundsBottom - panelHeight))

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(panelWidth),
    height: Math.round(panelHeight)
  }
}

/** Screen DIP bounds for a floating panel BrowserWindow. */
export function computePanelWindowBounds(options: {
  init: PanelWindowInit
  anchorClient: PanelAnchorRect | null
  mainOrigin: { x: number; y: number }
  mainSize: { width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
}): { x: number; y: number; width: number; height: number } {
  const { init, anchorClient, mainOrigin, mainSize, workArea } = options

  if (init.kind === 'quickEdit') {
    return computeQuickEditWindowBounds({
      viewMode: init.viewMode,
      anchorClient,
      mainOrigin,
      mainSize,
      workArea
    })
  }

  if (init.kind === 'eventDetail') {
    const detailInit = init
    if (detailInit.pointerScreen) {
      return pointerAnchoredBounds({
        pointerClient: {
          x: detailInit.pointerScreen.x - mainOrigin.x,
          y: detailInit.pointerScreen.y - mainOrigin.y
        },
        mainOrigin,
        mainSize,
        workArea,
        panelWidth: EVENT_DETAIL_PANEL_WIDTH,
        panelHeight: 360
      })
    }

    const usable =
      anchorClient && anchorClient.width > 0 && anchorClient.height > 0 ? anchorClient : null
    if (usable) {
      if (isPointerAnchorRect(usable)) {
        return pointerAnchoredBounds({
          pointerClient: {
            x: usable.left + usable.width / 2,
            y: usable.top + usable.height / 2
          },
          mainOrigin,
          mainSize,
          workArea,
          panelWidth: EVENT_DETAIL_PANEL_WIDTH,
          panelHeight: 360
        })
      }
      const anchorScreen = {
        top: mainOrigin.y + usable.top,
        left: mainOrigin.x + usable.left,
        width: usable.width,
        height: usable.height
      }
      return anchoredBounds({
        anchorScreen,
        panelWidth: EVENT_DETAIL_PANEL_WIDTH,
        panelHeight: 360,
        workArea
      })
    }
    return centeredBounds({
      mainOrigin,
      mainSize,
      workArea,
      width: EVENT_DETAIL_PANEL_WIDTH,
      height: 360
    })
  }

  if (init.kind === 'eventEditor') {
    return centerInMainWindow({
      mainOrigin,
      mainSize,
      workArea,
      width: Math.min(752, mainSize.width - 32, workArea.width - VIEWPORT_PAD * 2),
      height: Math.min(Math.round(mainSize.height * 0.92), workArea.height - VIEWPORT_PAD * 2)
    })
  }

  if (init.kind === 'settings') {
    return centerInMainWindow({
      mainOrigin,
      mainSize,
      workArea,
      width: Math.round(mainSize.width * 0.9),
      height: Math.min(Math.round(mainSize.height * 0.8), workArea.height - VIEWPORT_PAD * 2)
    })
  }

  if (init.kind === 'search') {
    const width = Math.min(SEARCH_PANEL_WIDTH, mainSize.width - 24, workArea.width - VIEWPORT_PAD * 2)
    const height = Math.min(SEARCH_PANEL_MIN_HEIGHT, workArea.height - VIEWPORT_PAD * 2)
    if (anchorClient && anchorClient.width > 0 && anchorClient.height > 0) {
      return belowAnchoredBounds({
        anchorScreen: {
          top: mainOrigin.y + anchorClient.top,
          left: mainOrigin.x + anchorClient.left,
          width: anchorClient.width,
          height: anchorClient.height
        },
        panelWidth: width,
        panelHeight: height,
        workArea,
        mainOrigin,
        mainSize
      })
    }
    return centeredBounds({
      mainOrigin,
      mainSize,
      workArea,
      width,
      height,
      topBias: -Math.round(mainSize.height * 0.12)
    })
  }

  if (init.kind === 'exportConfirm') {
    return centeredBounds({
      mainOrigin,
      mainSize,
      workArea,
      width: 392,
      height: 176
    })
  }

  if (init.kind === 'login') {
    return centeredBounds({
      mainOrigin,
      mainSize,
      workArea,
      width: 392,
      height: 300
    })
  }

  return centeredBounds({
    mainOrigin,
    mainSize,
    workArea,
    width: 320,
    height: 280
  })
}

export function panelInitUsesAnchorClient(init: PanelWindowInit): boolean {
  return init.kind === 'quickEdit' || init.kind === 'eventDetail'
}

export function quickEditPanelSizeForInit(init: Extract<PanelWindowInit, { kind: 'quickEdit' }>): {
  width: number
  height: number
} {
  return computeQuickEditPanelSize({
    viewMode: init.viewMode,
    anchor: init.anchor ?? null
  })
}
