import { defineConfig } from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';

export default defineConfig([
  {
    ignores: ['node_modules/**', '.netlify/**'], // <-- global ignore block
  },
  {
    files: ['**/*.{js,mjs,cjs}'], // Apply to all JS files
    languageOptions: {
      globals: {
        ...globals.browser, // Browser globals (e.g., window, document)
        ...globals.node, // Node.js globals (e.g., __dirname, process)
      },
    },
    ...js.configs.recommended, // Spread the recommended config from @eslint/js
  },
]);
