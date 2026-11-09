// Pubblica gli installer nell'archivio pubblico "installer" di Supabase.
//   node scripts/pubblica.mjs carica <windows|mac> <exe|dmg>   carica il file e scrive esito-<piattaforma>.json
//   node scripts/pubblica.mjs latest                           unisce gli esito-*.json e scrive latest.json
// Variabili: SUPABASE_URL, SUPABASE_SERVICE_KEY (segreto: mai stampato).
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { unisci } from './unisci.mjs';

const BUCKET = 'installer';
const URL_BASE = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
// ::error:: fa comparire il messaggio tra le annotazioni del lavoro su GitHub (i log completi richiedono l'accesso)
const die = (m) => { console.error('::error::' + String(m).replace(/
/g, ' | ')); process.exit(1); };
if (!URL_BASE || !KEY) die(`Mancano: ${[!URL_BASE && 'variabile SUPABASE_URL', !KEY && 'segreto SUPABASE_SERVICE_KEY'].filter(Boolean).join(' e ')} (Settings > Secrets and variables > Actions del repo).`);

const pubblico = (nome) => `${URL_BASE}/storage/v1/object/public/${BUCKET}/${nome}`;

async function carica(nome, corpo, tipo, cache) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${encodeURIComponent(nome)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'x-upsert': 'true', 'Content-Type': tipo, 'cache-control': cache },
    body: corpo,
  });
  if (!r.ok) {
    const t = await r.text();
    die(`Caricamento di ${nome} rifiutato (${r.status}): ${t.slice(0, 300)}${r.status === 413 ? '\nIl file supera il limite di dimensione dell\'archivio Supabase del tuo piano.' : ''}`);
  }
}

const [cmd, piattaforma, ext] = process.argv.slice(2);

if (cmd === 'carica') {
  const file = readdirSync('release').find((f) => f.endsWith(`.${ext}`) && !f.endsWith('.blockmap'));
  if (!file) die(`Nessun .${ext} in release/`);
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const MB = (statSync(`release/${file}`).size / 1048576).toFixed(1);
  console.log(`Carico ${file} (${MB} MB)`);
  await carica(file, readFileSync(`release/${file}`), 'application/octet-stream', 'max-age=31536000');
  writeFileSync(`esito-${piattaforma}.json`, JSON.stringify({ piattaforma, versione: version, file, url: pubblico(file) }));
  console.log('Caricato:', pubblico(file));
} else if (cmd === 'latest') {
  const esiti = readdirSync('.').filter((f) => /^esito-.*\.json$/.test(f)).map((f) => JSON.parse(readFileSync(f, 'utf8')));
  if (!esiti.length) die('Nessun esito: nessun installer costruito, latest.json non toccato.');
  let precedente = null;
  try {
    const r = await fetch(`${pubblico('latest.json')}?t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) precedente = await r.json();
  } catch { /* primo rilascio: nessun file precedente */ }
  const out = unisci(precedente, esiti);
  await carica('latest.json', JSON.stringify(out, null, 2), 'application/json', 'max-age=60');
  console.log('latest.json aggiornato:', JSON.stringify(out));
} else {
  die('Uso: pubblica.mjs carica <windows|mac> <exe|dmg> | latest');
}
