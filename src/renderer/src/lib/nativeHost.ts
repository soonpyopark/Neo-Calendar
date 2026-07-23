/** Neo is always the Electron desktop host. */
export function isNativeHost(): boolean {
  return Boolean(window.neoCalendar)
}
