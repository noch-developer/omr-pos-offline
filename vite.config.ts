import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';

const useHttps = process.env.HTTPS === 'true';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(useHttps ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
        type: 'module'
      },
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'logo.svg',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'sample-products-stock.json',
        'sample-products-stock.csv'
      ],
      manifest: {
        name: 'OMR Event POS — ONE MORE RESTAURANT',
        short_name: 'OMR POS',
        description: 'Offline-first tablet POS for outside events and pop-ups',
        theme_color: '#16a34a',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        scope: '/',
        id: '/',
        categories: ['business', 'food'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'logo.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json}'],
        cleanupOutdatedCaches: true
      }
    })
  ],
  server: {
    host: true,
    port: 5173
  },
  preview: {
    host: true,
    port: 8088
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
