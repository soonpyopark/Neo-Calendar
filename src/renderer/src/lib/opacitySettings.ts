import type { OpacityPreviewPatch } from '../../../shared/ipc'

export function applyOpacitySettings(settings: OpacityPreviewPatch): void {
  const root = document.documentElement
  if (settings.headerOpacity !== undefined) {
    root.style.setProperty('--neo-header-opacity', String(settings.headerOpacity))
  }
  if (settings.shellOpacity !== undefined) {
    root.style.setProperty('--neo-shell-opacity', String(settings.shellOpacity))
  }
}
