import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'node:http'

function externalGeneratedAppModules() {
  return {
    name: 'external-generated-app-modules',
    resolveId(source: string) {
      if (source.includes('/func-operation/generated-apps/') && source.endsWith('.js')) {
        return { id: source, external: true }
      }
      return null
    },
  }
}

const API_TARGET = 'http://127.0.0.1:8086'

/** 前端路由与后端 API 共用路径前缀时，刷新页面需回退到 SPA 入口 */
function createSpaAwareApiProxy() {
  return {
    target: API_TARGET,
    changeOrigin: true,
    bypass(req: IncomingMessage) {
      if (req.headers.accept?.includes('text/html')) {
        return '/index.html'
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), externalGeneratedAppModules()],
  server: {
    proxy: {
      '/ai-agent': createSpaAwareApiProxy(),
      '/func-operation': createSpaAwareApiProxy(),
      '/system': createSpaAwareApiProxy(),
      '/realtime': {
        target: API_TARGET,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
