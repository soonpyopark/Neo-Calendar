#!/usr/bin/env node
/**
 * Build per-user Windows MSI for Neo Calendar (Electron).
 * Requires WiX CLI 7+ (winget install WiXToolset.WiXCLI) and: wix eula accept wix7
 *
 * Flow:
 * 1) sync-version
 * 2) electron-vite build + electron-builder --win --dir → release/win-unpacked/
 * 3) stage into a no-space temp work dir (repo path has spaces; WiX Files Include splits on them)
 *    (+ .env with DATA_GO_KR_SERVICE_KEY)
 * 4) wix build Product.wxs → msi/Neo Calendar v{version}_YYMMDD_HHMMSS.msi
 */

import { execFileSync, execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const APP_NAME = 'Neo Calendar'
const SITE_URL = 'https://note4all.tistory.com'
const PUBLISH_DIR = path.join(ROOT, 'release', 'win-unpacked')
const MSI_OUT_DIR = path.join(ROOT, 'msi')
const PRODUCT_WXS_SRC = path.join(MSI_OUT_DIR, 'Product.wxs')
const LICENSE_RTF_SRC = path.join(MSI_OUT_DIR, 'License.rtf')
/** Staging folder name must not contain spaces (WiX Files Include splits on spaces). */
const STAGE_NAME = 'payload'
const STAGE_EXE = `${APP_NAME}.exe`
let wixCmd = 'wix'
/** @type {string | null} */
let workDir = null

function log(msg) {
  console.log(`[msi] ${msg}`)
}

function run(cmd, options = {}) {
  log(`> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, shell: true, ...options })
}

function readVersion() {
  const constants = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'constants.ts'), 'utf8')
  const match = constants.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/)
  if (match?.[1]) return match[1]
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  return pkg.version ?? '1.0.0'
}

function toMsiVersion(version, buildStamp = new Date()) {
  const parts = String(version).split('.').map((p) => Number.parseInt(p, 10) || 0)
  while (parts.length < 3) {
    parts.push(0)
  }
  // 4th part must change every MSI build so Windows Installer treats it as an upgrade
  // even when APP_VERSION (x.y.z) is unchanged. Each MSI version field max is 65535.
  const revision = Math.floor(buildStamp.getTime() / 60_000) % 65535
  return `${parts[0]}.${parts[1]}.${parts[2]}.${revision || 1}`
}

function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(2)
  return `${yy}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function resolveWixCmd() {
  try {
    execSync('wix --version', { stdio: 'pipe' })
    return 'wix'
  } catch {
    /* look under Program Files */
  }

  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const candidates = [
    path.join(programFiles, 'WiX Toolset v7.0', 'bin', 'wix.exe'),
    path.join(programFiles, 'WiX Toolset v6.0', 'bin', 'wix.exe')
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(
    'WiX CLI not found. Install: winget install WiXToolset.WiXCLI\nThen run: wix eula accept wix7'
  )
}

function ensureWix() {
  wixCmd = resolveWixCmd()
  execFileSync(wixCmd, ['--version'], { stdio: 'pipe' })
}

function resolveAppIcon() {
  const candidates = [
    path.join(ROOT, 'build', 'icon.ico'),
    path.join(ROOT, 'build', 'app.ico'),
    path.join(ROOT, 'icon.ico')
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && candidate.endsWith('.ico')) {
      return candidate
    }
  }
  throw new Error('App icon (.ico) not found (expected build/icon.ico)')
}

function readEnvFile(dir) {
  const envPath = path.join(dir, '.env')
  if (!fs.existsSync(envPath)) {
    return {}
  }

  /** @type {Record<string, string>} */
  const result = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in result)) {
      result[key] = value
    }
  }
  return result
}

function readHolidayKeyFromSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) {
    return ''
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw)
    const holidaysKr = parsed?.settings?.holidaysKr ?? parsed?.holidaysKr
    if (holidaysKr?.rememberKey && String(holidaysKr?.serviceKey ?? '').trim()) {
      return String(holidaysKr.serviceKey).trim()
    }
    if (String(holidaysKr?.serviceKey ?? '').trim()) {
      return String(holidaysKr.serviceKey).trim()
    }
  } catch {
    /* ignore */
  }
  return ''
}

/**
 * MSI 번들용 공휴일 API 키: `.env` → 로컬 settings.json (rememberKey) 순.
 */
function resolveBuildHolidayServiceKey() {
  const fileEnv = readEnvFile(ROOT)
  const fromEnv = fileEnv.DATA_GO_KR_SERVICE_KEY ?? fileEnv.HOLIDAY_API_KEY
  if (String(fromEnv ?? '').trim()) {
    return { key: String(fromEnv).trim(), source: '.env' }
  }

  const candidates = [
    path.join(ROOT, 'data', 'settings.json'),
    path.join(ROOT, 'release', 'win-unpacked', 'data', 'settings.json')
  ]

  for (const settingsPath of candidates) {
    const key = readHolidayKeyFromSettings(settingsPath)
    if (key) {
      return { key, source: path.relative(ROOT, settingsPath) }
    }
  }

  return { key: '', source: '' }
}

function upsertEnvLine(content, key, value) {
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (pattern.test(content)) {
    return content.replace(pattern, line)
  }

  const insertBlock = `\n# 공공데이터포털 특일 정보 API (대한민국 공휴일)\n${line}\n`
  const markers = [
    '\n# 공공데이터포털',
    '\n# 데이터 폴더',
    '\n# ---------------------------------------------------------------------------\n# HTTP'
  ]
  for (const marker of markers) {
    const markerIndex = content.indexOf(marker)
    if (markerIndex >= 0) {
      return `${content.slice(0, markerIndex)}${insertBlock}${content.slice(markerIndex)}`
    }
  }

  return `${content.trimEnd()}\n${insertBlock}`
}

function writeStagedEnv(stageDir, holidayKey) {
  const rootEnvPath = path.join(ROOT, '.env')
  const examplePath = path.join(ROOT, '.env.example')
  const targetPath = path.join(stageDir, '.env')

  let content = ''
  if (fs.existsSync(rootEnvPath)) {
    content = fs.readFileSync(rootEnvPath, 'utf8')
  } else if (fs.existsSync(examplePath)) {
    content = fs.readFileSync(examplePath, 'utf8')
  }

  if (holidayKey) {
    content = upsertEnvLine(content, 'DATA_GO_KR_SERVICE_KEY', holidayKey)
  }

  fs.writeFileSync(targetPath, content.replace(/\r?\n/g, '\r\n'), 'utf8')
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, path.join(stageDir, '.env.example'))
  }
}

function publishPortable() {
  run('npm run build')
  run('npx electron-builder --win --dir')
  const builtExe = path.join(PUBLISH_DIR, STAGE_EXE)
  if (!fs.existsSync(builtExe)) {
    throw new Error(`Publish output not found: ${builtExe}`)
  }
}

function prepareWorkDir() {
  // Temp paths are typically space-free (…\AppData\Local\Temp\…), unlike this repo folder.
  workDir = path.join(os.tmpdir(), `neo-calendar-msi-${process.pid}`)
  fs.rmSync(workDir, { recursive: true, force: true })
  fs.mkdirSync(workDir, { recursive: true })
  if (/\s/.test(workDir)) {
    throw new Error(`Work dir unexpectedly contains spaces: ${workDir}`)
  }
  return workDir
}

