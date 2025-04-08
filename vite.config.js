import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'), // Your home page
        realms: resolve(__dirname, 'src/realms/index.html'), // Your existing realms page
        realmDetail: resolve(__dirname, 'src/realm-detail/index.html'), // New detail page
      },
    },
  },
});
