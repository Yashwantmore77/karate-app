import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Tests run on Indian time, where the app is used. On a machine set to UTC a
// time read as UTC and shown as local looks right, and that mistake slips by.
process.env.TZ = 'Asia/Kolkata'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@kumite/shared': path.resolve(__dirname, '../shared')
    }
  }
})
