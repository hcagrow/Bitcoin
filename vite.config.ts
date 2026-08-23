import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/favicon-16.png', 'icons/favicon-32.png'],
      manifest: {
        name: 'BTC 기준선 대시보드',
        short_name: '기준선 대시보드',
        description: '비트코인/멀티자산 기준선 기반 분석 대시보드 — 매매를 추천하지 않고 현재 구간과 다음 확인 지점만 보여줍니다.',
        lang: 'ko',
        start_url: '/Bitcoin/',
        scope: '/Bitcoin/',
        display: 'standalone',
        background_color: '#0b0b12',
        theme_color: '#7e14ff',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Real-time BTC/asset prices must never be served stale from cache;
        // only precache the built app shell, let network calls to Binance
        // pass straight through.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallbackDenylist: [/^\/Bitcoin\/api-check\.html/, /^\/Bitcoin\/verify-indicators\.html/],
      },
    }),
  ],
  // GitHub Pages serves this project from /Bitcoin/, so built asset URLs
  // need that prefix instead of the default root-relative paths.
  base: '/Bitcoin/',
})
