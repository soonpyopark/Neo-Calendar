export const QUICK_EDIT_CHROME_HEIGHT = 88
export const QUICK_EDIT_BODY_EXTRA_MONTH = 96
export const QUICK_EDIT_YEAR_VISIBLE_ITEMS = 6
export const QUICK_EDIT_ITEM_ROW_PX = 32
export const QUICK_EDIT_CREATE_ROW_PX = 36
export const QUICK_EDIT_BODY_LAYOUT_PX = 24
export const QUICK_EDIT_MIN_BODY_HEIGHT = 72
export const QUICK_EDIT_VIEWPORT_PAD = 5

export type QuickEditViewMode = 'year' | 'week' | 'month'

export type QuickEditAnchorRect = {
  top: number
  left: number
  width: number
  height: number
}

export type QuickEditWindowInit = {
  dateKey: string
  viewMode: QuickEditViewMode
  eventsHidden: boolean
  /** Day-cell footprint used for the same panel sizing as inline quick edit. */
  anchor?: QuickEditAnchorRect | null
}

export type DesktopQuickEditContext = {
  viewMode: QuickEditViewMode
  eventsHidden: boolean
}

export type QuickEditDeferToMainPayload = {
  kind: 'editor' | 'detail'
  dateKey: string
  eventId?: string
  /** Screen DIP anchor for reopening quick edit after editor closes. */
  anchorScreen?: QuickEditAnchorRect | null
}

export function quickEditBodyHeightForItems(itemCount: number): number {
  return (
    QUICK_EDIT_BODY_LAYOUT_PX +
    QUICK_EDIT_CREATE_ROW_PX +
    itemCount * QUICK_EDIT_ITEM_ROW_PX
  )
}

export const QUICK_EDIT_YEAR_MIN_BODY = quickEditBodyHeightForItems(QUICK_EDIT_YEAR_VISIBLE_ITEMS)

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Panel inner size (matches DayQuickEditPopover buildQuickEditStyle). */
export function computeQuickEditPanelSize(options: {
  viewMode: QuickEditViewMode
  anchor: QuickEditAnchorRect | null
}): { width: number; height: number } {
  const { viewMode, anchor } = options
  const floorBody =
    viewMode === 'year' ? QUICK_EDIT_YEAR_MIN_BODY : QUICK_EDIT_MIN_BODY_HEIGHT
  const bodyExtra = viewMode === 'month' ? QUICK_EDIT_BODY_EXTRA_MONTH : 0
  const usableAnchor =
    anchor && anchor.width > 0 && anchor.height > 0 ? anchor : null

  if (!usableAnchor) {
    const width = 320
    const height = Math.max(280, floorBody + QUICK_EDIT_CHROME_HEIGHT)
    return { width, height }
  }

  const padX = 12
  const width = Math.max(usableAnchor.width + padX * 2, 300)
  const desiredBody = Math.max(
    floorBody,
    Math.round(usableAnchor.height) + bodyExtra,
    bodyExtra > 0 ? 160 : QUICK_EDIT_MIN_BODY_HEIGHT
  )
  const height = desiredBody + QUICK_EDIT_CHROME_HEIGHT
  return { width, height }
}

/** Screen DIP bounds for the floating quick-edit BrowserWindow. */
export function computeQuickEditWindowBounds(options: {
  viewMode: QuickEditViewMode
  anchorClient: QuickEditAnchorRect | null
  mainOrigin: { x: number; y: number }
  workArea: { x: number; y: number; width: number; height: number }
}): { x: number; y: number; width: number; height: number } {
  const { viewMode, anchorClient, mainOrigin, workArea } = options
  const pad = QUICK_EDIT_VIEWPORT_PAD
  const panel = computeQuickEditPanelSize({ viewMode, anchor: anchorClient })

  const usableAnchor =
    anchorClient && anchorClient.width > 0 && anchorClient.height > 0 ? anchorClient : null

  let left: number
  let top: number

  if (!usableAnchor) {
    left =
      mainOrigin.x +
      Math.max(0, (320 - panel.width) / 2)
    top =
      mainOrigin.y +
      Math.max(0, (280 - panel.height) / 2)
  } else {
    const anchorScreen = {
      top: mainOrigin.y + usableAnchor.top,
      left: mainOrigin.x + usableAnchor.left,
      width: usableAnchor.width,
      height: usableAnchor.height
    }
    left = anchorScreen.left + anchorScreen.width / 2 - panel.width / 2
    top = anchorScreen.top + anchorScreen.height / 2 - panel.height / 2
  }

  const safeWidth = Math.min(panel.width, Math.max(0, workArea.width - pad * 2))
  const safeHeight = Math.min(panel.height, Math.max(0, workArea.height - pad * 2))
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
