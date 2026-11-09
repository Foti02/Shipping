// Ruolo globale admin: override sulle classi (mai sui personali), account, funzioni api_admin_*, registro.
import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { nuovoDb, rpc, utente } from './helper';

let db: PGlite;
beforeAll(async () => { db = await nuovoDb(); }, 120_000);

let seq = 0;
const nome = (p: string) => `${p}${++seq}`;
const uno = async <T = any>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p as any[])).rows[0];
const conta = async (sql: string, p: unknown[] = []) => Number((await uno<{ n: string }>(sql, p)).n);

const personale = async (u: string) =>
  (await rpc(db, u, 'api_inizializza')).magazzini.find((x: any) => x.tipo === 'personale').id as string;

/** Un docente con classe e uno studente iscritto. */
async function classe() {
  const doc = await utente(db, nome('prof'), 'docente');
  const c = await rpc(db, doc, 'api_classe_crea', { p_nome: nome('Classe ') });
  const st = await utente(db, nome('alu'));
  await rpc(db, st, 'api_classe_entra', { p_codice: c.codice_ingresso });
  return { doc, st, m: c.id as string, nome: c.nome as string };
}
const articolo = (u: string, m: string) =>
  rpc(db, u, 'api_articolo_salva', { p_magazzino: m, p_dati: { matricola: nome('M'), descrizione: 'Art', prezzo_acquisto_cent: 100 } });

describe('permessi delle funzioni admin', () => {
  const chiamate: [string, Record<string, unknown>][] = [
    ['api_admin_utenti', {}],
    ['api_admin_imposta_ruolo', { p_user: '00000000-0000-0000-0000-000000000001', p_ruolo: 'docente' }],
    ['api_admin_elimina_utente', { p_user: '00000000-0000-0000-0000-000000000001', p_conferma: 'x' }],
    ['api_admin_reimposta_password', { p_user: '00000000-0000-0000-0000-000000000001', p_password: 'abcdef' }],
    ['api_admin_classi', {}],
    ['api_admin_classe_trasferisci', { p_magazzino: '00000000-0000-0000-0000-000000000001', p_nuovo_proprietario: '00000000-0000-0000-0000-000000000001' }],
    ['api_admin_statistiche', {}],
    ['api_admin_registro', {}],
  ];

  test('studente e docente non possono chiamare nessuna api_admin_*; senza login non_autenticato', async () => {
    const stud = await utente(db, nome('stu'));
    const doc = await utente(db, nome('dcn'), 'docente');
    for (const [f, args] of chiamate) {
      await expect(rpc(db, stud, f, args), f).rejects.toThrow('permesso_negato');
      await expect(rpc(db, doc, f, args), f).rejects.toThrow('permesso_negato');
      await expect(rpc(db, null, f, args), f).rejects.toThrow('non_autenticato');
    }
  });

  test('le api_admin_* e le nuove funzioni di account sono concesse a authenticated, gli helper _ no', async () => {
    const r = await db.query<{ n: string; ok: boolean }>(
      `select p.proname n, has_function_privilege('authenticated', p.oid, 'execute') ok
         from pg_proc p where p.pronamespace = 'public'::regnamespace
          and (p.proname like 'api\\_admin\\_%' or p.proname in ('api_account','api_account_nome','api_account_elimina')
               or p.proname in ('_e_admin','_e_admin_classe','_richiedi_admin','_e_ultimo_admin','_registra_admin','_elimina_utente'))`);
    expect(r.rows.length).toBe(17);
    for (const x of r.rows) expect(x.ok, x.n).toBe(x.n.startsWith('api_'));
  });
});

