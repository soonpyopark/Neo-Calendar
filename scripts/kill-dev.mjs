import { execSync } from 'node:child_process'

const ports = [5173, 5174, 5175, 5176, 5177, 5178]

function run(command) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    })
  } catch (error) {
    return error.stdout?.toString?.() ?? ''
  }
}

function killPid(pid) {
  if (!pid || pid === '0' || pid === String(process.pid)) return
  run(`taskkill /F /PID ${pid}`)
}

function killPorts(portList) {
  for (const port of portList) {
    const out = run('netstat -ano')
    const pids = new Set()
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (/^\d+$/.test(pid)) pids.add(pid)
    }
    for (const pid of pids) killPid(pid)
  }
}

function killByImage(name) {
  run(`taskkill /F /IM ${name}`)
}

console.log('[kill-dev] Freeing Vite ports and Electron processes...')
killPorts(ports)
killByImage('electron.exe')
console.log('[kill-dev] Done')
