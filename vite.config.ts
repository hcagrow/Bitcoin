import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this project from /Bitcoin/, so built asset URLs
  // need that prefix instead of the default root-relative paths.
  base: '/Bitcoin/',
})
