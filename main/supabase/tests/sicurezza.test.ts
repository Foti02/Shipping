// Revisione di sicurezza e concorrenza.
// describe 'BUCHI': ogni test dimostra un problema reale e DEVE fallire finche' non si corregge la migrazione.
// describe 'gia sicuro': comportamenti verificati, devono passare.
import { beforeAll, describe, expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { nuovoDb, rpc, utente } from './helper';

let db: PGlite;
beforeAll(async () => { db = await nuovoDb(); }, 120_000);

let seq = 0;
const nome = (p: string) => `${p}${++seq}`;

async function personale() {
  const u = await utente(db, nome('sic'));
  const m = (await rpc(db, u, 'api_inizializza')).magazzini.find((x: any) => x.tipo === 'personale').id as string;
  return { u, m };
}
async function articolo(u: string, m: string, extra: Record<string, unknown> = {}) {
  return (await rpc(db, u, 'api_articolo_salva', { p_magazzino: m, p_dati: { matricola: nome('M'), descrizione: 'Art', prezzo_acquisto_cent: 100, ...extra } })).id as string;
}
async function fai(u: string, m: string, tipo: string, righe: any[], extra: Record<string, unknown> = {}) {
  const b = await rpc(db, u, 'api_documento_salva', { p_magazzino: m, p_documento: { tipo, ...extra }, p_righe: righe });
  return rpc(db, u, 'api_documento_conferma', { p_id: b.documento.id });
}
const giac = async (a: string) => Number((await db.query<{ q: string }>(`select coalesce(sum(qta),0)::text q from giacenze where articolo_id = $1`, [a])).rows[0].q);

/** Docente con classe e studenti con i ruoli aziendali indicati. */
async function classe(ruoli: (string | null)[]) {
  const doc = await utente(db, nome('prof'), 'docente');
  const c = await rpc(db, doc, 'api_classe_crea', { p_nome: nome('Classe ') });
  const st: string[] = [];
  for (const r of ruoli) {
    const s = await utente(db, nome('alu'));
    await rpc(db, s, 'api_classe_entra', { p_codice: c.codice_ingresso });
    if (r) await rpc(db, doc, 'api_classe_imposta_ruolo', { p_magazzino: c.id, p_user: s, p_ruolo_aziendale: r });
    st.push(s);
  }
  return { doc, m: c.id as string, nome: c.nome as string, codice: c.codice_ingresso as string, st };
}

describe('BUCHI (devono fallire finche non corretti)', () => {
  // BUCO: 'NaN' passa i controlli "<= 0" (NaN e' maggiore di tutto in Postgres) e numeric(14,3) lo accetta:
  // la giacenza diventa NaN e poi ogni scarico passa il controllo di giacenza negativa (NaN + x < 0 e' falso).
  test('api_trasferimento rifiuta p_qta = NaN', async () => {
    const { u, m } = await personale();
    const a = await articolo(u, m);
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 10 }]);
    const ub = (await rpc(db, u, 'api_ubicazione_salva', { p_magazzino: m, p_dati: { codice: nome('U') } })).id;
    await expect(rpc(db, u, 'api_trasferimento', { p_magazzino: m, p_articolo: a, p_lotto: null, p_da: null, p_a: ub, p_qta: 'NaN' }))
      .rejects.toThrow('dato_non_valido');
    expect(await giac(a)).toBe(10);
  });

  // BUCO: stessa radice (NaN) via giacenza_iniziale di api_articolo_salva.
  test('api_articolo_salva rifiuta giacenza_iniziale NaN', async () => {
    const { u, m } = await personale();
    await expect(rpc(db, u, 'api_articolo_salva', { p_magazzino: m, p_dati: { matricola: nome('N'), descrizione: 'x', giacenza_iniziale: 'NaN' } }))
      .rejects.toThrow('dato_non_valido');
  });

  // BUCO: stessa radice (NaN) via conta + rettifica d'inventario.
  test('api_inventario_conta rifiuta p_qta NaN', async () => {
    const { u, m } = await personale();
    const a = await articolo(u, m);
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 5 }]);
    const inv = await rpc(db, u, 'api_inventario_apri', { p_magazzino: m, p_nome: 'inv' });
    const riga = (await db.query<{ id: string }>(`select id from inventario_righe where inventario_id = $1`, [inv.id])).rows[0].id;
    await expect(rpc(db, u, 'api_inventario_conta', { p_riga: riga, p_qta: 'NaN' })).rejects.toThrow('dato_non_valido');
  });

  // BUCO: documento_origine_id libero in api_documento_salva: un secondo carico con origine = ordine gia' evaso
  // viene confermato -> la stessa merce ordinata entra due volte (doppia evasione).
  test('doppia evasione: secondo carico con origine = ordine gia evaso e rifiutato', async () => {
    const { u, m } = await personale();
    const a = await articolo(u, m);
    const o = await fai(u, m, 'ordine_fornitore', [{ articolo_id: a, qta: 7 }]);
    await rpc(db, u, 'api_ordine_evadi', { p_id: o.documento.id });
    const p = rpc(db, u, 'api_documento_salva', { p_magazzino: m, p_documento: { tipo: 'carico', documento_origine_id: o.documento.id }, p_righe: [{ articolo_id: a, qta: 7 }] })
      .then((b) => rpc(db, u, 'api_documento_conferma', { p_id: b.documento.id }));
    await expect(p).rejects.toThrow();
    expect(await giac(a)).toBe(7);
  });

  // BUCO: un commerciale (solo preventivo/ordine_cliente) mette come origine di un preventivo un ordine fornitore:
  // alla conferma l'ordine fornitore passa a 'evaso' senza alcun carico (salta il permesso evadi_ordine).
  test('commerciale non puo evadere un ordine fornitore via documento_origine_id', async () => {
    const k = await classe(['commerciale']);
    const a = await articolo(k.doc, k.m);
    const o = await fai(k.doc, k.m, 'ordine_fornitore', [{ articolo_id: a, qta: 3 }]);
    try {
      await fai(k.st[0], k.m, 'preventivo', [{ articolo_id: a, qta: 1 }], { documento_origine_id: o.documento.id });
    } catch { /* rifiutare va bene */ }
    const s = (await db.query<{ stato: string }>(`select stato from documenti where id = $1`, [o.documento.id])).rows[0].stato;
    expect(s).toBe('confermato');
  });

  // BUCO: compiti.anagrafica_id e' "on delete cascade": uno studente con anagrafiche.scrivi elimina un cliente dello
  // scenario non ancora usato in documenti e cancella i compiti degli altri studenti.
  test('eliminare un anagrafica non cancella i compiti dello scenario', async () => {
    const k = await classe(['magazziniere', 'magazziniere', 'acquisti']);
    await rpc(db, k.doc, 'api_scenario_genera', { p_magazzino: k.m, p_nome: 'S', p_config: { seed: 3 } });
    const r = (await db.query<{ id: string }>(
      `select c.anagrafica_id id from compiti c join anagrafiche an on an.id = c.anagrafica_id
        where c.magazzino_id = $1 and an.tipo = 'cliente'
          and not exists (select 1 from documenti d where d.anagrafica_id = c.anagrafica_id) limit 1`, [k.m])).rows[0].id;
    const prima = Number((await db.query<{ n: string }>(`select count(*)::text n from compiti where magazzino_id = $1`, [k.m])).rows[0].n);
    try { await rpc(db, k.st[2], 'api_anagrafica_elimina', { p_id: r }); } catch { /* rifiutare va bene */ }
    const dopo = Number((await db.query<{ n: string }>(`select count(*)::text n from compiti where magazzino_id = $1`, [k.m])).rows[0].n);
    expect(dopo).toBe(prima);
  });

  // BUCO: la rettifica usa qta_sistema fotografata all'apertura: se nel frattempo ci sono movimenti,
  // la giacenza finale non e' quella contata (TOCTOU tra apertura e rettifica).
  test('rettifica porta la giacenza alla quantita contata anche dopo movimenti', async () => {
    const { u, m } = await personale();
    const a = await articolo(u, m);
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 10 }]);
    const inv = await rpc(db, u, 'api_inventario_apri', { p_magazzino: m, p_nome: 'inv' });
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 5 }]);
    const riga = (await db.query<{ id: string }>(`select id from inventario_righe where inventario_id = $1`, [inv.id])).rows[0].id;
    await rpc(db, u, 'api_inventario_conta', { p_riga: riga, p_qta: 12 });
    await rpc(db, u, 'api_inventario_rettifica', { p_riga: riga, p_causale: 'conteggio' });
    expect(await giac(a)).toBe(12);
  });

  // BUCO: iva_perc / inps_perc / ritenuta_perc delle righe non sono validati (solo numeric(5,2)): totali negativi.
  test('api_documento_salva rifiuta iva_perc negativa', async () => {
    const { u, m } = await personale();
    await expect(rpc(db, u, 'api_documento_salva', {
      p_magazzino: m, p_documento: { tipo: 'fattura_vendita' },
      p_righe: [{ descrizione: 'x', qta: 1, prezzo_cent: 1000, iva_perc: -500 }],
    })).rejects.toThrow('dato_non_valido');
  });

  // BUCO: le funzioni create DOPO 0099 (nuove migrazioni applicate su un DB dove 0099 e' gia' girata) prendono
  // EXECUTE per PUBLIC (default di Postgres) e, su Supabase, ALL per anon/authenticated (default privileges);
  // le tabelle nuove prendono i grant e non hanno RLS. Si simula il default di Supabase e si crea un oggetto dopo 0099.
  test('oggetti creati dopo 0099 non sono accessibili a anon/authenticated', async () => {
    const d = new PGlite();
    await d.exec(readFileSync(new URL('../../../local-demo/shim.sql', import.meta.url), 'utf8'));
    await d.exec(`alter default privileges in schema public grant all on tables to anon, authenticated;
                  alter default privileges in schema public grant all on functions to anon, authenticated;`);
    const dir = new URL('../migrations/', import.meta.url);
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) await d.exec(readFileSync(new URL(f, dir), 'utf8'));
    await d.exec(`create function _interna_nuova() returns int language sql as 'select 1';
                  create table tabella_nuova (x int);`);
    const r = await d.query<any>(`select has_function_privilege('anon', '_interna_nuova()', 'execute') fa,
                                         has_function_privilege('authenticated', '_interna_nuova()', 'execute') fu,
                                         has_table_privilege('anon', 'tabella_nuova', 'select') ta`);
    expect(r.rows[0]).toEqual({ fa: false, fu: false, ta: false });
  }, 120_000);

  // BUCO (basso): lo username viene dai metadati, non dall'email: con email x@shipping.local si prende lo username
  // "prof.rossi" prima del docente vero (che poi verrebbe promosso da SQL per username sull'account sbagliato).
  test('lo username del profilo coincide con la parte locale dell email', async () => {
    const r = await db.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`,
      ['abusivo1@shipping.local', JSON.stringify({ username: 'prof.rossi' })]);
    const p = await db.query<{ username: string }>(`select username from profili where user_id = $1`, [r.rows[0].id]);
    expect(p.rows[0].username).toBe('abusivo1');
  });
});

describe('gia sicuro', () => {
  test('grant: nessuna funzione _interna eseguibile dal client, nessuna api_* per anon, nessuna tabella', async () => {
    const f = await db.query<{ n: string }>(
      `select proname n from pg_proc where pronamespace = 'public'::regnamespace
         and (has_function_privilege('anon', oid, 'execute')
              or (proname not like 'api\\_%' and has_function_privilege('authenticated', oid, 'execute')))`);
    expect(f.rows.map((x) => x.n)).toEqual([]);
    const t = await db.query<{ n: string }>(
      `select tablename n from pg_tables where schemaname = 'public'
         and (has_table_privilege('authenticated', schemaname || '.' || tablename, 'select,insert,update,delete')
              or has_table_privilege('anon', schemaname || '.' || tablename, 'select,insert,update,delete')
              or not rowsecurity)`);
    expect(t.rows).toEqual([]);
  });

  test('ogni security definer ha search_path fisso; nessun SQL dinamico nelle api_*', async () => {
    const r = await db.query<{ n: string }>(
      `select proname n from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
         and not exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c like 'search_path=%')`);
    expect(r.rows).toEqual([]);
    const d = await db.query<{ n: string }>(
      `select proname n from pg_proc where pronamespace = 'public'::regnamespace and proname like 'api\\_%' and prosrc ~* '\\mexecute\\M'`);
    expect(d.rows).toEqual([]);
  });

  test('studente: niente classi, niente ruoli, niente dati di altri magazzini', async () => {
    const a = await personale();
    const b = await personale();
    const art = await articolo(a.u, a.m);
    await expect(rpc(db, b.u, 'api_classe_crea', { p_nome: 'x' })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, b.u, 'api_articoli_elenco', { p_magazzino: a.m })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, b.u, 'api_articolo_leggi', { p_id: art })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, b.u, 'api_articolo_salva', { p_magazzino: b.m, p_dati: { id: art, descrizione: 'mia' } })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, b.u, 'api_articolo_elimina', { p_id: art })).rejects.toThrow('permesso_negato');
    const d = await rpc(db, a.u, 'api_documento_salva', { p_magazzino: a.m, p_documento: { tipo: 'carico' }, p_righe: [{ articolo_id: art, qta: 1 }] });
    await expect(rpc(db, b.u, 'api_documento_conferma', { p_id: d.documento.id })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, b.u, 'api_documento_leggi', { p_id: d.documento.id })).rejects.toThrow('permesso_negato');
    // articolo di A dentro un documento di B
    await expect(rpc(db, b.u, 'api_documento_salva', { p_magazzino: b.m, p_documento: { tipo: 'carico' }, p_righe: [{ articolo_id: art, qta: 1 }] }))
      .rejects.toThrow('dato_non_valido');
    // bozza di A modificata passando il magazzino di B
    await expect(rpc(db, b.u, 'api_documento_salva', { p_magazzino: b.m, p_documento: { id: d.documento.id }, p_righe: [] }))
      .rejects.toThrow('non_trovato');
    await expect(rpc(db, b.u, 'api_trasferimento', { p_magazzino: b.m, p_articolo: art, p_lotto: null, p_da: null, p_a: null, p_qta: 1 }))
      .rejects.toThrow('dato_non_valido');
  });

  test('classe: ruoli rispettati, funzioni docente negate, codice disattivato o rigenerato non vale', async () => {
    const k = await classe(['magazziniere', null]);
    await expect(rpc(db, k.st[0], 'api_documento_salva', { p_magazzino: k.m, p_documento: { tipo: 'ordine_fornitore' }, p_righe: [] }))
      .rejects.toThrow('permesso_negato');
    await expect(rpc(db, k.st[1], 'api_classe_imposta_ruolo', { p_magazzino: k.m, p_user: k.st[1], p_ruolo_aziendale: null })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, k.st[1], 'api_classe_membri', { p_magazzino: k.m })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, k.st[1], 'api_docente_utenti', { p_magazzino: k.m })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, k.st[1], 'api_scenario_genera', { p_magazzino: k.m, p_nome: 'x', p_config: {} })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, k.st[1], 'api_magazzino_impostazioni', { p_magazzino: k.m, p_blocca_giacenza_negativa: false })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, k.st[1], 'api_classe_azzera', { p_magazzino: k.m, p_conferma: k.nome })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, k.doc, 'api_classe_imposta_ruolo', { p_magazzino: k.m, p_user: k.doc, p_ruolo_aziendale: null })).rejects.toThrow('dato_non_valido');
    await rpc(db, k.doc, 'api_classe_codice', { p_magazzino: k.m, p_azione: 'disattiva' });
    const x = await utente(db, nome('tardi'));
    await expect(rpc(db, x, 'api_classe_entra', { p_codice: k.codice })).rejects.toThrow('codice_non_valido');
    await rpc(db, k.doc, 'api_classe_codice', { p_magazzino: k.m, p_azione: 'attiva' });
    await rpc(db, k.doc, 'api_classe_codice', { p_magazzino: k.m, p_azione: 'rigenera' });
    await expect(rpc(db, x, 'api_classe_entra', { p_codice: k.codice })).rejects.toThrow('codice_non_valido');
    // ri-entrare non cambia il ruolo
    const r = await rpc(db, k.st[0], 'api_classe_entra', { p_codice: (await db.query<any>(`select codice_ingresso c from magazzini where id = $1`, [k.m])).rows[0].c });
    expect(r.ruolo).toBe('studente');
    expect(r.ruolo_aziendale).toBe('magazziniere');
  });

  test('docente: non legge il magazzino personale degli studenti', async () => {
    const k = await classe([null]);
    const p = (await rpc(db, k.st[0], 'api_inizializza')).magazzini.find((x: any) => x.tipo === 'personale').id;
    await rpc(db, k.st[0], 'api_heartbeat', { p_magazzino: p, p_pagina: '/segreta' });
    await expect(rpc(db, k.doc, 'api_articoli_elenco', { p_magazzino: p })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, k.doc, 'api_attivita', { p_magazzino: p })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, k.doc, 'api_docente_utenti', { p_magazzino: p })).rejects.toThrow('permesso_negato');
    const u = (await rpc(db, k.doc, 'api_docente_utenti', { p_magazzino: k.m }))[0];
    expect(u.pagina).toBeNull();
    expect(u.magazzino_usato).toEqual({ tipo: 'personale' });
  });

  test('stati: doppia conferma, doppio annullo, doppia evasione con api_ordine_evadi', async () => {
    const { u, m } = await personale();
    const a = await articolo(u, m);
    const c = await fai(u, m, 'carico', [{ articolo_id: a, qta: 4 }]);
    await expect(rpc(db, u, 'api_documento_conferma', { p_id: c.documento.id })).rejects.toThrow('stato_non_valido');
    await expect(rpc(db, u, 'api_documento_salva', { p_magazzino: m, p_documento: { id: c.documento.id }, p_righe: [] })).rejects.toThrow('stato_non_valido');
    await expect(rpc(db, u, 'api_documento_elimina', { p_id: c.documento.id })).rejects.toThrow('stato_non_valido');
    await rpc(db, u, 'api_documento_annulla', { p_id: c.documento.id });
    await expect(rpc(db, u, 'api_documento_annulla', { p_id: c.documento.id })).rejects.toThrow('stato_non_valido');
    expect(await giac(a)).toBe(0);
    const o = await fai(u, m, 'ordine_fornitore', [{ articolo_id: a, qta: 2 }]);
    await rpc(db, u, 'api_ordine_evadi', { p_id: o.documento.id });
    await expect(rpc(db, u, 'api_ordine_evadi', { p_id: o.documento.id })).rejects.toThrow('stato_non_valido');
    expect(await giac(a)).toBe(2);
    await expect(rpc(db, u, 'api_articolo_elimina', { p_id: a })).rejects.toThrow('stato_non_valido');
  });

  test('quantita: zero, negative e NaN nei documenti rifiutate', async () => {
    const { u, m } = await personale();
    const a = await articolo(u, m);
    for (const qta of [0, -1, 'NaN']) {
      await expect(rpc(db, u, 'api_documento_salva', { p_magazzino: m, p_documento: { tipo: 'carico' }, p_righe: [{ articolo_id: a, qta }] })).rejects.toThrow();
    }
    await expect(rpc(db, u, 'api_trasferimento', { p_magazzino: m, p_articolo: a, p_lotto: null, p_da: null, p_a: null, p_qta: 1 })).rejects.toThrow('dato_non_valido');
  });
});
