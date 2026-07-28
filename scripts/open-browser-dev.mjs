/**
 * Open the browser dev UI while `npm run dev` is running.
 * Waits for Electron's CalendarWebServer (API) and Vite (UI) to be ready.
 */
import { execSync } from 'node:child_process'

const API_PORT = (() => {
  const raw = process.env.PORT || process.env.NEOCALENDAR_PORT || process.env.MYCALENDAR_PORT
  const port = Number.parseInt(String(raw ?? ''), 10)
  return Number.isFinite(port) && port > 0 ? port : 3010
})()

const UI_URL = 'http://127.0.0.1:5173/'
const API_HEALTH = `http://127.0.0.1:${API_PORT}/api/health`
const TIMEOUT_MS = 120_000
const POLL_MS = 500

async function probe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

async function waitFor(url, label) {
  const started = Date.now()
  process.stdout.write(`[browser:dev] Waiting for ${label}…`)
  while (Date.now() - started < TIMEOUT_MS) {
    if (await probe(url)) {
      process.stdout.write(' ready\n')
      return true
    }
    process.stdout.write('.')
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
  process.stdout.write(' timeout\n')
  return false
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    execSync(`start "" "${url}"`, { stdio: 'ignore', windowsHide: true })
    return
  }
  if (process.platform === 'darwin') {
    execSync(`open "${url}"`, { stdio: 'ignore' })
    return
  }
  execSync(`xdg-open "${url}"`, { stdio: 'ignore' })
}

const apiOk = await waitFor(API_HEALTH, 'API (Electron web server)')
if (!apiOk) {
  console.error(`[browser:dev] API not reachable at ${API_HEALTH}`)
  console.error('[browser:dev] Start the app first: npm run dev')
  process.exit(1)
}

const uiOk = await waitFor(UI_URL, 'Vite UI')
if (!uiOk) {
  console.warn(`[browser:dev] Vite not ready at ${UI_URL} — opening anyway`)
}

openBrowser(UI_URL)
console.log(`[browser:dev] Opened ${UI_URL}`)
console.log(`[browser:dev] API: http://127.0.0.1:${API_PORT}/ (redirects to Vite in dev)`)
