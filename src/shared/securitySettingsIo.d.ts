import type { AllowedIpEntry } from './ipCidrCore'

export declare const SECURITY_SETTINGS_KIND: string
export declare const SECURITY_SETTINGS_VERSION: number

export function buildSecuritySettingsPayload(
  allowedIpCidrs: AllowedIpEntry[],
  exportedAt?: string
): {
  kind: string
  version: number
  exportedAt: string
  allowedIpCidrs: AllowedIpEntry[]
}

export function parseSecuritySettingsPayload(text: string): {
  allowedIpCidrs: AllowedIpEntry[]
}

export function securitySettingsExportFilename(date?: Date): string
