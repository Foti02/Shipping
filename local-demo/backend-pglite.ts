/// <reference types="vite/client" />
// Backend di local-demo: le STESSE migrazioni SQL di produzione, su PGlite nel browser (IndexedDB).
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import type { Backend } from '../main/src/backend/types';
import { erroreDb } from '../main/src/lib/errori';
import shim from './shim.sql?raw';

const migrazioni = import.meta.glob('../main/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const CHIAVE_SESSIONE = 'shipping-demo-sessione';
const NOME_DB = 'shipping-demo';
const PASSWORD_DEMO = 'demo';

// shortcut: nei test Node senza IndexedDB si imposta globalThis.__demoDb = 'memory://'
const db = new PGlite((globalThis as { __demoDb?: string }).__demoDb ?? `idb://${NOME_DB}`, { extensions: { pgcrypto } });

const UTENTI_PRONTI = [
  { username: 'admin', nome: 'Amministratore', admin: true },
  { username: 'docente', nome: 'Docente', docente: true },
  { username: 'anna', nome: 'Anna', ruolo: 'magazziniere' },
  { username: 'bruno', nome: 'Bruno', ruolo: 'acquisti' },
  { username: 'carla', nome: 'Carla', ruolo: 'commerciale' },
  { username: 'dario', nome: 'Dario', ruolo: 'amministrazione' },
  { username: 'elisa', nome: 'Elisa', ruolo: 'magazziniere' },
  { username: 'franco', nome: 'Franco', ruolo: 'commerciale' },
] as { username: string; nome: string; admin?: boolean; docente?: boolean; ruolo?: string }[];

// Hash della vecchia tabella local_credenziali (versioni precedenti): serve solo a far entrare chi si era registrato allora.
async function hashVecchio(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Errore Postgres -> Error(message = codice, dettaglio = DETAIL), senza prefissi tipo "ERROR:".
function errore(e: unknown): Error {
  const m = String((e as Error)?.message ?? e).replace(/^(error|errore):\s*/i, '');
  return erroreDb(m, (e as { detail?: string })?.detail);
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

// Come Supabase Auth: la password sta in auth.users.encrypted_password (bcrypt di pgcrypto, schema `extensions`).
async function creaUtente(username: string, password: string, nome: string): Promise<string> {
  const u = username.trim().toLowerCase();
  const r = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data, encrypted_password) values ($1, $2::jsonb, extensions.crypt($3, extensions.gen_salt('bf'))) returning id`,
    [`${u}@shipping.local`, JSON.stringify({ username: u, nome }), password],
  );
  return r.rows[0].id;
}

async function idPerCredenziali(username: string, password: string): Promise<string | null> {
  const u = username.trim().toLowerCase();
  const r = await db.query<{ id: string }>(
    `select id from auth.users where email = $1 and encrypted_password = extensions.crypt($2, encrypted_password)`,
    [`${u}@shipping.local`, password],
  );
  if (r.rows.length) return r.rows[0].id;
  // Database creato da una versione vecchia: password ancora nella tabella local_credenziali (sha256). Si passa a bcrypt al primo accesso.
  const vecchia = (await db.query<{ t: string | null }>(`select to_regclass('public.local_credenziali')::text as t`)).rows[0].t;
  if (!vecchia) return null;
  // Solo per chi non ha ancora una password bcrypt: dopo un cambio la vecchia non deve piu' funzionare.
  const v = await db.query<{ user_id: string }>(
    `select c.user_id from local_credenziali c join auth.users u on u.id = c.user_id
     where c.username = $1 and c.password_hash = $2 and u.encrypted_password is null`,
    [u, await hashVecchio(password)],
  );
  if (!v.rows.length) return null;
  await db.query(`update auth.users set encrypted_password = extensions.crypt($1, extensions.gen_salt('bf')) where id = $2`, [password, v.rows[0].user_id]);
  return v.rows[0].user_id;
}

async function applicaMigrazioni() {
  await db.exec(`create table if not exists local_meta (nome text primary key, applicata_il timestamptz not null default now())`);
  const fatte = new Set((await db.query<{ nome: string }>(`select nome from local_meta`)).rows.map((r) => r.nome));
  // pgcrypto nello schema `extensions` (come Supabase). Se lo shim lo crea gia' da se', qui non serve.
  if (!/pgcrypto/i.test(shim)) await db.exec(`create schema if not exists extensions; create extension if not exists pgcrypto schema extensions`);
  if (!fatte.has('shim')) {
    // script e promemoria nella stessa transazione: una pagina ricaricata a meta' non lascia un database mezzo creato
    await db.transaction(async (tx) => {
      await tx.exec(shim);
      await tx.query(`insert into local_meta (nome) values ('shim')`);
    });
  } else {
    // Database creato prima dell'amministrazione: si aggiunge solo cio' che lo shim nuovo da' di serie.
    await db.exec(`create schema if not exists extensions; create extension if not exists pgcrypto schema extensions;
      alter table auth.users add column if not exists encrypted_password text;
      alter table auth.users add column if not exists updated_at timestamptz not null default now()`);
  }
  for (const percorso of Object.keys(migrazioni).sort()) {
    const nome = percorso.split('/').pop()!;
    if (fatte.has(nome)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(migrazioni[percorso]);
      await tx.query(`insert into local_meta (nome) values ($1)`, [nome]);
    });
  }
}

async function preparaDemo() {
  const fatto = async (n: string) => (await db.query(`select 1 from local_meta where nome = $1`, [n])).rows.length > 0;
  const segna = (n: string) => db.query(`insert into local_meta (nome) values ($1)`, [n]);
  const esiste = async (u: string) => (await db.query(`select 1 from profili where username = $1`, [u])).rows.length > 0;
  const id = async (u: string) => (await db.query<{ user_id: string }>(`select user_id from profili where username = $1`, [u])).rows[0].user_id;

  if (!(await fatto('demo:utenti'))) {
    for (const u of UTENTI_PRONTI.filter((x) => !x.admin)) {
      if (!(await esiste(u.username))) await creaUtente(u.username, PASSWORD_DEMO, u.nome);
      if (u.docente) await db.query(`update profili set ruolo_globale = 'docente' where username = $1`, [u.username]);
    }
    await segna('demo:utenti');
  }
  // L'admin richiede la migrazione 0010 (ruolo 'admin' nel vincolo): se manca si riprova a ogni avvio.
  if (!(await fatto('demo:admin'))) {
    try {
      if (!(await esiste('admin'))) await creaUtente('admin', PASSWORD_DEMO, 'Amministratore');
      await db.query(`update profili set ruolo_globale = 'admin' where username = 'admin'`);
      await segna('demo:admin');
    } catch {
      /* migrazione 0010 non ancora presente: niente admin per ora */
    }
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
    for (const u of UTENTI_PRONTI.filter((x) => !x.docente && !x.admin)) {
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
        if ((await db.query(`select 1 from auth.users where email = $1`, [`${u}@shipping.local`])).rows.length) throw new Error('gia_esiste');
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
      await inCoda(async () => {
        const id = await idPerCredenziali(username, password);
        if (!id) throw new Error('credenziali_errate');
        imposta(id);
      });
    },
    async esci() {
      imposta(null);
    },
    async sessione() {
      const s = leggiSessione();
      if (!s) return null;
      await pronto;
      // un account eliminato (da se' o dall'admin) non ha piu' sessione
      if (!(await db.query(`select 1 from auth.users where id = $1`, [s])).rows.length) {
        imposta(null);
        return null;
      }
      return { userId: s };
    },
    async cambiaPassword(vecchia, nuova) {
      await pronto;
      if (nuova.length < 6) throw new Error('dato_non_valido');
      const uid = leggiSessione();
      if (!uid) throw new Error('non_autenticato');
      await inCoda(async () => {
        const r = await db.query<{ email: string }>(`select email from auth.users where id = $1`, [uid]);
        if (!r.rows.length) throw new Error('non_autenticato');
        if ((await idPerCredenziali(r.rows[0].email.split('@')[0], vecchia)) !== uid) throw new Error('credenziali_errate');
        await db.query(`update auth.users set encrypted_password = extensions.crypt($1, extensions.gen_salt('bf')) where id = $2`, [nuova, uid]);
      });
    },
    async creaUtente(username, password, nome) {
      await pronto;
      const u = username.trim().toLowerCase();
      // nessun imposta(): la sessione dell'admin resta com'e'
      return inCoda(async () => {
        if ((await db.query(`select 1 from auth.users where email = $1`, [`${u}@shipping.local`])).rows.length) throw new Error('gia_esiste');
        if (password.length < 6) throw new Error('dato_non_valido');
        try {
          return { userId: await creaUtente(u, password, nome) };
        } catch {
          throw new Error('dato_non_valido');
        }
      });
    },
  },
  demo: {
    async utenti() {
      await pronto;
      const r = await db.query<{ username: string; nome: string; ruolo: 'admin' | 'docente' | 'studente' }>(
        `select p.username, p.nome, p.ruolo_globale as ruolo from profili p
         order by (p.ruolo_globale = 'admin') desc, (p.ruolo_globale = 'docente') desc, p.created_at, p.username`,
      );
      return r.rows;
    },
    async entraCome(username) {
      await pronto;
      const r = await db.query<{ user_id: string }>(`select user_id from profili where username = $1`, [username]);
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
