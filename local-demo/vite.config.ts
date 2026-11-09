import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const main = fileURLToPath(new URL('../main/', import.meta.url));
const { version } = JSON.parse(readFileSync(main + 'package.json', 'utf8'));

// Stessa app di main, ma '@backend-impl' punta a PGlite: le stesse migrazioni SQL girano nel browser.
export default defineConfig({
  root: main,
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version + '-demo') },
  resolve: { alias: { '@backend-impl': fileURLToPath(new URL('./backend-pglite.ts', import.meta.url)) } },
  server: { fs: { allow: ['..'] } },
  build: { outDir: fileURLToPath(new URL('./dist/', import.meta.url)), emptyOutDir: true },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
});
