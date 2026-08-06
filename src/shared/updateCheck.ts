/** GitHub Releases update check (shared types + version helpers). */

export const GITHUB_REPO = 'soonpyopark/Neo-Desktop-Calendar'
export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases`
export const RELEASES_LATEST_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

/** major.minor.patch with optional 4th build (e.g. 1.1.8.1). */
const VERSION_RE = /(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/

export type UpdateCheckResult = {
  ok: boolean
  current: string
  latest?: string | null
  releaseUrl?: string | null
  error?: string | null
}

export function versionTuple(text: string): number[] {
  const match = VERSION_RE.exec(text.trim())
  if (!match) return [0]
  return match.slice(1).filter((part): part is string => part != null).map((part) => Number(part))
}

export function parseReleaseTag(tagName: string): string | null {
  const match = VERSION_RE.exec(tagName || '')
  if (!match) return null
  return match.slice(1).filter((part): part is string => part != null).join('.')
}

export function isUpdateAvailable(result: UpdateCheckResult): boolean {
  if (!result.ok || !result.latest) return false
  const a = versionTuple(result.latest)
  const b = versionTuple(result.current)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i += 1) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left > right) return true
    if (left < right) return false
  }
  return false
}

export function versionLabel(version: string): string {
  return version.startsWith('v') ? version : `v${version}`
}