describe('ruoli', () => {
  test('nessuno diventa docente o admin da solo; _nuovo_utente crea studenti; il check ammette admin', async () => {
    const stud = await utente(db, nome('stu'));
    await expect(rpc(db, stud, 'api_classe_crea', { p_nome: 'X' })).rejects.toThrow('permesso_negato');
    expect((await uno(`select ruolo_globale from profili where user_id = $1`, [stud])).ruolo_globale).toBe('studente');
    await expect(db.query(`update profili set ruolo_globale = 'boss' where user_id = $1`, [stud])).rejects.toThrow();
  });

  test('admin imposta ruoli; il promosso crea classi; ruolo non valido e utente inesistente rifiutati', async () => {
    const adm = await utente(db, nome('adm'), 'admin');
    const u = await utente(db, nome('stu'));
    const p = await rpc(db, adm, 'api_admin_imposta_ruolo', { p_user: u, p_ruolo: 'docente' });
    expect(p.ruolo_globale).toBe('docente');
    expect((await rpc(db, u, 'api_classe_crea', { p_nome: 'Nuova' })).tipo).toBe('classe');
    await expect(rpc(db, adm, 'api_admin_imposta_ruolo', { p_user: u, p_ruolo: 'superman' })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, adm, 'api_admin_imposta_ruolo', { p_user: '00000000-0000-0000-0000-000000000009', p_ruolo: 'docente' })).rejects.toThrow('non_trovato');
    const a2 = await rpc(db, adm, 'api_admin_imposta_ruolo', { p_user: u, p_ruolo: 'admin' });
    expect(a2.ruolo_globale).toBe('admin');
    expect((await rpc(db, u, 'api_account')).ruolo_globale).toBe('admin');
  });

  test('non si toglie il ruolo all\'ultimo admin; con due admin si', async () => {
    // database a parte: qui gli admin sono esattamente quelli creati
    const d2 = await nuovoDb();
    const a1 = await utente(d2, 'primo', 'admin');
    await expect(rpc(d2, a1, 'api_admin_imposta_ruolo', { p_user: a1, p_ruolo: 'docente' })).rejects.toMatchObject({ message: 'stato_non_valido', detail: 'ultimo_admin' });
    const a2 = await utente(d2, 'secondo', 'admin');
    expect((await rpc(d2, a2, 'api_admin_imposta_ruolo', { p_user: a1, p_ruolo: 'studente' })).ruolo_globale).toBe('studente');
    await expect(rpc(d2, a2, 'api_admin_imposta_ruolo', { p_user: a2, p_ruolo: 'docente' })).rejects.toMatchObject({ detail: 'ultimo_admin' });
    await d2.close();
  });
});

