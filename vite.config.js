import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src'), // Set src/ as the root for dev server
  build: {
    outDir: resolve(__dirname, 'dist'), // Output to root-level dist
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'), // Homepage entry
        realms: resolve(__dirname, 'src/realms/index.html'), // Realms page entry
      },
    },
  },
});