function stageForMsi() {
  const builtExe = path.join(PUBLISH_DIR, STAGE_EXE)
  if (!fs.existsSync(builtExe)) {
    throw new Error(`Publish output not found: ${builtExe}`)
  }
  if (!fs.existsSync(PRODUCT_WXS_SRC)) {
    throw new Error(`Missing ${PRODUCT_WXS_SRC}`)
  }
  if (!fs.existsSync(LICENSE_RTF_SRC)) {
    throw new Error(`Missing ${LICENSE_RTF_SRC}`)
  }

  const dir = prepareWorkDir()
  const stageDir = path.join(dir, STAGE_NAME)

  fs.cpSync(PUBLISH_DIR, stageDir, { recursive: true })
  fs.copyFileSync(resolveAppIcon(), path.join(stageDir, 'app-icon.ico'))
  fs.copyFileSync(PRODUCT_WXS_SRC, path.join(dir, 'Product.wxs'))
  fs.copyFileSync(LICENSE_RTF_SRC, path.join(dir, 'License.rtf'))

  for (const name of ['LICENSE', 'README.md']) {
    const src = path.join(ROOT, name)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(stageDir, name))
    }
  }

  const { key: holidayKey, source } = resolveBuildHolidayServiceKey()
  writeStagedEnv(stageDir, holidayKey)
  if (!holidayKey) {
    throw new Error(
      '대한민국 휴일 API 키가 없습니다. 프로젝트 루트 .env에 DATA_GO_KR_SERVICE_KEY를 넣거나 data/settings.json에 rememberKey+serviceKey를 저장한 뒤 다시 빌드하세요.'
    )
  }
  // Do not ship data/ inside the MSI — first-launch writes then fail with access denied.
  // Holiday key is applied from .env on first run.
  fs.rmSync(path.join(stageDir, 'data'), { recursive: true, force: true })
  log(`included holiday API key in .env (first-run seed) from ${source}`)
  log(`staged: ${stageDir}`)
}

function buildMsi() {
  if (!workDir) throw new Error('Work dir not prepared')

  const version = readVersion()
  const productVersion = toMsiVersion(version)
  // New ProductCode every build + MajorUpgrade AllowSameVersionUpgrades removes prior ARP entries.
  const productCode = randomUUID().toUpperCase()
  const timestamp = formatTimestamp()
  const outputName = `${APP_NAME} v${version}_${timestamp}.msi`
  const outputPath = path.join(MSI_OUT_DIR, outputName)
  const workOutput = path.join(workDir, outputName.replace(/\s/g, '_'))

  fs.mkdirSync(MSI_OUT_DIR, { recursive: true })
  fs.rmSync(outputPath, { force: true })

  // WiX 7 expects: -d Name=Value  (flag and value as separate argv entries).
  // MsiDir has no spaces (temp), so Files Include="$(var.MsiDir)\payload\**" is safe.
  const wixArgs = [
    'build',
    path.join(workDir, 'Product.wxs'),
    '-d',
    `ProductVersion=${productVersion}`,
    '-d',
    `ProductCode=${productCode}`,
    '-d',
    `MsiDir=${workDir}`,
    '-bindpath',
    workDir,
    '-ext',
    'WixToolset.UI.wixext',
    '-o',
    workOutput
  ]
  log(`> ${wixCmd} ${wixArgs.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`)
  execFileSync(wixCmd, wixArgs, { stdio: 'inherit', cwd: workDir })

  fs.copyFileSync(workOutput, outputPath)
  const sizeMb = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1)
  log(`output: ${outputPath} (${sizeMb} MB)`)
  log(`ProductVersion=${productVersion} ProductCode={${productCode}}`)
  log(`site: ${SITE_URL}`)
}

function cleanupWorkDir() {
  if (!workDir) return
  fs.rmSync(workDir, { recursive: true, force: true })
  workDir = null
  log('removed staging folder')
}

function main() {
  ensureWix()
  run('node scripts/sync-version.mjs')
  publishPortable()
  stageForMsi()

  try {
    buildMsi()
  } finally {
    cleanupWorkDir()
  }

  log('설치: msi 폴더의 .msi 파일을 더블 클릭하세요 (관리자 권한 불필요).')
  log('done')
}

try {
  main()
} catch (error) {
  console.error('[msi] failed:', error.message ?? error)
  process.exit(1)
}
