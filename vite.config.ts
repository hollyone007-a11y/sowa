import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo>/, Cloudflare Pages from the root.
// The deploy workflow decides by setting VITE_BASE_PATH.
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'logo.svg', 'apple-touch-icon.png'],
      // config.json is edited after deployment; a precached copy would keep
      // serving the old connection settings.
      workbox: { globIgnores: ['**/config.json'] },
      manifest: {
        name: 'SOWA AGENCY',
        short_name: 'SOWA',
        description: 'Учёт жилья, жильцов, оплат и долгов',
        lang: 'ru',
        theme_color: '#4f46e5',
        background_color: '#0c0e15',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}pwa-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}pwa-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}pwa-512-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          icons: ['lucide-react'],
        },
      },
    },
  },
})
