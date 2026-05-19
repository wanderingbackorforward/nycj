import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/md/',
  server: {
    port: 5174,
    host: '127.0.0.1',
    proxy: {
      '/api/gn': {
        target: 'http://120.55.70.218:80',
        changeOrigin: true,
      },
      '/api/area2': {
        target: 'http://120.55.70.218:80',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});