describe('account', () => {
  test('api_account e api_account_nome', async () => {
    const adm = await utente(db, nome('adm'), 'admin');
    const doc = await utente(db, nome('prof'), 'docente');
    await rpc(db, doc, 'api_classe_crea', { p_nome: 'A' });
    const a = await rpc(db, doc, 'api_account');
    expect(Object.keys(a).sort()).toEqual(['creato_il', 'n_classi_possedute', 'nome', 'ruolo_globale', 'user_id', 'username']);
    expect(a.n_classi_possedute).toBe(1);
    expect(a.ruolo_globale).toBe('docente');
    const p = await rpc(db, doc, 'api_account_nome', { p_nome: '  Mario Rossi \n' });
    expect(p.nome).toBe('Mario Rossi');
    expect((await rpc(db, doc, 'api_account')).nome).toBe('Mario Rossi');
    for (const v of ['', '   ', '\t\n', 'x'.repeat(61), 'a\nb', 'a\u0007b', null]) {
      await expect(rpc(db, doc, 'api_account_nome', { p_nome: v }), String(v)).rejects.toThrow('dato_non_valido');
    }
    expect((await rpc(db, doc, 'api_account_nome', { p_nome: 'x'.repeat(60) })).nome).toHaveLength(60);
    expect((await rpc(db, adm, 'api_account')).ruolo_globale).toBe('admin');
  });

  test('elimina il proprio account con conferma: cascata su profilo, magazzino personale, documenti', async () => {
    const u = await utente(db, nome('del'));
    const m = await personale(u);
    const a = (await articolo(u, m)).id;
    const b = await rpc(db, u, 'api_documento_salva', { p_magazzino: m, p_documento: { tipo: 'carico' }, p_righe: [{ articolo_id: a, qta: 4 }] });
    await rpc(db, u, 'api_documento_conferma', { p_id: b.documento.id });
    await rpc(db, u, 'api_heartbeat', { p_magazzino: m, p_pagina: 'x' });
    const username = (await uno(`select username from profili where user_id = $1`, [u])).username;

    await expect(rpc(db, u, 'api_account_elimina', { p_conferma: 'sbagliato' })).rejects.toThrow('conferma_errata');
    await expect(rpc(db, u, 'api_account_elimina', { p_conferma: null })).rejects.toThrow('conferma_errata');
    expect(await conta(`select count(*) n from profili where user_id = $1`, [u])).toBe(1);

    expect(await rpc(db, u, 'api_account_elimina', { p_conferma: username })).toEqual({ ok: true });
    for (const t of ['auth.users where id', 'profili where user_id', 'magazzini where proprietario_id', 'membri where user_id', 'presenze where user_id']) {
      expect(await conta(`select count(*) n from ${t} = $1`, [u]), t).toBe(0);
    }
    expect(await conta(`select count(*) n from articoli where id = $1`, [a])).toBe(0);
    expect(await conta(`select count(*) n from documenti where id = $1`, [b.documento.id])).toBe(0);
  });

  test('uno studente iscritto a una classe si elimina: la classe e i suoi dati restano', async () => {
    const k = await classe();
    const art = (await articolo(k.st, k.m)).id;
    const username = (await uno(`select username from profili where user_id = $1`, [k.st])).username;
    await rpc(db, k.st, 'api_account_elimina', { p_conferma: username });
    expect(await conta(`select count(*) n from magazzini where id = $1`, [k.m])).toBe(1);
    expect(await conta(`select count(*) n from articoli where id = $1`, [art])).toBe(1);
  });

  test('bloccata se possiede classi (possiede_classi) e se e\' l\'ultimo admin (ultimo_admin)', async () => {
    const k = await classe();
    const username = (await uno(`select username from profili where user_id = $1`, [k.doc])).username;
    await expect(rpc(db, k.doc, 'api_account_elimina', { p_conferma: username })).rejects.toMatchObject({ message: 'stato_non_valido', detail: 'possiede_classi' });
    expect(await conta(`select count(*) n from profili where user_id = $1`, [k.doc])).toBe(1);
    await rpc(db, k.doc, 'api_classe_elimina', { p_magazzino: k.m, p_conferma: k.nome });
    await rpc(db, k.doc, 'api_account_elimina', { p_conferma: username });

    const d2 = await nuovoDb();
    const a1 = await utente(d2, 'solo', 'admin');
    await expect(rpc(d2, a1, 'api_account_elimina', { p_conferma: 'solo' })).rejects.toMatchObject({ message: 'stato_non_valido', detail: 'ultimo_admin' });
    const a2 = await utente(d2, 'altro', 'admin');
    await rpc(d2, a1, 'api_account_elimina', { p_conferma: 'solo' });
    expect((await d2.query(`select 1 from profili where username = 'solo'`)).rows).toHaveLength(0);
    await expect(rpc(d2, a2, 'api_account_elimina', { p_conferma: 'altro' })).rejects.toMatchObject({ detail: 'ultimo_admin' });
    await d2.close();
  });
});

