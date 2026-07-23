import { app } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { getEnvValue } from '../dotEnv'

/**
 * Resolve MDC-compatible data root:
 * DATA_ROOT → exe-side data/ → package.json/data → userData/data
 */
export function resolveDataRoot(): string {
  const fromEnv = getEnvValue('DATA_ROOT')
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : join(process.cwd(), fromEnv)
  }

  const candidates: string[] = []
  if (process.execPath) {
    candidates.push(join(dirname(process.execPath), 'data'))
  }
  candidates.push(join(process.cwd(), 'data'))

  // Walk up from compiled main toward package.json/data
  let dir = __dirname
  for (let i = 0; i < 8 && dir; i++) {
    candidates.push(join(dir, 'data'))
    if (existsSync(join(dir, 'package.json'))) {
      candidates.push(join(dir, 'data'))
      break
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  for (const c of candidates) {
    if (existsSync(c)) return c
  }

  // Prefer workspace data next to package.json even if missing (will create)
  dir = __dirname
  for (let i = 0; i < 8 && dir; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      return join(dir, 'data')
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return join(app.getPath('userData'), 'data')
}

export function sanitizeDataKey(key: string): string {
  return String(key || 'calendar').replace(/[^a-zA-Z0-9-]/g, '-')
}
