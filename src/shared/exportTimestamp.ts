/** MDC-compatible timestamp for export filenames: yyMMdd-HHmmss */
export function getJsonExportTimestamp(date: Date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${yy}${mm}${dd}-${hh}${mi}${ss}`
}
