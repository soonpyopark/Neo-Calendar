const path = require('path')
const fs = require('fs')
const os = require('os')
const { execFileSync } = require('child_process')
const { downloadArtifact } = require('@electron/get')

async function main() {
  const electronDir = path.join(__dirname, '..', 'node_modules', 'electron')
  const dist = path.join(electronDir, 'dist')
  const { version } = require(path.join(electronDir, 'package.json'))

  console.log('Downloading electron', version, process.platform, process.arch)
  const zip = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch
  })
  console.log('Downloaded:', zip, 'size', fs.statSync(zip).size)

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-extract-'))
  console.log('Extracting via PowerShell Expand-Archive to', tempDir)

  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${tempDir.replace(/'/g, "''")}' -Force`
    ],
    { stdio: 'inherit' }
  )

  fs.rmSync(dist, { recursive: true, force: true })
  fs.mkdirSync(dist, { recursive: true })
  fs.cpSync(tempDir, dist, { recursive: true })
  fs.rmSync(tempDir, { recursive: true, force: true })

  const exeName = process.platform === 'win32' ? 'electron.exe' : 'electron'
  const exePath = path.join(dist, exeName)
  if (!fs.existsSync(exePath)) {
    throw new Error(`Expected binary missing: ${exePath}`)
  }

  fs.writeFileSync(path.join(electronDir, 'path.txt'), exeName)
  console.log('Electron ready:', exePath)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