describe('admin come docente su qualsiasi classe, mai sui personali', () => {
  test('gestisce la classe di un altro docente', async () => {
    const k = await classe();
    const adm = await utente(db, nome('adm'), 'admin');

    const mie = await rpc(db, adm, 'api_docente_classi');
    expect(mie.map((c: any) => c.id)).toContain(k.m);
    const doc2 = await rpc(db, k.doc, 'api_docente_classi');
    expect(doc2.map((c: any) => c.id)).toEqual([k.m]);  // il docente vede solo le sue

    const ut = await rpc(db, adm, 'api_docente_utenti', { p_magazzino: k.m });
    expect(ut.map((x: any) => x.user_id)).toEqual([k.st]);
    expect((await rpc(db, adm, 'api_classe_membri', { p_magazzino: k.m })).length).toBe(2);
    await rpc(db, adm, 'api_classe_imposta_ruolo', { p_magazzino: k.m, p_user: k.st, p_ruolo_aziendale: 'acquisti' });
    expect((await rpc(db, adm, 'api_magazzino_impostazioni', { p_magazzino: k.m, p_blocca_giacenza_negativa: false })).blocca_giacenza_negativa).toBe(false);
    await rpc(db, adm, 'api_classe_codice', { p_magazzino: k.m, p_azione: 'disattiva' });

    const s = await rpc(db, adm, 'api_scenario_genera', { p_magazzino: k.m, p_nome: 'S', p_config: { seed: 3 } });
    expect((await rpc(db, adm, 'api_scenari_elenco', { p_magazzino: k.m })).map((x: any) => x.id)).toContain(s.scenario_id);
    await rpc(db, adm, 'api_scenario_stato', { p_scenario: s.scenario_id, p_stato: 'attivo' });
    expect((await rpc(db, adm, 'api_compiti_tutti', { p_scenario: s.scenario_id })).length).toBe(s.n_compiti);
    expect(await rpc(db, adm, 'api_scenario_controlla', { p_scenario: s.scenario_id })).toHaveProperty('totale');
    // legge e scrive i dati della classe come un docente, vede notifiche e registro attivita'
    expect((await articolo(adm, k.m)).magazzino_id).toBe(k.m);
    expect((await rpc(db, adm, 'api_articoli_elenco', { p_magazzino: k.m })).length).toBeGreaterThan(0);
    expect((await rpc(db, adm, 'api_notifiche', { p_magazzino: k.m })).elenco.length).toBeGreaterThan(0);
    expect((await rpc(db, adm, 'api_attivita', { p_magazzino: k.m })).length).toBeGreaterThan(0);
    await rpc(db, adm, 'api_heartbeat', { p_magazzino: k.m, p_pagina: '/x' });

    // un docente che non e' admin resta escluso dalle classi altrui
    const altro = await utente(db, nome('prof'), 'docente');
    await expect(rpc(db, altro, 'api_docente_utenti', { p_magazzino: k.m })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, altro, 'api_scenari_elenco', { p_magazzino: k.m })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, altro, 'api_articoli_elenco', { p_magazzino: k.m })).rejects.toThrow('permesso_negato');

    // chiude la classe: elimina e azzera
    await expect(rpc(db, adm, 'api_classe_elimina', { p_magazzino: k.m, p_conferma: 'no' })).rejects.toThrow('conferma_errata');
    await rpc(db, adm, 'api_classe_azzera', { p_magazzino: k.m, p_conferma: k.nome });
    await rpc(db, adm, 'api_classe_elimina', { p_magazzino: k.m, p_conferma: k.nome });
    expect(await conta(`select count(*) n from magazzini where id = $1`, [k.m])).toBe(0);
  });

  test('NON legge ne scrive il magazzino personale di un altro', async () => {
    const adm = await utente(db, nome('adm'), 'admin');
    const stud = await utente(db, nome('stu'));
    const doc = await utente(db, nome('prof'), 'docente');
    const ms = await personale(stud);
    const md = await personale(doc);
    await articolo(stud, ms);
    for (const m of [ms, md]) {
      await expect(rpc(db, adm, 'api_articoli_elenco', { p_magazzino: m })).rejects.toThrow('permesso_negato');
      await expect(articolo(adm, m)).rejects.toThrow('permesso_negato');
      await expect(rpc(db, adm, 'api_notifiche', { p_magazzino: m })).rejects.toThrow('permesso_negato');
      await expect(rpc(db, adm, 'api_attivita', { p_magazzino: m })).rejects.toThrow('permesso_negato');
      await expect(rpc(db, adm, 'api_magazzino_impostazioni', { p_magazzino: m, p_blocca_giacenza_negativa: false })).rejects.toThrow('permesso_negato');
      await expect(rpc(db, adm, 'api_docente_utenti', { p_magazzino: m })).rejects.toThrow('permesso_negato');
      await expect(rpc(db, adm, 'api_classe_membri', { p_magazzino: m })).rejects.toThrow('permesso_negato');
      await expect(rpc(db, adm, 'api_scenari_elenco', { p_magazzino: m })).rejects.toThrow('permesso_negato');
      await expect(rpc(db, adm, 'api_heartbeat', { p_magazzino: m, p_pagina: 'x' })).rejects.toThrow('permesso_negato');
    }
    // le funzioni helper dicono lo stesso
    await db.query(`select set_config('app.uid', $1, false)`, [adm]);
    expect((await uno(`select _sono_docente($1) v`, [ms])).v).toBe(false);
    expect((await uno(`select _puo($1, 'carico') v`, [ms])).v).toBe(false);
    // ne' il personale compare nell'elenco classi dell'admin
    const cl = await rpc(db, adm, 'api_docente_classi');
    expect(cl.map((c: any) => c.id)).not.toContain(ms);
    // il proprio personale funziona normalmente
    const mio = await personale(adm);
    expect((await articolo(adm, mio)).magazzino_id).toBe(mio);
  });

  test('un admin iscritto come studente a una classe resta docente su di essa', async () => {
    const k = await classe();
    const adm = await utente(db, nome('adm'), 'admin');
    const c = (await rpc(db, adm, 'api_docente_classi')).find((x: any) => x.id === k.m);
    const codice = (await uno(`select codice_ingresso c from magazzini where id = $1`, [k.m])).c;
    await rpc(db, adm, 'api_classe_entra', { p_codice: codice });
    expect(c).toBeTruthy();
    expect((await rpc(db, adm, 'api_magazzino_impostazioni', { p_magazzino: k.m, p_blocca_giacenza_negativa: true })).blocca_giacenza_negativa).toBe(true);
  });

  test('docente non admin: crea classi e vede solo le sue (invariato)', async () => {
    const k = await classe();
    const c = await rpc(db, k.doc, 'api_classe_crea', { p_nome: 'Seconda' });
    expect((await rpc(db, k.doc, 'api_docente_classi')).map((x: any) => x.id).sort()).toEqual([k.m, c.id].sort());
    await expect(rpc(db, k.st, 'api_docente_utenti', { p_magazzino: k.m })).rejects.toThrow('permesso_negato');
  });
});

