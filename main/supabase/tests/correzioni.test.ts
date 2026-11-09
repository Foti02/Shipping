// Test aggiuntivi alle correzioni di sicurezza che sicurezza.test.ts non copre.
import { beforeAll, describe, expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { nuovoDb, rpc, utente } from './helper';

let db: PGlite;
beforeAll(async () => { db = await nuovoDb(); }, 120_000);

let seq = 0;
const nome = (p: string) => `${p}${++seq}`;

async function personale() {
  const u = await utente(db, nome('cor'));
  const m = (await rpc(db, u, 'api_inizializza')).magazzini.find((x: any) => x.tipo === 'personale').id as string;
  return { u, m };
}
const articolo = async (u: string, m: string, extra: Record<string, unknown> = {}) =>
  (await rpc(db, u, 'api_articolo_salva', { p_magazzino: m, p_dati: { matricola: nome('M'), descrizione: 'Art', prezzo_acquisto_cent: 100, ...extra } })).id as string;
const salva = (u: string, m: string, tipo: string, righe: any[], extra: Record<string, unknown> = {}) =>
  rpc(db, u, 'api_documento_salva', { p_magazzino: m, p_documento: { tipo, ...extra }, p_righe: righe });
async function fai(u: string, m: string, tipo: string, righe: any[], extra: Record<string, unknown> = {}) {
  const b = await salva(u, m, tipo, righe, extra);
  return rpc(db, u, 'api_documento_conferma', { p_id: b.documento.id });
}
const giac = async (a: string) => Number((await db.query<{ q: string }>(`select coalesce(sum(qta),0)::text q from giacenze where articolo_id = $1`, [a])).rows[0].q);

describe('NaN, percentuali e overflow', () => {
  test('righe: prezzo NaN, sconto/iva/inps/ritenuta fuori 0..100 -> dato_non_valido', async () => {
    const { u, m } = await personale();
    const a = await articolo(u, m);
    for (const extra of [{ prezzo_cent: 'NaN' }, { sconto_perc: -1 }, { iva_perc: 101 }, { inps_perc: -5 }, { ritenuta_perc: 100.5 }, { iva_perc: 'NaN' }]) {
      await expect(salva(u, m, 'fattura_vendita', [{ articolo_id: a, qta: 1, prezzo_cent: 100, ...extra }])).rejects.toThrow('dato_non_valido');
    }
    await expect(salva(u, m, 'carico', [{ articolo_id: a, qta: 1e12 }])).rejects.toThrow('dato_non_valido');
  });

  test('articolo: scorte NaN o negative e valori NaN rifiutati', async () => {
    const { u, m } = await personale();
    for (const extra of [{ scorta_minima: 'NaN' }, { punto_riordino: 'NaN' }, { domanda_giornaliera: 'NaN' }, { ricarico_perc: 'NaN' }, { sconto_perc: 'NaN' }]) {
      await expect(rpc(db, u, 'api_articolo_salva', { p_magazzino: m, p_dati: { matricola: nome('Q'), descrizione: 'x', ...extra } })).rejects.toThrow('dato_non_valido');
    }
  });

  test('api_articoli_variazione: NaN e overflow di bigint -> dato_non_valido, nessuna modifica', async () => {
    const { u, m } = await personale();
    const a = await articolo(u, m, { prezzo_acquisto_cent: 4_000_000_000_000_000_000 });
    for (const [tipo, v] of [['prezzo_perc', 'NaN'], ['ricarico_perc', 'NaN'], ['prezzo_perc', 1000]] as const) {
      await expect(rpc(db, u, 'api_articoli_variazione', { p_magazzino: m, p_ids: [a], p_tipo: tipo, p_valore: v })).rejects.toThrow('dato_non_valido');
    }
    expect((await db.query<{ p: string }>(`select prezzo_acquisto_cent::text p from articoli where id = $1`, [a])).rows[0].p).toBe('4000000000000000000');
  });

  test('i check delle tabelle respingono NaN anche con scrittura diretta', async () => {
    const { u, m } = await personale();
    const a = await articolo(u, m, { giacenza_iniziale: 5 });
    await expect(db.query(`update giacenze set qta = 'NaN'`)).rejects.toThrow();
    await expect(db.query(`insert into movimenti_stock (magazzino_id, articolo_id, qta, causale) values ($1, $2, 'NaN', 'rettifica')`, [m, a])).rejects.toThrow();
  });
});

describe('documento_origine_id', () => {
  test('catena non valida, origine in bozza o di un altro magazzino respinte; catena valida accettata', async () => {
    const { u, m } = await personale();
    const altro = await personale();
    const a = await articolo(u, m);
    const of = await fai(u, m, 'ordine_fornitore', [{ articolo_id: a, qta: 1 }]);
    await expect(salva(u, m, 'preventivo', [{ articolo_id: a, qta: 1 }], { documento_origine_id: of.documento.id })).rejects.toThrow('dato_non_valido');
    const bozza = await salva(u, m, 'ordine_fornitore', [{ articolo_id: a, qta: 1 }]);
    await expect(salva(u, m, 'carico', [{ articolo_id: a, qta: 1 }], { documento_origine_id: bozza.documento.id })).rejects.toThrow('stato_non_valido');
    await expect(salva(altro.u, altro.m, 'carico', [{ articolo_id: a, qta: 1 }], { documento_origine_id: of.documento.id })).rejects.toThrow();
    const ok = await salva(u, m, 'carico', [{ articolo_id: a, qta: 1 }], { documento_origine_id: of.documento.id });
    expect(ok.origine.id).toBe(of.documento.id);
  });

  test('due carichi dallo stesso ordine: il secondo non si conferma (stato_non_valido) e la merce entra una volta sola', async () => {
    const { u, m } = await personale();
    const a = await articolo(u, m);
    const o = await fai(u, m, 'ordine_fornitore', [{ articolo_id: a, qta: 4 }]);
    const c1 = await salva(u, m, 'carico', [{ articolo_id: a, qta: 4 }], { documento_origine_id: o.documento.id });
    const c2 = await salva(u, m, 'carico', [{ articolo_id: a, qta: 4 }], { documento_origine_id: o.documento.id });
    await rpc(db, u, 'api_documento_conferma', { p_id: c1.documento.id });
    await expect(rpc(db, u, 'api_documento_conferma', { p_id: c2.documento.id })).rejects.toThrow('stato_non_valido');
    expect(await giac(a)).toBe(4);
    // annullato il primo carico l'ordine torna confermato e il secondo si puo' confermare
    await rpc(db, u, 'api_documento_annulla', { p_id: c1.documento.id });
    await rpc(db, u, 'api_documento_conferma', { p_id: c2.documento.id });
    expect(await giac(a)).toBe(4);
  });
});

describe('compiti e inventario', () => {
  async function classeConScenario() {
    const doc = await utente(db, nome('prof'), 'docente');
    const c = await rpc(db, doc, 'api_classe_crea', { p_nome: nome('Cl ') });
    const s = await utente(db, nome('alu'));
    await rpc(db, s, 'api_classe_entra', { p_codice: c.codice_ingresso });
    await rpc(db, doc, 'api_scenario_genera', { p_magazzino: c.id, p_nome: 'S', p_config: { seed: 5 } });
    return { doc, m: c.id as string, nome: c.nome as string, codice: c.codice_ingresso as string };
  }

  test('eliminare cliente o fornitore usato nei compiti: stato_non_valido con detail, compiti intatti; articolo idem', async () => {
    const k = await classeConScenario();
    const ana = (await db.query<{ id: string }>(`select anagrafica_id id from compiti where magazzino_id = $1 and anagrafica_id is not null limit 1`, [k.m])).rows[0].id;
    const art = (await db.query<{ id: string }>(`select articolo_id id from compiti where magazzino_id = $1 and articolo_id is not null limit 1`, [k.m])).rows[0].id;
    await expect(rpc(db, k.doc, 'api_anagrafica_elimina', { p_id: ana })).rejects.toMatchObject({ message: 'stato_non_valido', detail: 'usata_nei_compiti' });
    await expect(rpc(db, k.doc, 'api_articolo_elimina', { p_id: art })).rejects.toThrow('stato_non_valido');
    // a livello di tabella e' "restrict": niente cascade silenzioso
    await expect(db.query(`delete from anagrafiche where id = $1`, [ana])).rejects.toThrow();
  });

  test('azzera ed elimina classe funzionano anche con compiti (fk restrict)', async () => {
    const k = await classeConScenario();
    await rpc(db, k.doc, 'api_classe_azzera', { p_magazzino: k.m, p_conferma: k.nome });
    expect(Number((await db.query<any>(`select count(*)::int n from compiti where magazzino_id = $1`, [k.m])).rows[0].n)).toBe(0);
    const k2 = await classeConScenario();
    await rpc(db, k2.doc, 'api_classe_elimina', { p_magazzino: k2.m, p_conferma: k2.nome });
    expect(Number((await db.query<any>(`select count(*)::int n from magazzini where id = $1`, [k2.m])).rows[0].n)).toBe(0);
  });

  test('rettifica: contando MENO della giacenza attuale scarica la differenza e aggiorna qta_sistema', async () => {
    const { u, m } = await personale();
    const a = await articolo(u, m);
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 10 }]);
    const inv = await rpc(db, u, 'api_inventario_apri', { p_magazzino: m, p_nome: 'inv' });
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 5 }]); // sistema ora 15, fotografia 10
    const riga = (await db.query<{ id: string }>(`select id from inventario_righe where inventario_id = $1`, [inv.id])).rows[0].id;
    await rpc(db, u, 'api_inventario_conta', { p_riga: riga, p_qta: 8 });
    const r = await rpc(db, u, 'api_inventario_rettifica', { p_riga: riga, p_causale: 'smarrito' });
    expect(r.differenza).toBe(-7);
    expect(await giac(a)).toBe(8);
    expect(Number((await db.query<any>(`select qta_sistema::text q from inventario_righe where id = $1`, [riga])).rows[0].q)).toBe(15);
  });
});

