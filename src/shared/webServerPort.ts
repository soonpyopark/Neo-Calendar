/** Default HTTP listen port when store / .env do not set one. */
export const DEFAULT_WEB_SERVER_PORT = 3010

export type WebServerMode = 'local' | 'lan'

/** Valid TCP port or null if unset / invalid. */
export function normalizeWebServerPort(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isFinite(n)) return null
  const port = Math.trunc(n)
  if (port < 1 || port > 65535) return null
  return port
}

/**
 * Prefer stored setting, then env string, then default.
 */
export function resolveWebServerPort(
  preferred?: unknown,
  envRaw?: string | null
): number {
  return (
    normalizeWebServerPort(preferred) ??
    normalizeWebServerPort(envRaw) ??
    DEFAULT_WEB_SERVER_PORT
  )
}

export function normalizeWebServerMode(value: unknown): WebServerMode | null {
  return value === 'lan' || value === 'local' ? value : null
}

/**
 * Prefer stored Local/Web choice, then .env HOSTNAME, then local.
 */
export function resolveWebServerMode(
  preferred?: unknown,
  envHostname?: string | null
): WebServerMode {
  const fromStore = normalizeWebServerMode(preferred)
  if (fromStore) return fromStore
  const hostname = String(envHostname ?? '').trim()
  if (hostname === '0.0.0.0' || hostname === '*' || hostname === '+') return 'lan'
  return 'local'
}
