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
  | 'dayList'

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
      fromSearch?: boolean
    }
  | {
      kind: 'dayList'
      dateKey: string
      anchor: PanelAnchorRect
      eventsHidden: boolean
    }

export type OpenPanelWindowRequest = PanelWindowInit & {
  /** Client-space anchor when opening from the main renderer. */
  anchorClient?: PanelAnchorRect | null
}

const VIEWPORT_PAD = 5

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
  const mainMinX = mainOrigin.x + pad
  const mainMinY = mainOrigin.y + pad
  const mainMaxX = mainOrigin.x + mainSize.width - pad - safeWidth
  const mainMaxY = mainOrigin.y + mainSize.height - pad - safeHeight
  x = clamp(x, mainMinX, Math.max(mainMinX, mainMaxX))
  y = clamp(y, mainMinY, Math.max(mainMinY, mainMaxY))
  const workMinX = workArea.x + pad
  const workMinY = workArea.y + pad
  const workMaxX = workArea.x + workArea.width - pad - safeWidth
  const workMaxY = workArea.y + workArea.height - pad - safeHeight
  if (workMaxX >= workMinX) {
    x = clamp(x, workMinX, workMaxX)
  }
  if (workMaxY >= workMinY) {
    y = clamp(y, workMinY, workMaxY)
  }
  return {
    width: Math.round(safeWidth),
    height: Math.round(safeHeight)
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
      workArea
    })
  }

  if (init.kind === 'dayList') {
    const anchorScreen = {
      top: mainOrigin.y + init.anchor.top,
      left: mainOrigin.x + init.anchor.left,
      width: init.anchor.width,
      height: init.anchor.height
    }
    const itemCount = 6
    const bodyHeight = 48 + itemCount * 36
    return anchoredBounds({
      anchorScreen,
      panelWidth: 280,
      panelHeight: Math.min(bodyHeight + 56, workArea.height - VIEWPORT_PAD * 2),
      workArea
    })
  }

  if (init.kind === 'eventDetail') {
    return centerInMainWindow({
      mainOrigin,
      mainSize,
      workArea,
      width: 418,
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
      height: Math.min(Math.round(mainSize.height * 0.9), workArea.height - VIEWPORT_PAD * 2)
    })
  }

  if (init.kind === 'search') {
    return centeredBounds({
      mainOrigin,
      mainSize,
      workArea,
      width: Math.min(880, mainSize.width - 24, workArea.width - VIEWPORT_PAD * 2),
      height: Math.min(700, workArea.height - VIEWPORT_PAD * 2),
      topBias: -Math.round(mainSize.height * 0.12)
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
  return (
    init.kind === 'quickEdit' ||
    init.kind === 'eventDetail' ||
    (init.kind === 'dayList' && false)
  )
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
