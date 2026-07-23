import { spawn, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

console.log('[dev:restart] Stopping previous Electron/Vite processes...')
execSync('node scripts/kill-dev.mjs', { cwd: root, stdio: 'inherit', windowsHide: true })
await new Promise((resolve) => setTimeout(resolve, 1200))

console.log('[dev:restart] Starting npm run dev...')
const child =
  process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', 'npm run dev'], {
        cwd: root,
        stdio: 'inherit',
        windowsHide: true
      })
    : spawn('npm', ['run', 'dev'], {
        cwd: root,
        stdio: 'inherit'
      })

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
