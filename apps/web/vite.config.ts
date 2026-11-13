import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GUI 黑盒隔离：INKFORGE_API_TARGET 可覆盖代理目标（如 8789），默认 8787 不变
const apiTarget = process.env.INKFORGE_API_TARGET ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': apiTarget,
    },
  },
  test: {
    environment: 'jsdom',
  },
});
