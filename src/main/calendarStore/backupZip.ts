import AdmZip from 'adm-zip'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { dialog, type BrowserWindow } from 'electron'
import type { CalendarStore } from './CalendarStore'
import type { CalendarStoreSnapshot } from '../../shared/calendarTypes'

export type BackupZipResult = {
  ok: boolean
  cancelled?: boolean
  path?: string
  attachmentFiles?: number
  eventsWithAttachments?: number
  store?: CalendarStoreSnapshot
}

function stampForZip(): string {
  const d = new Date()
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${yy}${mm}${dd}_${hh}${mi}${ss}`
}

function trySanitizeId(id: string): string | null {
  const safeId = String(id ?? '').trim()
  if (!safeId) return null
  if (/[<>:"/\\|?*\x00-\x1f]/.test(safeId)) return null
  if (safeId.includes('..')) return null
  return safeId
}

function tryDeleteDir(path: string): void {
  try {
    if (existsSync(path)) rmSync(path, { recursive: true, force: true })
  } catch (error) {
    console.warn('[backup] temp cleanup failed', error)
  }
}

function findStoreJson(extractDir: string): string | null {
  const root = join(extractDir, 'store.json')
  if (existsSync(root)) return root
  for (const name of readdirSync(extractDir)) {
    const nested = join(extractDir, name, 'store.json')
    if (existsSync(nested) && statSync(join(extractDir, name)).isDirectory()) {
      return nested
    }
  }
  return null
}

function extractZipSafe(zipPath: string, destDir: string): void {
  const destFull = resolve(destDir) + sep
  const zip = new AdmZip(zipPath)
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const relative = entry.entryName.replace(/\//g, sep)
    const target = resolve(destDir, relative)
    if (!target.startsWith(destFull)) {
      throw new Error('ZIP에 허용되지 않은 경로가 포함되어 있습니다.')
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, entry.getData())
  }
}

function replaceAttachmentsFrom(
  attachmentsRoot: string,
  sourceAttachmentsDir: string
): number {
  tryDeleteDir(attachmentsRoot)
  mkdirSync(attachmentsRoot, { recursive: true })
  if (!existsSync(sourceAttachmentsDir)) return 0

  let fileCount = 0
  for (const eventId of readdirSync(sourceAttachmentsDir)) {
    const eventDir = join(sourceAttachmentsDir, eventId)
    if (!statSync(eventDir).isDirectory()) continue
    const safeId = trySanitizeId(eventId)
    if (!safeId) continue
    const destDir = join(attachmentsRoot, safeId)
    mkdirSync(destDir, { recursive: true })
    for (const name of readdirSync(eventDir)) {
      const source = join(eventDir, name)
      if (!statSync(source).isFile()) continue
      if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) continue
      copyFileSync(source, join(destDir, name))
      fileCount += 1
    }
  }
  return fileCount
}

function stageBackupZip(store: CalendarStore): {
  staging: string
  fileCount: number
  eventCount: number
} {
  const staging = mkdtempSync(join(tmpdir(), 'neo-backup-'))
  const snapshot = store.getSnapshot()
  writeFileSync(join(staging, 'store.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

  const attachStaging = join(staging, 'attachments')
  mkdirSync(attachStaging, { recursive: true })
  const attachmentsRoot = join(store.dataRoot, 'attachments')

  let fileCount = 0
  let eventCount = 0
  for (const evt of snapshot.events) {
    const safeId = trySanitizeId(evt.id)
    if (!safeId) continue
    const attachments = evt.attachments ?? []
    if (attachments.length === 0) continue

    let copiedForEvent = 0
    const eventDir = join(attachStaging, safeId)
    for (const att of attachments) {
      const fileName = basename(String(att.storedName ?? ''))
      if (!fileName) continue
      const source = join(attachmentsRoot, safeId, fileName)
      if (!existsSync(source)) continue
      mkdirSync(eventDir, { recursive: true })
      copyFileSync(source, join(eventDir, fileName))
      fileCount += 1
      copiedForEvent += 1
    }
    if (copiedForEvent > 0) eventCount += 1
  }
  return { staging, fileCount, eventCount }
}

function writeBackupZip(store: CalendarStore, zipPath: string): { fileCount: number; eventCount: number } {
  const { staging, fileCount, eventCount } = stageBackupZip(store)
  try {
    const zip = new AdmZip()
    zip.addLocalFolder(staging)
    zip.writeZip(zipPath)
    return { fileCount, eventCount }
  } finally {
    tryDeleteDir(staging)
  }
}

/** Browser / HTTP: build ZIP bytes without a Save dialog. */
export function createBackupZipBuffer(store: CalendarStore): {
  buffer: Buffer
  fileCount: number
  eventCount: number
  filename: string
} {
  const { staging, fileCount, eventCount } = stageBackupZip(store)
  try {
    const zip = new AdmZip()
    zip.addLocalFolder(staging)
    return {
      buffer: zip.toBuffer(),
      fileCount,
      eventCount,
      filename: `my-calendar-backup-${stampForZip()}.zip`
    }
  } finally {
    tryDeleteDir(staging)
  }
}

function restoreFromExtractedDir(store: CalendarStore, extractDir: string): BackupZipResult {
  const storePath = findStoreJson(extractDir)
  if (!storePath) {
    throw new Error('ZIP에 store.json이 없습니다. 이 앱의 백업 ZIP인지 확인해 주세요.')
  }

  let payload: unknown
  try {
    payload = JSON.parse(readFileSync(storePath, 'utf8'))
  } catch (error) {
    throw new Error(
      `store.json을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const imported = store.importStore(payload)
  const zipAttachments = join(dirname(storePath), 'attachments')
  const fileCount = replaceAttachmentsFrom(join(store.dataRoot, 'attachments'), zipAttachments)

  return {
    ok: true,
    cancelled: false,
    attachmentFiles: fileCount,
    store: imported
  }
}

