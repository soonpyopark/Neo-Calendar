export type SetIgnoreMouseOptions = {
  /** Electron native option mapped in main */
  forward?: boolean
  /** Project alias; treated the same as `forward` in main */
  forwardToOverlay?: boolean
}

export type NeoCalendarApi = {
  setIgnoreMouse: (ignore: boolean, options?: SetIgnoreMouseOptions) => void
}
