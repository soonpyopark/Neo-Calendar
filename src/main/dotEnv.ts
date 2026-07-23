import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_ADMIN_ID, DEFAULT_ADMIN_PW } from '../shared/constants'

let cachedFileEnv: Record<string, string> | null = null

/**
 * Load key=value pairs from `.env` next to the exe / build output and up toward package.json.
 * Mirrors MDC DotEnv.cs behavior.
 */
export function loadDotEnv(forceReload = false): Record<string, string> {
  if (cachedFileEnv && !forceReload) return cachedFileEnv

  const result: Record<string, string> = {}
  for (const path of enumerateDotEnvPaths()) {
    mergeDotEnvFile(path, result)
  }
  cachedFileEnv = result

  // Fill process.env only when unset (so real env wins).
  for (const [key, value] of Object.entries(result)) {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value
    }
  }

  return result
}

export function getEnvValue(...keys: string[]): string | null {
  const fileEnv = loadDotEnv()
  for (const key of keys) {
    const fromProc = process.env[key]
    if (typeof fromProc === 'string' && fromProc.trim()) return fromProc.trim()
    const fromFile = fileEnv[key]
    if (typeof fromFile === 'string' && fromFile.trim()) return fromFile.trim()
  }
  return null
}

/** Admin login: MYCALENDAR_* → NEOCALENDAR_* → ADMIN_* → defaults. */
export function resolveAdminCredentials(): { id: string; password: string } {
  const id =
    getEnvValue('MYCALENDAR_ADMIN_ID', 'NEOCALENDAR_ADMIN_ID', 'ADMIN_ID') ?? DEFAULT_ADMIN_ID
  const password =
    getEnvValue(
      'MYCALENDAR_ADMIN_PW',
      'NEOCALENDAR_ADMIN_PW',
      'ADMIN_PW',
      'ADMIN_PASSWORD'
    ) ?? DEFAULT_ADMIN_PW
  return { id, password }
}

function enumerateDotEnvPaths(): string[] {
  const seen = new Set<string>()
  const paths: string[] = []

  const starts = new Set<string>()
  // Packaged: beside the executable
  if (process.execPath) starts.add(dirname(process.execPath))
  // Dev / electron-vite: walk up from compiled main bundle
  starts.add(__dirname)
  if (process.cwd()) starts.add(process.cwd())

  for (const start of starts) {
    let dir = start
    for (let i = 0; i < 8 && dir; i++) {
      const candidate = join(dir, '.env')
      const key = candidate.toLowerCase()
      if (!seen.has(key) && existsSync(candidate)) {
        seen.add(key)
        paths.push(candidate)
      }
      if (existsSync(join(dir, 'package.json'))) break
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }

  return paths
}

function mergeDotEnvFile(envPath: string, result: Record<string, string>): void {
  try {
    const text = readFileSync(envPath, 'utf8')
    for (const rawLine of text.split(/\r?\n/)) {
      const trimmed = rawLine.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex <= 0) continue
      const key = trimmed.slice(0, separatorIndex).trim()
      let value = trimmed.slice(separatorIndex + 1).trim()
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1)
      }
      if (!(key in result)) {
        result[key] = value
      }
    }
    console.log('[dotenv] Loaded', envPath)
  } catch {
    /* ignore unreadable .env */
  }
}
