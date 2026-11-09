// Pubblica gli installer.
//   node scripts/pubblica.mjs carica <windows|mac> <exe|dmg>   carica il file nella release del repo pubblico dei download
//                                                              e scrive esito-<piattaforma>.json
//   node scripts/pubblica.mjs latest                           unisce gli esito-*.json e scrive latest.json su Supabase
// Perche' due posti: gli installer (oltre 100 MB) superano il limite di 50 MB dell'archivio gratuito di Supabase, quindi
// stanno in GitHub Releases di un repo PUBBLICO solo per i download; latest.json e' minuscolo e resta su Supabase,
// da dove sito e app lo leggono (CORS aperto).
// Variabili: RELEASES_TOKEN (segreto, token con scrittura su DOWNLOAD_REPO), DOWNLOAD_REPO (default sotto),
//            SUPABASE_URL, SUPABASE_SERVICE_KEY (segreto). Nessun segreto viene mai stampato.
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { unisci } from './unisci.mjs';
import { pubblicaAsset } from './github.mjs';

const BUCKET = 'installer';
const DOWNLOAD_REPO = process.env.DOWNLOAD_REPO || 'Foti02/Shipping-download';
const URL_BASE = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
// ::error:: (su stdout, non stderr) fa comparire il messaggio tra le annotazioni del lavoro su GitHub (i log completi richiedono l'accesso)
const die = (m) => { console.log('::error::' + String(m).replace(/\n/g, ' | ')); process.exit(1); };
const serve = (...nomi) => {
  const mancano = nomi.filter((n) => !process.env[n]);
  if (mancano.length) die(`Mancano: ${mancano.join(', ')} (Settings > Secrets and variables > Actions del repo).`);
};

const pubblico = (nome) => `${URL_BASE}/storage/v1/object/public/${BUCKET}/${nome}`;

async function caricaSuSupabase(nome, corpo, tipo, cache) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${encodeURIComponent(nome)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'x-upsert': 'true', 'Content-Type': tipo, 'cache-control': cache },
    body: corpo,
  });
  if (!r.ok) die(`Caricamento di ${nome} su Supabase rifiutato (${r.status}): ${(await r.text()).slice(0, 300)}`);
}

const [cmd, piattaforma, ext] = process.argv.slice(2);

if (cmd === 'carica') {
  serve('RELEASES_TOKEN');
  const file = readdirSync('release').find((f) => f.endsWith(`.${ext}`) && !f.endsWith('.blockmap'));
  if (!file) die(`Nessun .${ext} in release/`);
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  console.log(`Carico ${file} (${(statSync(`release/${file}`).size / 1048576).toFixed(1)} MB) su ${DOWNLOAD_REPO}`);
  let url;
  try {
    url = await pubblicaAsset({ repo: DOWNLOAD_REPO, token: process.env.RELEASES_TOKEN, tag: `v${version}`, nomeFile: file, corpo: readFileSync(`release/${file}`) });
  } catch (e) {
    die(e.message);
  }
  writeFileSync(`esito-${piattaforma}.json`, JSON.stringify({ piattaforma, versione: version, file, url }));
  console.log('Caricato:', url);
} else if (cmd === 'latest') {
  serve('SUPABASE_URL', 'SUPABASE_SERVICE_KEY');
  const esiti = readdirSync('.').filter((f) => /^esito-.*\.json$/.test(f)).map((f) => JSON.parse(readFileSync(f, 'utf8')));
  if (!esiti.length) die('Nessun esito: nessun installer costruito, latest.json non toccato.');
  let precedente = null;
  try {
    const r = await fetch(`${pubblico('latest.json')}?t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) precedente = await r.json();
  } catch { /* primo rilascio: nessun file precedente */ }
  const out = unisci(precedente, esiti);
  await caricaSuSupabase('latest.json', JSON.stringify(out, null, 2), 'application/json', 'max-age=60');
  console.log('latest.json aggiornato:', JSON.stringify(out));
} else {
  die('Uso: pubblica.mjs carica <windows|mac> <exe|dmg> | latest');
}
