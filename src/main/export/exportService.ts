import { writeFileSync } from 'node:fs'
import { BrowserWindow, dialog } from 'electron'
import type { CalendarStoreSnapshot } from '../../shared/calendarTypes'
import {
  buildExcelBuffer,
  buildPdfBuffer,
  getExcelExportFileName,
  getPdfExportFileName
} from './calendarExport.mjs'

export type ExportCalendarFormat = 'excel' | 'pdf'

export type ExportCalendarInput = {
  store: CalendarStoreSnapshot
  year: number
  month: number
  format: ExportCalendarFormat
  asAdmin?: boolean
}

export type ExportCalendarResult = {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
}

export async function exportCalendarMonth(
  input: ExportCalendarInput,
  parent: BrowserWindow | null
): Promise<ExportCalendarResult> {
  const period = {
    scope: 'month' as const,
    year: input.year,
    month: input.month
  }
  const options = { asAdmin: input.asAdmin !== false }
  const isExcel = input.format === 'excel'

  try {
    const buffer = isExcel
      ? await buildExcelBuffer(input.store, period, options)
      : await buildPdfBuffer(input.store, period, options)

    const defaultName = isExcel
      ? getExcelExportFileName(period)
      : getPdfExportFileName(period)

    const dialogOpts = {
      title: isExcel ? 'Excel로 내보내기' : 'PDF로 내보내기',
      defaultPath: defaultName,
      filters: isExcel
        ? [{ name: 'Excel', extensions: ['xlsx'] }]
        : [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const result = parent
      ? await dialog.showSaveDialog(parent, dialogOpts)
      : await dialog.showSaveDialog(dialogOpts)

    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true }
    }

    writeFileSync(result.filePath, Buffer.from(buffer))
    return { ok: true, path: result.filePath }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}