describe('gestione utenti', () => {
  test('api_admin_utenti: filtri, forma, niente hash', async () => {
    const adm = await utente(db, nome('adm'), 'admin');
    const k = await classe();
    await rpc(db, k.st, 'api_heartbeat', { p_magazzino: k.m, p_pagina: 'x' });
    const tutti = await rpc(db, adm, 'api_admin_utenti');
    const riga = tutti.find((x: any) => x.user_id === k.doc);
    expect(Object.keys(riga).sort()).toEqual(['creato_il', 'n_classi_iscritto', 'n_classi_possedute', 'nome', 'ruolo_globale', 'ultimo_accesso', 'user_id', 'username']);
    expect(riga.n_classi_possedute).toBe(1);
    const st = tutti.find((x: any) => x.user_id === k.st);
    expect(st.n_classi_iscritto).toBe(1);
    expect(st.ultimo_accesso).not.toBeNull();
    expect(JSON.stringify(tutti)).not.toMatch(/password|crypt|\$2/);
    expect([...tutti].map((x: any) => x.username)).toEqual([...tutti].map((x: any) => x.username).sort());
    const soloAdmin = await rpc(db, adm, 'api_admin_utenti', { p_ruolo: 'admin' });
    expect(soloAdmin.every((x: any) => x.ruolo_globale === 'admin')).toBe(true);
    const cerca = await rpc(db, adm, 'api_admin_utenti', { p_cerca: ' ' + (await uno(`select username from profili where user_id = $1`, [k.st])).username.toUpperCase() });
    expect(cerca.map((x: any) => x.user_id)).toEqual([k.st]);
    expect(await rpc(db, adm, 'api_admin_utenti', { p_cerca: '%' })).toEqual([]);  // i caratteri jolly sono testo
    await expect(rpc(db, adm, 'api_admin_utenti', { p_ruolo: 'boh' })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, adm, 'api_admin_utenti', { p_cerca: 'x'.repeat(101) })).rejects.toThrow('dato_non_valido');
  });

  test('api_admin_utenti: massimo 200', async () => {
    const d2 = await nuovoDb();
    const adm = await utente(d2, 'zadmin', 'admin');
    await d2.query(`insert into auth.users (email) select 'ute' || g || '@shipping.local' from generate_series(1, 210) g`);
    expect((await rpc(d2, adm, 'api_admin_utenti')).length).toBe(200);
    await d2.close();
  });

  test('elimina utente: conferma, classi possedute, cascata; registro', async () => {
    const adm = await utente(db, nome('adm'), 'admin');
    const k = await classe();
    const docName = (await uno(`select username from profili where user_id = $1`, [k.doc])).username;
    const stName = (await uno(`select username from profili where user_id = $1`, [k.st])).username;
    await expect(rpc(db, adm, 'api_admin_elimina_utente', { p_user: k.doc, p_conferma: docName })).rejects.toMatchObject({ message: 'stato_non_valido', detail: 'possiede_classi' });
    await expect(rpc(db, adm, 'api_admin_elimina_utente', { p_user: k.st, p_conferma: 'no' })).rejects.toThrow('conferma_errata');
    await expect(rpc(db, adm, 'api_admin_elimina_utente', { p_user: '00000000-0000-0000-0000-000000000009', p_conferma: 'x' })).rejects.toThrow('non_trovato');
    const ms = await personale(k.st);
    await articolo(k.st, ms);
    expect(await rpc(db, adm, 'api_admin_elimina_utente', { p_user: k.st, p_conferma: stName })).toEqual({ ok: true });
    expect(await conta(`select count(*) n from auth.users where id = $1`, [k.st])).toBe(0);
    expect(await conta(`select count(*) n from magazzini where id = $1`, [ms])).toBe(0);
    const reg = (await rpc(db, adm, 'api_admin_registro')).find((r: any) => r.azione === 'utente_elimina' && r.bersaglio === stName);
    expect(reg.username).toBeTruthy();  // il bersaglio resta leggibile anche dopo l'eliminazione

    // un admin puo' eliminare se stesso solo se non e' l'ultimo
    const d2 = await nuovoDb();
    const a1 = await utente(d2, 'solo', 'admin');
    await expect(rpc(d2, a1, 'api_admin_elimina_utente', { p_user: a1, p_conferma: 'solo' })).rejects.toMatchObject({ detail: 'ultimo_admin' });
    await utente(d2, 'altro', 'admin');
    await rpc(d2, a1, 'api_admin_elimina_utente', { p_user: a1, p_conferma: 'solo' });
    await d2.close();
  });

  test('reset password: cambia l\'hash (bcrypt/crypt), non lo espone, non finisce nel registro', async () => {
    const adm = await utente(db, nome('adm'), 'admin');
    const u = await utente(db, nome('stu'));
    const prima = (await uno(`select encrypted_password p from auth.users where id = $1`, [u])).p;
    const segreta = 'Segr3ta-Unica-XYZ';
    expect(await rpc(db, adm, 'api_admin_reimposta_password', { p_user: u, p_password: segreta })).toEqual({ ok: true });
    const dopo = (await uno(`select encrypted_password p from auth.users where id = $1`, [u])).p;
    expect(dopo).not.toBe(prima);
    expect(dopo).not.toContain(segreta);
    // la password verifica contro l'hash salvato, un'altra no
    expect((await uno(`select extensions.crypt($1, $2) = $2 ok`, [segreta, dopo])).ok).toBe(true);
    expect((await uno(`select extensions.crypt($1, $2) = $2 ok`, ['altra-password', dopo])).ok).toBe(false);
    expect(dopo).toMatch(/^\$2[aby]\$/);  // bcrypt come Supabase (con pgcrypto vero)

    for (const out of [await rpc(db, adm, 'api_admin_utenti'), await rpc(db, adm, 'api_admin_registro'), await rpc(db, u, 'api_account'),
                       await rpc(db, adm, 'api_admin_reimposta_password', { p_user: u, p_password: segreta })]) {
      expect(JSON.stringify(out)).not.toContain(segreta);
      expect(JSON.stringify(out)).not.toContain(dopo);
    }
    expect(JSON.stringify((await db.query(`select * from registro_admin`)).rows)).not.toContain(segreta);
    await expect(rpc(db, adm, 'api_admin_reimposta_password', { p_user: u, p_password: '12345' })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, adm, 'api_admin_reimposta_password', { p_user: u, p_password: 'x'.repeat(73) })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, adm, 'api_admin_reimposta_password', { p_user: u, p_password: null })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, adm, 'api_admin_reimposta_password', { p_user: '00000000-0000-0000-0000-000000000009', p_password: segreta })).rejects.toThrow('non_trovato');
  });
});

