import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The --no-experimental-webstorage flag was added in Node 22 (when
// experimental localStorage shipped). Older Node versions don't recognize
// it and crash the worker forks before any test runs (CI on Node 20 was
// hitting EPIPE here). Emit the flag only on Node 22+.
const nodeMajor = Number(process.versions.node.split('.')[0])

// BASE_PATH lets CI override the Vite base for per-PR preview deploys
// (e.g. /iris/pr-23/). Defaults to /iris/ so prod and local dev are
// unchanged. Always ends with a trailing slash — Vite requires it.
const basePath = (() => {
  const raw = process.env.BASE_PATH
  if (!raw) return '/iris/'
  return raw.endsWith('/') ? raw : `${raw}/`
})()

export default defineConfig({
  plugins: [react()],
  base: basePath,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    // Vitest 4.x's default include glob walks node_modules in some
    // installs (zod ships its own *.test.ts files); pin tests to src/.
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    // Disable Node's experimental localStorage so jsdom's implementation
    // can take over without conflict. Only valid on Node 22+.
    execArgv: nodeMajor >= 22 ? ['--no-experimental-webstorage'] : [],
  },
})
