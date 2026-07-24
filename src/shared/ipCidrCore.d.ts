export type AllowedIpEntry = { cidr: string; description?: string }

export function parseIPv4(ip: string): number | null
export function isValidIpOrCidr(value: string): boolean
export function normalizeAllowedIpCidrs(list: unknown): AllowedIpEntry[]
export function getAllowedIpCidrStrings(list: unknown): string[]
export function ipMatchesCidrRule(ipString: string, cidrRule: string): boolean
