/** Shared helpers for image context actions (copy / download). */

export function sanitizeImageDownloadName(name: string, fallback = 'image.png'): string {
  const trimmed = String(name ?? '').trim() || fallback
  const safe = trimmed.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(safe)) return safe
  return `${safe}.png`
}

export async function dataUrlToPngBlob(dataUrl: string): Promise<Blob> {
  const image = new Image()
  image.decoding = 'async'
  image.src = dataUrl
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  if (canvas.width <= 0 || canvas.height <= 0) {
    throw new Error('이미지를 복사할 수 없습니다.')
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이미지를 복사할 수 없습니다.')
  ctx.drawImage(image, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  if (!blob) throw new Error('이미지를 복사할 수 없습니다.')
  return blob
}

/** Copy a data-URL image to the system clipboard as PNG. */
export async function copyImageFromDataUrl(dataUrl: string): Promise<void> {
  if (!dataUrl) throw new Error('이미지가 없습니다.')
  const blob = await dataUrlToPngBlob(dataUrl)
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('이 환경에서는 클립보드 복사를 지원하지 않습니다.')
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

/** Trigger a browser/Electron download of a data-URL image. */
export function downloadImageFromDataUrl(dataUrl: string, filename: string): void {
  if (!dataUrl) throw new Error('이미지가 없습니다.')
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = sanitizeImageDownloadName(filename)
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
