// Revisione di sicurezza del ruolo admin (0010): i test dei buchi corretti restano come regressioni.
import { beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { nuovoDb, rpc, utente } from './helper';

const sql0010 = readFileSync(new URL('../migrations/0010_admin.sql', import.meta.url), 'utf8');

let db: PGlite;
beforeAll(async () => { db = await nuovoDb(); }, 120_000);

let seq = 0;
const nome = (p: string) => `${p}${++seq}`;
const uno = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p as any[])).rows[0];
const personale = async (u: string) =>
  (await rpc(db, u, 'api_inizializza')).magazzini.find((x: any) => x.tipo === 'personale').id as string;
/** Registrazione "dal client": email e metadati scelti da chi si registra. */
const registra = async (d: PGlite, email: string, meta: Record<string, unknown>) =>
  (await d.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`,
    [email, JSON.stringify(meta)])).rows[0].id;

describe('buchi corretti (regressioni)', () => {
  test('docente retrocesso e classe trasferita: resta docente della classe e la puo\' cancellare', async () => {
    // Prima: api_admin_classe_trasferisci lasciava il vecchio proprietario membro 'docente' e api_admin_imposta_ruolo non toccava membri:
    // l'admin "toglie" la classe a un docente scorretto, ma lui continua a gestirla, a rimuovere il nuovo proprietario e a cancellarla.
    const adm = await utente(db, nome('adm'), 'admin');
    const vecchio = await utente(db, nome('prof'), 'docente');
    const nuovo = await utente(db, nome('prof'), 'docente');
    const c = await rpc(db, vecchio, 'api_classe_crea', { p_nome: nome('Cl') });
    await rpc(db, adm, 'api_admin_imposta_ruolo', { p_user: vecchio, p_ruolo: 'studente' });
    await rpc(db, adm, 'api_admin_classe_trasferisci', { p_magazzino: c.id, p_nuovo_proprietario: nuovo });
    await expect(rpc(db, vecchio, 'api_classe_rimuovi', { p_magazzino: c.id, p_user: nuovo })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, vecchio, 'api_classe_elimina', { p_magazzino: c.id, p_conferma: c.nome })).rejects.toThrow('permesso_negato');
  });

  test('chi registra per primo lo username francesco_foti (con qualunque dominio email) diventa admin', async () => {
    // Prima: promozione per username, che viene dalla parte locale di QUALSIASI email, con registrazione aperta.
    // Ora: email di altri domini rifiutate (dato_non_valido) e nessuna promozione automatica in 0010.
    const d = await nuovoDb();  // database nuovo: 0010 e' gia' passata senza utenti, nessun admin
    await expect(registra(d, 'Francesco_Foti@attaccante.example', { nome: 'x', ruolo_globale: 'admin' })).rejects.toThrow('dato_non_valido');
    const vero = await registra(d, 'Francesco_Foti@shipping.local', { nome: 'x', ruolo_globale: 'admin' });  // anche con lo username giusto: nessuna promozione
    await d.exec(sql0010);  // riesecuzione documentata come sicura ("si puo' rieseguire")
    const r = (await d.query<{ r: string }>(`select ruolo_globale r from profili where user_id = $1`, [vero])).rows[0].r;
    await d.close();
    expect(r).toBe('studente');
  });

  test('il nome alla registrazione non ha limiti (arriva cosi\' in api_admin_utenti, api_classe_membri, ...)', async () => {
    // Prima: api_account_nome validava 1-60 caratteri, ma _nuovo_utente copiava raw_user_meta_data.nome senza limiti:
    // 200 profili da 1 MB fanno una risposta da 200 MB a ogni apertura del pannello admin (e testo con caratteri di controllo).
    const u = await registra(db, `${nome('big')}@shipping.local`, { nome: 'x'.repeat(200_000) + '\u0007' });
    const n = (await uno(`select nome from profili where user_id = $1`, [u])).nome as string;
    expect(n.length).toBeLessThanOrEqual(60);
    expect(n).not.toMatch(/[\u0000-\u001f]/);
  });

  test('reset password: limite in caratteri, bcrypt tronca a 72 BYTE (due password diverse valgono uguale)', async () => {
    // Prima: char_length contava caratteri; 'é' x36 = 72 byte, tutto cio' che segue veniva ignorato da bcrypt.
    const adm = await utente(db, nome('adm'), 'admin');
    const u = await utente(db, nome('stu'));
    const base = 'é'.repeat(36);
    await expect(rpc(db, adm, 'api_admin_reimposta_password', { p_user: u, p_password: base + 'Segreto1' })).rejects.toThrow('dato_non_valido');
    // (verifica sotto: una password diversa non combacia con l'hash)
    const h = (await uno(`select encrypted_password p from auth.users where id = $1`, [u])).p;
    expect((await uno(`select extensions.crypt($1, $2) = $2 ok`, [base + 'altro', h])).ok).toBe(false);
  });
});

describe('correzioni aggiunte', () => {
  test('retrocessione a studente: perde il ruolo docente nelle classi altrui, non in quelle che possiede finche\' non le trasferisce', async () => {
    const adm = await utente(db, nome('adm'), 'admin');
    const altro = await utente(db, nome('prof'), 'docente');
    const doc = await utente(db, nome('prof'), 'docente');
    const mia = await rpc(db, doc, 'api_classe_crea', { p_nome: nome('Cl') });
    const altrui = await rpc(db, altro, 'api_classe_crea', { p_nome: nome('Cl') });
    await db.query(`insert into membri (magazzino_id, user_id, ruolo) values ($1, $2, 'docente')`, [altrui.id, doc]);
    await rpc(db, adm, 'api_admin_imposta_ruolo', { p_user: doc, p_ruolo: 'studente' });
    const ruolo = async (m: string) => (await uno(`select ruolo from membri where magazzino_id = $1 and user_id = $2`, [m, doc])).ruolo;
    expect(await ruolo(altrui.id)).toBe('studente');
    expect(await ruolo(mia.id)).toBe('docente');
    await expect(rpc(db, doc, 'api_classe_membri', { p_magazzino: altrui.id })).rejects.toThrow('permesso_negato');
  });

  test('reset password: chiude sessioni e refresh token del bersaglio, non quelli degli altri', async () => {
    const adm = await utente(db, nome('adm'), 'admin');
    const u = await utente(db, nome('stu'));
    const altro = await utente(db, nome('stu'));
    for (const x of [u, altro]) {
      await db.query(`insert into auth.sessions (user_id) values ($1)`, [x]);
      await db.query(`insert into auth.refresh_tokens (user_id) values ($1)`, [x]);
    }
    await rpc(db, adm, 'api_admin_reimposta_password', { p_user: u, p_password: 'nuova-password' });
    const n = async (t: string, x: string) => (await uno(`select count(*)::int n from auth.${t} where user_id::text = $1`, [x])).n;
    expect([await n('sessions', u), await n('refresh_tokens', u)]).toEqual([0, 0]);
    expect([await n('sessions', altro), await n('refresh_tokens', altro)]).toEqual([1, 1]);
  });

  test('registrazione: solo email @shipping.local', async () => {
    for (const e of ['x@altro.example', 'x@shipping.local.evil.com', 'a@b@shipping.local', '@shipping.local', 'senzadominio'])
      await expect(registra(db, e, {}), e).rejects.toThrow('dato_non_valido');
  });
});

describe('verificato sicuro', () => {
  test('metadati di signUp (ruolo, ruolo_globale, username) ignorati; maiuscole non creano omonimi', async () => {
    const id = await registra(db, `${nome('evil')}@shipping.local`, { ruolo: 'admin', ruolo_globale: 'admin', username: 'francesco_foti', nome: 'e' });
    const p = await uno(`select username, ruolo_globale from profili where user_id = $1`, [id]);
    expect(p.ruolo_globale).toBe('studente');
    expect(p.username).toMatch(/^evil\d+$/);
    const u = nome('omonimo');
    await registra(db, `${u}@shipping.local`, {});
    await expect(registra(db, `${u.toUpperCase()}@altro.example`, {})).rejects.toThrow();
  });

  test('nessun non-admin ottiene ruolo docente su una classe: entra sempre come studente', async () => {
    const doc = await utente(db, nome('prof'), 'docente');
    const altro = await utente(db, nome('prof'), 'docente');
    const c = await rpc(db, doc, 'api_classe_crea', { p_nome: nome('Cl') });
    expect((await rpc(db, altro, 'api_classe_entra', { p_codice: c.codice_ingresso })).ruolo).toBe('studente');
    await expect(rpc(db, altro, 'api_classe_membri', { p_magazzino: c.id })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, altro, 'api_admin_classe_trasferisci', { p_magazzino: c.id, p_nuovo_proprietario: altro })).rejects.toThrow('permesso_negato');
  });

  test('admin: nessun accesso per id a documenti/articoli/lotti/inventari/scadenze/report di un personale altrui', async () => {
    const adm = await utente(db, nome('adm'), 'admin');
    const s = await utente(db, nome('stu'));
    const m = await personale(s);
    const a = (await rpc(db, s, 'api_articolo_salva', { p_magazzino: m, p_dati: { matricola: 'A1', descrizione: 'Art', gestione_lotti: false } })).id;
    const d = (await rpc(db, s, 'api_documento_salva', { p_magazzino: m, p_documento: { tipo: 'carico' }, p_righe: [{ articolo_id: a, qta: 3 }] })).documento.id;
    const conf = (await rpc(db, s, 'api_documento_salva', { p_magazzino: m, p_documento: { tipo: 'carico' }, p_righe: [{ articolo_id: a, qta: 2 }] })).documento.id;
    await rpc(db, s, 'api_documento_conferma', { p_id: conf });
    const inv = (await rpc(db, s, 'api_inventario_apri', { p_magazzino: m, p_nome: 'I' })).id;
    const sc = (await rpc(db, s, 'api_scadenza_salva', { p_magazzino: m, p_dati: { oggetto: 'o', inizio: '2026-01-01T10:00:00Z', fine: '2026-01-01T11:00:00Z' } })).id;
    await rpc(db, s, 'api_heartbeat', { p_magazzino: m, p_pagina: '/segreta' });

    const prove: [string, Record<string, unknown>][] = [
      ['api_articolo_leggi', { p_id: a }], ['api_articolo_elimina', { p_id: a }], ['api_lotti_elenco', { p_articolo: a }],
      ['api_documento_leggi', { p_id: d }], ['api_documento_elimina', { p_id: d }], ['api_documento_conferma', { p_id: d }],
      ['api_documento_annulla', { p_id: conf }], ['api_documento_pagato', { p_id: conf, p_pagato: true }],
      ['api_documento_genera', { p_origine: conf, p_tipo: 'fattura_acquisto' }],
      ['api_inventario_chiudi', { p_inventario: inv }], ['api_inventari_elenco', { p_magazzino: m }],
      ['api_scadenza_elimina', { p_id: sc }], ['api_scadenze_elenco', { p_magazzino: m }],
      ['api_giacenze', { p_magazzino: m }], ['api_kpi', { p_magazzino: m }], ['api_valorizzazione', { p_magazzino: m }],
      ['api_riordino_suggerimenti', { p_magazzino: m }], ['api_documenti_elenco', { p_magazzino: m }],
      ['api_azienda_leggi', { p_magazzino: m }], ['api_anagrafiche_elenco', { p_magazzino: m }],
      ['api_ubicazioni_elenco', { p_magazzino: m }], ['api_compiti_miei', { p_magazzino: m }],
      ['api_notifiche_leggi', { p_magazzino: m }], ['api_inventario_apri', { p_magazzino: m, p_nome: 'x' }],
      ['api_scenario_genera', { p_magazzino: m, p_nome: 'x', p_config: {} }],
      ['api_classe_codice', { p_magazzino: m, p_azione: 'rigenera' }], ['api_classe_rimuovi', { p_magazzino: m, p_user: s }],
      ['api_classe_azzera', { p_magazzino: m, p_conferma: 'Il mio magazzino' }], ['api_classe_elimina', { p_magazzino: m, p_conferma: 'Il mio magazzino' }],
    ];
    for (const [f, args] of prove) await expect(rpc(db, adm, f, args), f).rejects.toThrow(/permesso_negato|non_trovato/);
    expect((await uno(`select count(*)::int n from documenti where magazzino_id = $1`, [m])).n).toBe(2);
    // in api_docente_utenti di una classe l'admin vede del personale solo il tipo
    const doc = await utente(db, nome('prof'), 'docente');
    const c = await rpc(db, doc, 'api_classe_crea', { p_nome: nome('Cl') });
    await rpc(db, s, 'api_classe_entra', { p_codice: c.codice_ingresso });
    const r = (await rpc(db, adm, 'api_docente_utenti', { p_magazzino: c.id })).find((x: any) => x.user_id === s);
    expect(r.magazzino_usato).toEqual({ tipo: 'personale' });
    expect(r.pagina).toBeNull();
  });

  test('privilegi: nessuna _ eseguibile dal client, nessuna funzione ad anon, ogni security definer con search_path', async () => {
    const r = await db.query<{ n: string; auth: boolean; anon: boolean; pub: boolean }>(
      `select p.proname n, has_function_privilege('authenticated', p.oid, 'execute') auth,
              has_function_privilege('anon', p.oid, 'execute') anon,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') pub
         from pg_proc p where p.pronamespace = 'public'::regnamespace`);
    for (const x of r.rows) {
      expect(x.anon, x.n).toBe(false);
      expect(x.pub, x.n).toBe(false);
      expect(x.auth, x.n).toBe(x.n.startsWith('api_'));
    }
    const senza = await db.query<{ n: string }>(
      `select proname n from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
          and not exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c like 'search_path=%')`);
    expect(senza.rows.map((x) => x.n)).toEqual([]);
    const tab = await db.query<{ t: string }>(
      `select c.relname t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
          and (not c.relrowsecurity or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))`);
    expect(tab.rows).toEqual([]);
  });

  test('ultimo admin: non eliminabile ne\' retrocedibile per nessuna via; un ex admin perde subito ogni potere', async () => {
    const d = await nuovoDb();
    const a1 = await utente(d, 'uno', 'admin');
    const a2 = await utente(d, 'due', 'admin');
    await rpc(d, a1, 'api_admin_imposta_ruolo', { p_user: a2, p_ruolo: 'studente' });
    await expect(rpc(d, a2, 'api_admin_imposta_ruolo', { p_user: a1, p_ruolo: 'studente' })).rejects.toThrow('permesso_negato');
    await expect(rpc(d, a2, 'api_admin_imposta_ruolo', { p_user: a2, p_ruolo: 'admin' })).rejects.toThrow('permesso_negato');
    await expect(rpc(d, a1, 'api_admin_elimina_utente', { p_user: a1, p_conferma: 'uno' })).rejects.toMatchObject({ detail: 'ultimo_admin' });
    await expect(rpc(d, a1, 'api_account_elimina', { p_conferma: 'uno' })).rejects.toMatchObject({ detail: 'ultimo_admin' });
    expect((await d.query(`select 1 from profili where ruolo_globale = 'admin'`)).rows).toHaveLength(1);
    await d.close();
  });

  test('reset password: solo admin, nessuna fuga dell\'hash o della password negli errori', async () => {
    const adm = await utente(db, nome('adm'), 'admin');
    const u = await utente(db, nome('stu'));
    await expect(rpc(db, u, 'api_admin_reimposta_password', { p_user: adm, p_password: 'abcdefg' })).rejects.toThrow('permesso_negato');
    const e = await rpc(db, adm, 'api_admin_reimposta_password', { p_user: u, p_password: 'x' }).catch((x) => x);
    expect(JSON.stringify({ m: e.message, d: e.detail, h: e.hint, w: e.where })).not.toContain('crypt');
  });
});