/** Browser / HTTP: restore from uploaded ZIP bytes. */
export function restoreBackupZipBuffer(store: CalendarStore, zipBuffer: Buffer): BackupZipResult {
  const extractDir = mkdtempSync(join(tmpdir(), 'neo-restore-'))
  try {
    const zipPath = join(extractDir, 'upload.zip')
    writeFileSync(zipPath, zipBuffer)
    const unpackDir = join(extractDir, 'unpacked')
    mkdirSync(unpackDir, { recursive: true })
    extractZipSafe(zipPath, unpackDir)
    return restoreFromExtractedDir(store, unpackDir)
  } finally {
    tryDeleteDir(extractDir)
  }
}

export async function exportBackupZip(
  store: CalendarStore,
  ownerWindow?: BrowserWindow | null
): Promise<BackupZipResult> {
  const stamp = stampForZip()
  const saveOpts: Electron.SaveDialogOptions = {
    title: '일정 + 첨부 백업 저장',
    defaultPath: `my-calendar-backup-${stamp}.zip`,
    filters: [{ name: 'ZIP 백업', extensions: ['zip'] }]
  }
  const result =
    ownerWindow && !ownerWindow.isDestroyed()
      ? await dialog.showSaveDialog(ownerWindow, saveOpts)
      : await dialog.showSaveDialog(saveOpts)
  if (result.canceled || !result.filePath) {
    return { ok: true, cancelled: true }
  }

  const { fileCount, eventCount } = writeBackupZip(store, result.filePath)
  return {
    ok: true,
    cancelled: false,
    path: result.filePath,
    attachmentFiles: fileCount,
    eventsWithAttachments: eventCount
  }
}

export async function importBackupZip(
  store: CalendarStore,
  ownerWindow?: BrowserWindow | null
): Promise<BackupZipResult> {
  const openOpts: Electron.OpenDialogOptions = {
    title: '일정 + 첨부 백업 가져오기',
    filters: [{ name: 'ZIP 백업', extensions: ['zip'] }],
    properties: ['openFile']
  }
  const result =
    ownerWindow && !ownerWindow.isDestroyed()
      ? await dialog.showOpenDialog(ownerWindow, openOpts)
      : await dialog.showOpenDialog(openOpts)
  if (result.canceled || result.filePaths.length === 0) {
    return { ok: true, cancelled: true }
  }

  const zipPath = result.filePaths[0]
  const extractDir = mkdtempSync(join(tmpdir(), 'neo-restore-'))
  try {
    extractZipSafe(zipPath, extractDir)
    const restored = restoreFromExtractedDir(store, extractDir)
    return { ...restored, path: zipPath }
  } finally {
    tryDeleteDir(extractDir)
  }
}
