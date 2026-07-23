declare module './calendarExport.mjs' {
  export function buildExcelBuffer(
    store: unknown,
    period: { scope: 'month' | 'year'; year: number; month?: number },
    options?: { asAdmin?: boolean }
  ): Promise<Uint8Array | ArrayBuffer>

  export function buildPdfBuffer(
    store: unknown,
    period: { scope: 'month' | 'year'; year: number; month?: number },
    options?: { asAdmin?: boolean }
  ): Promise<Uint8Array | ArrayBuffer>

  export function getExcelExportFileName(period: {
    scope: 'month' | 'year'
    year: number
    month?: number
  }): string

  export function getPdfExportFileName(period: {
    scope: 'month' | 'year'
    year: number
    month?: number
  }): string
}
