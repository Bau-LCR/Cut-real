import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE: "/" (dominio propio) o "/nombre-del-repo/" (GitHub Pages de proyecto).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  build: {
    sourcemap: false, chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: (id) => {
      if (id.includes('node_modules/@supabase')) return 'supabase'
      if (/node_modules\/(react-markdown|remark|rehype|unified|micromark|mdast|hast|katex|unist|vfile)/.test(id)) return 'markdown'
      if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|zustand)\//.test(id)) return 'react'
    } } },
  },
})
