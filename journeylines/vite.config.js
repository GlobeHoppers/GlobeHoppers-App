import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'react-vendor';
          if (id.includes('/node_modules/maplibre-gl/') || id.includes('/node_modules/d3-geo/')) return 'map-vendor';
          return undefined;
        }
      }
    },
    chunkSizeWarningLimit: 1100
  }
});