describe('classi, trasferimento, statistiche, registro', () => {
  test('api_admin_classi e trasferimento', async () => {
    const adm = await utente(db, nome('adm'), 'admin');
    const k = await classe();
    await rpc(db, k.st, 'api_heartbeat', { p_magazzino: k.m, p_pagina: 'x' });
    const lista = await rpc(db, adm, 'api_admin_classi');
    const c = lista.find((x: any) => x.id === k.m);
    expect(c.proprietario.user_id).toBe(k.doc);
    expect(c.n_iscritti).toBe(1);
    expect(c.n_online).toBe(1);
    expect(Object.keys(c).sort()).toEqual(['created_at', 'id', 'n_iscritti', 'n_online', 'nome', 'proprietario']);

    const nuovo = await utente(db, nome('prof'), 'docente');
    const stud = await utente(db, nome('stu'));
    await expect(rpc(db, adm, 'api_admin_classe_trasferisci', { p_magazzino: k.m, p_nuovo_proprietario: stud })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, adm, 'api_admin_classe_trasferisci', { p_magazzino: k.m, p_nuovo_proprietario: '00000000-0000-0000-0000-000000000009' })).rejects.toThrow('non_trovato');
    const p = await utente(db, nome('pro'), 'docente');
    await expect(rpc(db, adm, 'api_admin_classe_trasferisci', { p_magazzino: await personale(p), p_nuovo_proprietario: nuovo })).rejects.toThrow('non_trovato');
    const r = await rpc(db, adm, 'api_admin_classe_trasferisci', { p_magazzino: k.m, p_nuovo_proprietario: nuovo });
    expect(r.proprietario.user_id).toBe(nuovo);
    expect((await uno(`select proprietario_id p from magazzini where id = $1`, [k.m])).p).toBe(nuovo);
    expect(await conta(`select count(*) n from membri where magazzino_id = $1 and user_id = $2 and ruolo = 'docente'`, [k.m, nuovo])).toBe(1);
    // lo studente della classe piu' il vecchio proprietario, retrocesso a studente dal trasferimento
    expect((await rpc(db, nuovo, 'api_docente_utenti', { p_magazzino: k.m })).length).toBe(2);
    // il vecchio proprietario ora puo' cancellare l'account; il nuovo no finche' possiede la classe
    const nome1 = (await uno(`select username u from profili where user_id = $1`, [k.doc])).u;
    await rpc(db, k.doc, 'api_account_elimina', { p_conferma: nome1 });
    const nome2 = (await uno(`select username u from profili where user_id = $1`, [nuovo])).u;
    await expect(rpc(db, nuovo, 'api_account_elimina', { p_conferma: nome2 })).rejects.toMatchObject({ detail: 'possiede_classi' });
  });

  test('api_admin_statistiche', async () => {
    const d2 = await nuovoDb();
    const adm = await utente(d2, 'capo', 'admin');
    const doc = await utente(d2, 'prof1', 'docente');
    const s1 = await utente(d2, 'alu1');
    await utente(d2, 'alu2');
    await rpc(d2, doc, 'api_classe_crea', { p_nome: 'A' });
    await rpc(d2, s1, 'api_inizializza');
    await rpc(d2, s1, 'api_heartbeat', { p_magazzino: null, p_pagina: 'x' });
    const s = await rpc(d2, adm, 'api_admin_statistiche');
    expect(s).toEqual({ utenti: { studenti: 2, docenti: 1, admin: 1 }, classi: 1, magazzini_personali: 1, online_ora: 1 });
    await d2.query(`update presenze set visto_il = now() - interval '60 seconds'`);
    expect((await rpc(d2, adm, 'api_admin_statistiche')).online_ora).toBe(0);
    await d2.close();
  });

  test('registro: ogni azione admin scritta (autore, bersaglio), limite, ordine, nessuna password', async () => {
    const d2 = await nuovoDb();
    const adm = await utente(d2, 'capo', 'admin');
    const u = await utente(d2, 'mario');
    const doc = await utente(d2, 'prof1', 'docente');
    await rpc(d2, adm, 'api_admin_imposta_ruolo', { p_user: u, p_ruolo: 'docente' });
    await rpc(d2, adm, 'api_admin_reimposta_password', { p_user: u, p_password: 'passw0rd!' });
    const c = await rpc(d2, adm, 'api_classe_crea', { p_nome: 'Admin class' });
    await rpc(d2, adm, 'api_admin_classe_trasferisci', { p_magazzino: c.id, p_nuovo_proprietario: doc });
    await rpc(d2, adm, 'api_classe_elimina', { p_magazzino: c.id, p_conferma: 'Admin class' });
    await rpc(d2, adm, 'api_admin_elimina_utente', { p_user: u, p_conferma: 'mario' });
    const reg = await rpc(d2, adm, 'api_admin_registro');
    expect(reg.map((r: any) => r.azione)).toEqual(['utente_elimina', 'classe_trasferisci', 'classe_crea', 'password_reimposta', 'ruolo']);
    expect(reg.every((r: any) => r.username === 'capo')).toBe(true);
    expect(reg[0].bersaglio).toBe('mario');
    expect(reg[4].dettagli).toMatchObject({ da: 'studente', a: 'docente' });
    expect(reg[2].bersaglio).toBeNull();
    expect(JSON.stringify(reg)).not.toContain('passw0rd');
    expect(await rpc(d2, adm, 'api_admin_registro', { p_limite: 2 })).toHaveLength(2);
    expect(await rpc(d2, adm, 'api_admin_registro', { p_limite: 0 })).toHaveLength(1);
    // un docente che crea classi NON scrive nel registro admin
    await rpc(d2, doc, 'api_classe_crea', { p_nome: 'Mia' });
    expect(await rpc(d2, adm, 'api_admin_registro')).toHaveLength(5);
    // tabella chiusa: RLS attiva e nessun privilegio al client
    expect((await d2.query<{ r: boolean }>(`select relrowsecurity r from pg_class where relname = 'registro_admin'`)).rows[0].r).toBe(true);
    expect((await d2.query<{ p: boolean }>(`select has_table_privilege('authenticated', 'registro_admin', 'select') p`)).rows[0].p).toBe(false);
    await d2.close();
  });

  test('primo admin: nessuna promozione automatica; si assegna a mano con la riga SQL documentata in 0010', async () => {
    // simulazione: database con 0001-0009 + 0099, utente creato, poi 0010 sopra
    const { readFileSync } = await import('node:fs');
    const { PGlite } = await import('@electric-sql/pglite');
    const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
    const d3 = new PGlite({ extensions: { pgcrypto } });
    const sql = (f: string) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');
    await d3.exec(readFileSync(new URL('../../../local-demo/shim.sql', import.meta.url), 'utf8'));
    for (const f of ['0001_schema', '0002_base', '0003_dati', '0004_documenti', '0005_classe', '0006_scenari', '0007_analisi', '0008_agenda', '0009_scenari_elenco', '0099_grants']) {
      await d3.exec(sql(`${f}.sql`));
    }
    const f = await utente(d3, 'francesco_foti', 'docente');
    await d3.exec(sql('0010_admin.sql'));  // sopra uno schema gia' installato (come nell'SQL Editor)
    expect((await d3.query<{ r: string }>(`select ruolo_globale r from profili where user_id = $1`, [f])).rows[0].r).toBe('docente');  // non promosso
    await d3.exec(`update profili set ruolo_globale = 'admin' where username = 'francesco_foti';`);  // la riga manuale di 0010
    // le nuove funzioni sono concesse, gli helper no, dopo l'applicazione "sopra" 0099
    const g = await d3.query<{ n: string; ok: boolean }>(
      `select proname n, has_function_privilege('authenticated', oid, 'execute') ok from pg_proc
        where pronamespace = 'public'::regnamespace and proname in ('api_admin_utenti','api_account','_e_admin','_registra_admin','_membro','_puo')`);
    for (const x of g.rows) expect(x.ok, x.n).toBe(x.n.startsWith('api_'));
    expect((await rpc(d3, f, 'api_admin_statistiche')).utenti.admin).toBe(1);
    await d3.exec(sql('0010_admin.sql'));  // riesecuzione: nessun errore
    await d3.close();
  });
});
