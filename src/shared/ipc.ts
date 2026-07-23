export type SetIgnoreMouseOptions = {
  forward?: boolean
  forwardToOverlay?: boolean
}

export type NeoCalendarApi = {
  setIgnoreMouse: (ignore: boolean, options?: SetIgnoreMouseOptions) => void
}