describe('privacy docente, limiti e default', () => {
  test('api_docente_utenti: nome e pagina della classe di un altro docente restano nascosti', async () => {
    const d1 = await utente(db, nome('prof'), 'docente');
    const d2 = await utente(db, nome('prof'), 'docente');
    const c1 = await rpc(db, d1, 'api_classe_crea', { p_nome: 'Classe uno' });
    const c2 = await rpc(db, d2, 'api_classe_crea', { p_nome: 'Classe due segreta' });
    const s = await utente(db, nome('alu'));
    await rpc(db, s, 'api_classe_entra', { p_codice: c1.codice_ingresso });
    await rpc(db, s, 'api_classe_entra', { p_codice: c2.codice_ingresso });
    await rpc(db, s, 'api_heartbeat', { p_magazzino: c2.id, p_pagina: '/pagina-della-classe-due' });
    const v1 = (await rpc(db, d1, 'api_docente_utenti', { p_magazzino: c1.id }))[0];
    expect(v1.pagina).toBeNull();
    expect(v1.magazzino_usato).toEqual({ tipo: 'classe' });
    const v2 = (await rpc(db, d2, 'api_docente_utenti', { p_magazzino: c2.id }))[0];
    expect(v2.pagina).toBe('/pagina-della-classe-due');
    expect(v2.magazzino_usato).toMatchObject({ tipo: 'classe', id: c2.id, nome: 'Classe due segreta' });
  });

  test('heartbeat tronca la pagina a 100 caratteri; testi oltre 500 -> dato_non_valido', async () => {
    const { u, m } = await personale();
    await rpc(db, u, 'api_heartbeat', { p_magazzino: m, p_pagina: 'x'.repeat(5000) });
    expect((await db.query<any>(`select char_length(pagina) n from presenze where user_id = $1`, [u])).rows[0].n).toBe(100);
    await expect(rpc(db, u, 'api_articolo_salva', { p_magazzino: m, p_dati: { matricola: nome('L'), descrizione: 'x'.repeat(501) } })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, u, 'api_ubicazione_salva', { p_magazzino: m, p_dati: { codice: 'u'.repeat(501) } })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, u, 'api_scadenza_salva', { p_magazzino: m, p_dati: { oggetto: 'o'.repeat(501), inizio: '2030-01-01T10:00:00Z' } })).rejects.toThrow('dato_non_valido');
    await expect(salva(u, m, 'carico', [{ descrizione: 'd'.repeat(501), articolo_id: await articolo(u, m), qta: 1 }])).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, u, 'api_inventario_apri', { p_magazzino: m, p_nome: 'n'.repeat(501) })).rejects.toThrow('dato_non_valido');
  });

  test('un docente non supera 50 classi; api_inizializza resta idempotente (un solo personale)', async () => {
    const d = await utente(db, nome('prof'), 'docente');
    for (let i = 0; i < 50; i++) await rpc(db, d, 'api_classe_crea', { p_nome: `C${i}` });
    await expect(rpc(db, d, 'api_classe_crea', { p_nome: 'una di troppo' })).rejects.toThrow('dato_non_valido');
    await rpc(db, d, 'api_inizializza');
    await rpc(db, d, 'api_inizializza');
    expect(Number((await db.query<any>(`select count(*)::int n from magazzini where proprietario_id = $1 and tipo = 'personale'`, [d])).rows[0].n)).toBe(1);
  }, 120_000);

  test('tabella creata dopo 0099: RLS attiva in automatico', async () => {
    await db.exec(`create table _prova_rls (x int)`);
    try {
      const r = await db.query<{ rowsecurity: boolean }>(`select rowsecurity from pg_tables where tablename = '_prova_rls'`);
      expect(r.rows[0].rowsecurity).toBe(true);
    } finally { await db.exec(`drop table _prova_rls`); }
  });

  test('username prelevato dall email in minuscolo', async () => {
    const r = await db.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ('MaiUsc.Ok@shipping.local', '{"username":"altro.nome"}'::jsonb) returning id`);
    expect((await db.query<any>(`select username from profili where user_id = $1`, [r.rows[0].id])).rows[0].username).toBe('maiusc.ok');
  });
});
