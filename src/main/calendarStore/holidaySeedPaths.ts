import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Resolve packaged / dev locations for the Korean holidays seed JSON.
 * Main is bundled to `out/main/`, so prefer `../shared/seed` relative to __dirname.
 */
export function holidaySeedCandidatePaths(fromDirname = __dirname): string[] {
  const resources =
    typeof process.resourcesPath === 'string' && process.resourcesPath
      ? process.resourcesPath
      : ''
  return [
    join(fromDirname, '../shared/seed/holidays-kr.json'),
    join(fromDirname, '../../shared/seed/holidays-kr.json'),
    resources ? join(resources, 'seed/holidays-kr.json') : '',
    join(process.cwd(), 'src/shared/seed/holidays-kr.json'),
    join(process.cwd(), 'out/shared/seed/holidays-kr.json')
  ].filter(Boolean)
}

export function findHolidaySeedPath(fromDirname = __dirname): string | null {
  for (const path of holidaySeedCandidatePaths(fromDirname)) {
    if (existsSync(path)) return path
  }
  return null
}
