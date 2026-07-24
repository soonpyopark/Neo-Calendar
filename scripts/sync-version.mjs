#!/usr/bin/env node
/**
 * Sync display version into package.json / .env.example / MSI License.rtf / README.
 * Source of truth: src/shared/constants.ts → APP_VERSION
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const APP_NAME = 'Neo Calendar'
const SITE_URL = 'https://note4all.tistory.com'
const CONSTANTS_PATH = path.join(ROOT, 'src', 'shared', 'constants.ts')

function readVersion() {
  const constants = fs.readFileSync(CONSTANTS_PATH, 'utf8')
  const match = constants.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/)
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const version = match?.[1] ?? pkg.version
  if (!version) throw new Error('Could not resolve app version')
  return version
}

function writeIfChanged(filePath, next) {
  const prev = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null
  if (prev === next) return false
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, next, 'utf8')
  return true
}

function syncPackageJson(version) {
  const filePath = path.join(ROOT, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (pkg.version !== version) {
    pkg.version = version
    fs.writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
    console.log(`[sync-version] package.json -> ${version}`)
  }
}

function syncReadme(version) {
  const filePath = path.join(ROOT, 'README.md')
  if (!fs.existsSync(filePath)) return
  let text = fs.readFileSync(filePath, 'utf8')
  const next = text.replace(/^# Neo Calendar(?:\s+v[^\n]+)?/m, `# Neo Calendar v${version}`)
  if (writeIfChanged(filePath, next)) {
    console.log(`[sync-version] README.md -> ${APP_NAME} v${version}`)
  }
}

function syncEnvExample(version) {
  const filePath = path.join(ROOT, '.env.example')
  if (!fs.existsSync(filePath)) return
  let text = fs.readFileSync(filePath, 'utf8')
  if (/^# Neo Calendar/m.test(text)) {
    text = text.replace(/^# Neo Calendar[^\n]*/m, `# Neo Calendar v${version} — Electron`)
  } else {
    text = `# Neo Calendar v${version} — Electron\n${text}`
  }
  if (writeIfChanged(filePath, text)) {
    console.log(`[sync-version] .env.example -> ${version}`)
  }
}

function syncMsiLicenseRtf(version) {
  const filePath = path.join(ROOT, 'msi', 'License.rtf')
  const body =
    '{\\rtf1\\ansi\\ansicpg65001\\deff0{\\fonttbl{\\f0\\fnil\\fcharset0 Segoe UI;}}\n'
    + '\\viewkind4\\uc1\\pard\\sa200\\sl276\\slmult1\\f0\\fs22 '
    + `${APP_NAME} v${version}\\par\n`
    + `${SITE_URL}\\par\n`
    + '}\n'
  if (writeIfChanged(filePath, body)) {
    console.log(`[sync-version] msi/License.rtf -> ${APP_NAME} v${version}`)
  }
}

const version = readVersion()
syncPackageJson(version)
syncReadme(version)
syncEnvExample(version)
syncMsiLicenseRtf(version)
console.log(`[sync-version] done (${APP_NAME} v${version})`)
