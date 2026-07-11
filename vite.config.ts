import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { notebookAdmin } from './plugins/notebook-admin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), notebookAdmin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
  },
  server: {
    // Dev proxy so /api/auth (Better Auth) works under `bun run dev` WHEN the bun
    // server is running on :8787. When it ISN'T, these requests fail — the admin's
    // session check treats that network error as a DEV fail-open (see src/App.tsx),
    // so the file-backed /__notebook admin keeps working fully offline.
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
})
