/** Open http(s) URL via Electron shell (Neo). */
export async function openExternalUrl(url: string): Promise<void> {
  const target = String(url ?? '').trim()
  if (!/^https?:\/\//i.test(target)) return
  const api = window.neoCalendar as { openExternal?: (u: string) => Promise<void> } | undefined
  if (api?.openExternal) {
    await api.openExternal(target)
    return
  }
  window.open(target, '_blank', 'noopener,noreferrer')
}
