import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Calendar HTTP API port (same default as CalendarWebServer). */
function resolveApiProxyTarget(): string {
  const raw = process.env.PORT || process.env.NEOCALENDAR_PORT || process.env.MYCALENDAR_PORT
  const port = Number.parseInt(String(raw ?? ''), 10)
  const safe = Number.isFinite(port) && port > 0 ? port : 3010
  return `http://127.0.0.1:${safe}`
}

const apiProxyTarget = resolveApiProxyTarget()

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
    plugins: [react(), tailwindcss()],
    // Browser "인터넷" editor: open Vite directly (fast). Proxy API/WS to the
    // CalendarWebServer — do NOT load the UI through that server's Vite proxy
    // (hundreds of sequential module hops → multi-second waits on localhost).
    server: {
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
