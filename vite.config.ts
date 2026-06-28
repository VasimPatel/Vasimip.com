import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // three is large; let it sit in its own chunk so the codex shell can paint
  // before the WebGL machinery streams in. Vite 8 / rolldown only accepts the
  // function form of manualChunks (the object form is legacy Rollup).
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('/three/') || id.includes('/three-stdlib/')) return 'three'
          if (id.includes('@react-three') || id.includes('/postprocessing/')) return 'r3f'
        },
      },
    },
  },
})
