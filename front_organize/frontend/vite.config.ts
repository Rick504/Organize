import { defineConfig } from 'vite';

const apiTarget = process.env.ORGANIZE_API_PROXY_TARGET || 'http://127.0.0.1:3001';

export default defineConfig({
  server: {
    port: 5173,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } }
  },
  preview: { port: 4173, proxy: { '/api': { target: apiTarget, changeOrigin: true } } }
});
