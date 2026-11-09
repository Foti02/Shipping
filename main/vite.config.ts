import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// base './' perche' Electron carica dist/index.html da file://.
// '@backend-impl' e' il solo punto che cambia tra main (Supabase) e local-demo (PGlite).
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: { alias: { '@backend-impl': fileURLToPath(new URL('./src/backend/supabase.ts', import.meta.url)) } },
  test: { include: ['src/**/*.test.{ts,tsx}', 'supabase/tests/**/*.test.ts'], testTimeout: 30000 },
});
