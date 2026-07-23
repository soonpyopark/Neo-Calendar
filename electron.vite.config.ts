import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

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
    root: resolve('src/renderer'),
    publicDir: resolve('src/renderer/public'),
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@renderer': resolve('src/renderer/src'),
        '@neo': resolve('src/renderer/src/neo'),
        fs: resolve('src/renderer/src/lib/empty-module.js')
      }
    },
    plugins: [
      react(),
      nodePolyfills({
        include: [
          'assert',
          'buffer',
          'events',
          'path',
          'process',
          'stream',
          'string_decoder',
          'util',
          'zlib'
        ],
        globals: {
          Buffer: true,
          global: true,
          process: true
        },
        protocolImports: true
      })
    ],
    optimizeDeps: {
      include: ['exceljs', 'pdfkit', 'buffer', 'process'],
      esbuildOptions: {
        define: {
          global: 'globalThis'
        }
      }
    },
    define: {
      'process.env': '{}',
      global: 'globalThis',
      __dirname: JSON.stringify('/'),
      __filename: JSON.stringify('/index.js')
    }
  }
})
