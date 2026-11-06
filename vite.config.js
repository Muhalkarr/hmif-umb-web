import { defineConfig } from 'vite';

const apiTarget = process.env.HMIF_API_TARGET || 'http://localhost:3001';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true
      }
    }
  }
});
