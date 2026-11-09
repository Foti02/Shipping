/// <reference types="vite/client" />
// Backend di local-demo: le STESSE migrazioni SQL di produzione, su PGlite nel browser (IndexedDB).
import { PGlite } from '@electric-sql/pglite';
import type { Backend } from '../main/src/backend/types';
import shim from './shim.sql?raw';

const migrazioni = import.meta.glob('../main/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const CHIAVE_SESSIONE = 'shipping-demo-sessione';
const NOME_DB = 'shipping-demo';
const PASSWORD_DEMO = 'demo';

// shortcut: nei test Node senza IndexedDB si imposta globalThis.__demoDb = 'memory://'
const db = new PGlite((globalThis as { __demoDb?: string }).__demoDb ?? `idb://${NOME_DB}`);

const UTENTI_PRONTI = [
  { username: 'docente', nome: 'Docente', docente: true },
  { username: 'anna', nome: 'Anna', ruolo: 'magazziniere' },
  { username: 'bruno', nome: 'Bruno', ruolo: 'acquisti' },
  { username: 'carla', nome: 'Carla', ruolo: 'commerciale' },
  { username: 'dario', nome: 'Dario', ruolo: 'amministrazione' },
  { username: 'elisa', nome: 'Elisa', ruolo: 'magazziniere' },
  { username: 'franco', nome: 'Franco', ruolo: 'commerciale' },
] as { username: string; nome: string; docente?: boolean; ruolo?: string }[];

async function hash(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Errore Postgres -> Error(message = codice), senza prefissi tipo "ERROR:".
function errore(e: unknown): Error {
  const m = String((e as Error)?.message ?? e).replace(/^(error|errore):\s*/i, '');
  return new Error(m);
}

// Una sola operazione alla volta: set_config('app.uid') e la select devono stare nella stessa transazione.
let coda: Promise<unknown> = Promise.resolve();
function inCoda<T>(fn: () => Promise<T>): Promise<T> {
  const r = coda.then(fn, fn);
  coda = r.catch(() => {});
  return r;
}

async function chiama<T>(userId: string | null, nome: string, args: Record<string, unknown>): Promise<T> {
  const esiste = await db.query(`select 1 from pg_proc where proname = $1`, [nome.toLowerCase()]);
  if (!esiste.rows.length) throw new Error(`Funzione SQL "${nome}" non ancora presente nelle migrazioni`);
  const chiavi = Object.keys(args);
  const lista = chiavi.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const valori = chiavi.map((k) => {
    const v = args[k];
    return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  });
  try {
    return await db.transaction(async (tx) => {
      await tx.query(`select set_config('app.uid', $1, true)`, [userId ?? '']);
      const r = await tx.query<{ r: T }>(`select to_jsonb(${nome}(${lista})) as r`, valori as unknown[]);
      return r.rows[0].r;
    });
  } catch (e) {
    throw errore(e);
  }
}

async function creaUtente(username: string, password: string, nome: string): Promise<string> {
  const u = username.trim().toLowerCase();
  return db.transaction(async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`,
      [`${u}@shipping.local`, JSON.stringify({ username: u, nome })],
    );
    await tx.query(`insert into local_credenziali (username, password_hash, user_id) values ($1, $2, $3)`, [u, await hash(password), r.rows[0].id]);
    return r.rows[0].id;
  });
}

async function applicaMigrazioni() {
  await db.exec(`create table if not exists local_meta (nome text primary key, applicata_il timestamptz not null default now())`);
  const fatte = new Set((await db.query<{ nome: string }>(`select nome from local_meta`)).rows.map((r) => r.nome));
  if (!fatte.has('shim')) {
    await db.exec(shim);
    await db.exec(`create table local_credenziali (username text primary key, password_hash text not null, user_id uuid not null)`);
    await db.query(`insert into local_meta (nome) values ('shim')`);
  }
  for (const percorso of Object.keys(migrazioni).sort()) {
    const nome = percorso.split('/').pop()!;
    if (fatte.has(nome)) continue;
    await db.exec(migrazioni[percorso]);
    await db.query(`insert into local_meta (nome) values ($1)`, [nome]);
  }
}

async function preparaDemo() {
  const fatto = async (n: string) => (await db.query(`select 1 from local_meta where nome = $1`, [n])).rows.length > 0;
  const segna = (n: string) => db.query(`insert into local_meta (nome) values ($1)`, [n]);
  const id = async (u: string) => (await db.query<{ user_id: string }>(`select user_id from profili where username = $1`, [u])).rows[0].user_id;

  if (!(await fatto('demo:utenti'))) {
    for (const u of UTENTI_PRONTI) {
      await creaUtente(u.username, PASSWORD_DEMO, u.nome);
      if (u.docente) await db.query(`update profili set ruolo_globale = 'docente' where username = $1`, [u.username]);
    }
    await segna('demo:utenti');
  }
  // La classe richiede funzioni di migrazioni che possono arrivare piu' tardi: si riprova a ogni avvio finche' non c'e'.
  if (!(await fatto('demo:classe'))) {
    const ok = await db.query(`select count(*)::int as n from pg_proc where proname in ('api_classe_crea','api_classe_entra','api_classe_imposta_ruolo')`);
    if ((ok.rows[0] as { n: number }).n < 3) return;
    const doc = await id('docente');
    await chiama(doc, 'api_classe_crea', { p_nome: 'Classe demo' });
    // id e codice si leggono dalla tabella: non dipendono dalla forma del valore ritornato
    const classe = (await db.query<{ id: string; c: string }>(`select id, codice_ingresso as c from magazzini where tipo = 'classe' and nome = 'Classe demo'`)).rows[0];
    const codice = classe.c;
    for (const u of UTENTI_PRONTI.filter((x) => !x.docente)) {
      const uid = await id(u.username);
      await chiama(uid, 'api_classe_entra', { p_codice: codice });
      await chiama(doc, 'api_classe_imposta_ruolo', { p_magazzino: classe.id, p_user: uid, p_ruolo_aziendale: u.ruolo });
    }
    await segna('demo:classe');
  }
}

const pronto = (async () => {
  await applicaMigrazioni();
  await preparaDemo();
})();

const leggiSessione = (): string | null => {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE_SESSIONE) ?? 'null')?.userId ?? null;
  } catch {
    return null;
  }
};

const imposta = (userId: string | null) => {
  if (userId) localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify({ userId }));
  else localStorage.removeItem(CHIAVE_SESSIONE);
};

const backend: Backend = {
  rpc: async <T,>(name: string, args: Record<string, unknown> = {}) => {
    await pronto;
    // l'utente viene letto dentro la coda: un esci() subito prima non lascia passare chiamate come lui
    return inCoda(() => chiama<T>(leggiSessione(), name, args));
  },
  auth: {
    async registra(username, password, nome) {
      await pronto;
      const u = username.trim().toLowerCase();
      await inCoda(async () => {
        if ((await db.query(`select 1 from local_credenziali where username = $1`, [u])).rows.length) throw new Error('gia_esiste');
        let id: string;
        try {
          id = await creaUtente(u, password, nome);
        } catch {
          throw new Error('dato_non_valido');
        }
        imposta(id);
      });
    },
    async accedi(username, password) {
      await pronto;
      const r = await db.query<{ user_id: string; password_hash: string }>(
        `select user_id, password_hash from local_credenziali where username = $1`,
        [username.trim().toLowerCase()],
      );
      if (!r.rows.length || r.rows[0].password_hash !== (await hash(password))) throw new Error('credenziali_errate');
      imposta(r.rows[0].user_id);
    },
    async esci() {
      imposta(null);
    },
    async sessione() {
      const s = leggiSessione();
      return s ? { userId: s } : null;
    },
  },
  demo: {
    async utenti() {
      await pronto;
      const r = await db.query<{ username: string; nome: string; ruolo: 'docente' | 'studente' }>(
        `select c.username, p.nome, p.ruolo_globale as ruolo from local_credenziali c join profili p on p.user_id = c.user_id
         order by (p.ruolo_globale = 'docente') desc, p.created_at, p.username`,
      );
      return r.rows;
    },
    async entraCome(username) {
      await pronto;
      const r = await db.query<{ user_id: string }>(`select user_id from local_credenziali where username = $1`, [username]);
      if (!r.rows.length) throw new Error('non_trovato');
      imposta(r.rows[0].user_id);
    },
    async reimposta() {
      await db.close();
      imposta(null);
      await new Promise<void>((ok) => {
        const q = indexedDB.deleteDatabase(`/pglite/${NOME_DB}`);
        q.onsuccess = q.onerror = q.onblocked = () => ok();
      });
      location.reload();
    },
  },
};

export default backend;
