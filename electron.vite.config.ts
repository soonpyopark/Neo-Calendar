import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

/** Calendar HTTP API port (same default as CalendarWebServer). */
function resolveDevApiPort(): number {
  const raw = process.env.PORT || process.env.NEOCALENDAR_PORT || process.env.MYCALENDAR_PORT
  const port = Number.parseInt(String(raw ?? ''), 10)
  return Number.isFinite(port) && port > 0 ? port : 3010
}

function resolveApiProxyTarget(): string {
  return `http://127.0.0.1:${resolveDevApiPort()}`
}

const devApiPort = resolveDevApiPort()
const apiProxyTarget = resolveApiProxyTarget()

/** Print browser test URLs when Vite dev server listens. */
function devBrowserHintPlugin(): Plugin {
  return {
    name: 'neo-dev-browser-hint',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const port = server.config.server.port ?? 5173
        console.log('')
        console.log('[dev:browser] Browser UI (use while `npm run dev` is running):')
        console.log(`  → http://127.0.0.1:${port}/`)
        console.log(`  → API proxy → http://127.0.0.1:${devApiPort}/api`)
        console.log('[dev:browser] Or run: npm run browser:dev')
        console.log('')
      })
    }
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          main: resolve('src/main/main.ts')
        }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts')
        }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
          input: {
            index: resolve('src/renderer/index.html'),
            quickEdit: resolve('src/renderer/quickEdit.html'),
            panel: resolve('src/renderer/panel.html')
          }
      }
    },
    plugins: [react(), tailwindcss(), devBrowserHintPlugin()],
    // Browser "인터넷" editor: open Vite directly (fast). Proxy API/WS to the
    // CalendarWebServer — do NOT load the UI through that server's Vite proxy
    // (hundreds of sequential module hops → multi-second waits on localhost).
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true
        },
        '/ws': {
          target: apiProxyTarget,
          ws: true,
          changeOrigin: true
        }
      }
    }
  }
})
