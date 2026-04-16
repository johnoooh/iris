import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/iris/',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    // Node 25 ships experimental localStorage that conflicts with jsdom's implementation
    execArgv: ['--no-experimental-webstorage'],
  },
})
