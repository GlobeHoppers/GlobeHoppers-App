import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // Main v9 site and isolated Cinematic GlobeHoppers viewer are separate HTML entries.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        cinematic: fileURLToPath(new URL('./cinematic/index.html', import.meta.url))
      },
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
