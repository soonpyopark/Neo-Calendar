import { writeFileSync } from 'node:fs'
import { BrowserWindow, dialog } from 'electron'
import { withNativeDialog } from '../nativeDialogGuard'
import type { CalendarStoreSnapshot } from '../../shared/calendarTypes'
import {
  formatExportRangeLabel,
  normalizeExportRequest
} from '../../shared/exportCalendarHelpers.js'
import type {
  ExportCalendarFormat,
  ExportCalendarLayout,
  ExportCalendarRequest,
  ExportCalendarResult
} from '../../shared/exportCalendar'
import {
  buildExcelBuffer,
  buildPdfBuffer,
  getExcelExportFileName,
  getPdfExportFileName
} from './calendarExport.mjs'

export type { ExportCalendarFormat, ExportCalendarLayout, ExportCalendarRequest, ExportCalendarResult }

export type ExportCalendarInput = Partial<ExportCalendarRequest> & {
  store: CalendarStoreSnapshot
  format: ExportCalendarFormat
  /** Legacy month export. */
  year?: number
  month?: number
}

export async function buildCalendarExportBuffer(input: ExportCalendarInput): Promise<{
  buffer: Buffer
  filename: string
  contentType: string
  rangeLabel: string
  formatLabel: string
  layoutLabel: string
}> {
  const request = normalizeExportRequest(input) as ExportCalendarRequest
  const period = {
    layout: request.layout,
    startDate: request.startDate,
    endDate: request.endDate
  } as const
  const options = {
    asAdmin: request.asAdmin !== false,
    includeCompleted: request.includeCompleted !== false,
    includeHolidays: request.includeHolidays !== false,
    excludeHiddenCalendars: Boolean(request.excludeHiddenCalendars)
  }
  const isExcel = request.format === 'excel'
  const buffer = Buffer.from(
    isExcel
      ? await buildExcelBuffer(input.store, period, options)
      : await buildPdfBuffer(input.store, period, options)
  )
  return {
    buffer,
    filename: isExcel ? getExcelExportFileName(period) : getPdfExportFileName(period),
    contentType: isExcel
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf',
    rangeLabel: formatExportRangeLabel(request.startDate, request.endDate),
    formatLabel: isExcel ? 'Excel' : 'PDF',
    layoutLabel: request.layout === 'dayList' ? '일간 목록' : '월간 달력'
  }
}

export async function exportCalendarMonth(
  input: ExportCalendarInput,
  parent: BrowserWindow | null
): Promise<ExportCalendarResult> {
  try {
    const built = await buildCalendarExportBuffer(input)
    const isExcel = built.formatLabel === 'Excel'

    const dialogOpts = {
      title: `${built.formatLabel}로 내보내기`,
      defaultPath: built.filename,
      filters: isExcel
        ? [{ name: 'Excel', extensions: ['xlsx'] }]
        : [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const result = await withNativeDialog(async () =>
      parent ? dialog.showSaveDialog(parent, dialogOpts) : dialog.showSaveDialog(dialogOpts)
    )

    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true }
    }

    writeFileSync(result.filePath, built.buffer)
    return { ok: true, path: result.filePath }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

/** Alias used by newer call sites. */
export const exportCalendar = exportCalendarMonth
