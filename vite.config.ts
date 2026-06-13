import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build runs at any GitHub Pages path
// (https://<user>.github.io/<repo>/) without hard-coding the repo name.
export default defineConfig({
  base: './',
  plugins: [react()],
})
