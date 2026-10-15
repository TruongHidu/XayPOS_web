import { userInfo } from 'node:os'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Separate Windows users must not share cache files with different delete permissions.
  cacheDir: `node_modules/.vite-${userInfo().username.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
  plugins: [react(), tailwindcss()],
  server: { port: 3000 },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', globals: true, include: ['src/**/*.test.{ts,tsx}'] },
})
