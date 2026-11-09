// Rigenera supabase/setup.sql: tutte le migrazioni concatenate in ordine, da incollare nell'SQL Editor di Supabase.
// Uso: npm run db:setup
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const cartella = new URL('../supabase/migrations/', import.meta.url);
const file = readdirSync(cartella).filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort();
const numeri = file.map((n) => n.slice(0, 4));
const testa = `-- Shipping: schema completo per Supabase (SQL Editor). Generato dalle migrazioni ${numeri[0]}..${numeri.at(-1)}, in ordine.\n\n`;
const corpo = file.map((n) => `-- ===== migrations/${n} =====\n${readFileSync(new URL(n, cartella), 'utf8')}`).join('\n\n') + '\n';

writeFileSync(new URL('../supabase/setup.sql', import.meta.url), testa + corpo);
console.log(`setup.sql: ${file.length} migrazioni (${numeri[0]}..${numeri.at(-1)})`);
