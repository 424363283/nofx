/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { setupFiles: ['./src/test/setup.ts'] },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/')) {
            if (
              id.includes('/antd/') ||
              id.includes('/@ant-design/') ||
              id.includes('/@rc-component/') ||
              id.includes('/rc-')
            )
              return 'antd'
            if (id.includes('/recharts/') || id.includes('/d3-'))
              return 'charts'
          }
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3001,
    strictPort: true,
    proxy: {
      '/api/market/radar': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8081',
        changeOrigin: true,
      },
    },
  },
})
