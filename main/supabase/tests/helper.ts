// Aiuti per i test SQL: database PGlite con shim + tutte le migrazioni, utenti e chiamate rpc.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

const qui = new URL('.', import.meta.url);
const migrazioni = new URL('../migrations/', import.meta.url);
const shim = new URL('../../../local-demo/shim.sql', import.meta.url);

/**
 * Senza argomenti carica TUTTE le migrazioni (test di integrazione).
 * Con `solo` (prefissi di file, es. ['0004']) carica 0001, 0002, 0099 piu' i file indicati:
 * cosi' i test di un modulo non si rompono se un altro modulo e' a meta' lavoro.
 */
export async function nuovoDb(solo?: string[]): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(shim, 'utf8'));
  const sempre = ['0001', '0002', '0099', ...(solo ?? [])];
  const file = readdirSync(migrazioni)
    .filter((n) => n.endsWith('.sql') && (!solo || sempre.some((p) => n.startsWith(p))))
    .sort();
  for (const f of file) await db.exec(readFileSync(new URL(f, migrazioni), 'utf8'));
  return db;
}

/** Crea un utente (come farebbe Supabase Auth) e ne ritorna l'id. Il trigger crea il profilo. */
export async function utente(db: PGlite, username: string, ruoloGlobale: 'studente' | 'docente' = 'studente'): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`,
    [`${username}@shipping.local`, JSON.stringify({ username, nome: username })],
  );
  const id = r.rows[0].id;
  if (ruoloGlobale === 'docente') await db.query(`update profili set ruolo_globale = 'docente' where user_id = $1`, [id]);
  return id;
}

/** Chiama api_<nome> come l'utente indicato, con argomenti per nome. Gli errori hanno message = codice. */
export async function rpc<T = any>(db: PGlite, userId: string | null, nome: string, args: Record<string, unknown> = {}): Promise<T> {
  await db.query(`select set_config('app.uid', $1, false)`, [userId ?? '']);
  const chiavi = Object.keys(args);
  const lista = chiavi.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const valori = chiavi.map((k) => {
    const v = args[k];
    return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  });
  const r = await db.query<{ r: T }>(`select to_jsonb(${nome}(${lista})) as r`, valori as any[]);
  return r.rows[0].r;
}
