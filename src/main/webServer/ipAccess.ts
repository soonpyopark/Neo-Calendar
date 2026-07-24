import { ipMatchesCidrRule, parseIPv4 } from '../../shared/ipCidrCore.js'

function isLoopbackIp(ip: string): boolean {
  const trimmed = ip.trim()
  if (trimmed === '::1' || trimmed === '127.0.0.1') return true
  const n = parseIPv4(trimmed)
  if (n === null) return false
  // 127.0.0.0/8
  return (n >>> 24) === 127
}

/**
 * MDC IpAccessGuard: empty allowlist = allow all; loopback always allowed.
 */
export function isClientIpAllowed(
  clientIp: string | null | undefined,
  allowedCidrs: Array<{ cidr: string; description?: string }> | string[] | null | undefined
): boolean {
  const ip = normalizeClientIp(clientIp)
  if (!ip) return false
  if (isLoopbackIp(ip)) return true

  const rules = (allowedCidrs ?? [])
    .map((entry) => (typeof entry === 'string' ? entry : entry?.cidr))
    .map((cidr) => String(cidr ?? '').trim())
    .filter(Boolean)

  if (rules.length === 0) return true
  return rules.some((rule) => ipMatchesCidrRule(ip, rule))
}

export function normalizeClientIp(raw: string | null | undefined): string {
  let ip = String(raw ?? '').trim()
  if (!ip) return ''
  // Node may give ::ffff:127.0.0.1
  if (ip.startsWith('::ffff:')) ip = ip.slice(7)
  if (ip === '::1') return '127.0.0.1'
  return ip
}

export function isHostAllowed(
  hostHeader: string | null | undefined,
  allowedHosts: string[]
): boolean {
  if (allowedHosts.includes('*')) return true
  const host = String(hostHeader ?? '')
    .trim()
    .toLowerCase()
    .split(':')[0]
  if (!host) return false
  return allowedHosts.some((h) => h.toLowerCase() === host)
}

export function parseAllowedHosts(raw: string | null | undefined): string[] {
  const text = String(raw ?? '').trim()
  if (!text || text === '*') return ['*']
  return text
    .split(/[,\s]+/)
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

export function isLoopbackOnlyHosts(allowedHosts: string[]): boolean {
  if (allowedHosts.includes('*')) return false
  if (allowedHosts.length === 0) return false
  return allowedHosts.every(
    (h) => h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1'
  )
}
