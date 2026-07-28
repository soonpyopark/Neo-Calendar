#!/usr/bin/env node
/**
 * Build neo-desktop-hit.exe into resources/desktop-hit-helper/
 * Uses .NET Framework 4.8 (preinstalled on Windows 10/11).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectDir = path.join(root, 'native', 'desktop-hit-helper')
const outDir = path.join(root, 'resources', 'desktop-hit-helper')

console.log('[desktop-hit] building helper (net48)…')
fs.mkdirSync(outDir, { recursive: true })
execFileSync(
  'dotnet',
  ['publish', projectDir, '-c', 'Release', '-o', outDir],
  { stdio: 'inherit', cwd: root, windowsHide: true }
)

const exe = path.join(outDir, 'neo-desktop-hit.exe')
if (!fs.existsSync(exe)) {
  throw new Error(`Helper exe missing after publish: ${exe}`)
}
console.log('[desktop-hit] ready:', exe)
