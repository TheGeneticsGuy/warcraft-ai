import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'), // home page
        realms: resolve(__dirname, 'src/realms/index.html'), //  realms page
        realmDetail: resolve(__dirname, 'src/realm-detail/index.html'), // realm detail page
        players: resolve(__dirname, 'src/players/index.html'), // Player Search Page
        playerDetail: resolve(__dirname, 'src/player-details/index.html'), // New detail page
      },
    },
  },
});
