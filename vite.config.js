import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/iris/',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    // Vitest 4.x's default include glob walks node_modules in some
    // installs (zod ships its own *.test.ts files); pin tests to src/.
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    // Node 25 ships experimental localStorage that conflicts with jsdom's implementation
    execArgv: ['--no-experimental-webstorage'],
  },
})
