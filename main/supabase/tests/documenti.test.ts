import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { nuovoDb, rpc, utente } from './helper';

let db: PGlite;
beforeAll(async () => { db = await nuovoDb(['0004']); }, 60_000);

let seq = 0;
const nome = (p: string) => `${p}${++seq}`;

/** Utente con magazzino personale (tutti i permessi). */
async function nuovoMagazzino() {
  const u = await utente(db, nome('usr'));
  const m = (await rpc(db, u, 'api_inizializza')).magazzini[0].id as string;
  return { u, m };
}
async function articolo(m: string, extra: Record<string, unknown> = {}) {
  const c = { matricola: nome('A'), descrizione: 'Articolo', prezzo_acquisto_cent: 500, gestione_lotti: false, punto_riordino: 0, ...extra };
  const r = await db.query<{ id: string }>(
    `insert into articoli (magazzino_id, matricola, descrizione, prezzo_acquisto_cent, gestione_lotti, punto_riordino)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [m, c.matricola, c.descrizione, c.prezzo_acquisto_cent, c.gestione_lotti, c.punto_riordino],
  );
  return r.rows[0].id;
}
async function anagrafica(m: string, tipo: 'cliente' | 'fornitore') {
  const r = await db.query<{ id: string }>(
    `insert into anagrafiche (magazzino_id, tipo, ragione_sociale) values ($1,$2,$3) returning id`, [m, tipo, nome('Rag')]);
  return r.rows[0].id;
}
async function lotto(m: string, art: string, codice: string, scadenza: string) {
  const r = await db.query<{ id: string }>(
    `insert into lotti (magazzino_id, articolo_id, codice, scadenza) values ($1,$2,$3,$4) returning id`, [m, art, codice, scadenza]);
  return r.rows[0].id;
}
async function ubicazione(m: string, codice: string) {
  const r = await db.query<{ id: string }>(`insert into ubicazioni (magazzino_id, codice) values ($1,$2) returning id`, [m, codice]);
  return r.rows[0].id;
}
/** Salva una bozza e la conferma: ritorna il documento confermato. */
async function fai(u: string, m: string, tipo: string, righe: any[], extra: Record<string, unknown> = {}) {
  const b = await rpc(db, u, 'api_documento_salva', { p_magazzino: m, p_documento: { tipo, ...extra }, p_righe: righe });
  return rpc(db, u, 'api_documento_conferma', { p_id: b.documento.id });
}
async function bozza(u: string, m: string, tipo: string, righe: any[], extra: Record<string, unknown> = {}) {
  return (await rpc(db, u, 'api_documento_salva', { p_magazzino: m, p_documento: { tipo, ...extra }, p_righe: righe })).documento.id as string;
}
const totale = async (u: string, m: string, a: string) =>
  (await rpc(db, u, 'api_giacenze', { p_magazzino: m, p_articolo: a })).reduce((s: number, g: any) => s + Number(g.qta), 0);

describe('giacenze', () => {
  test('carico e scarico aggiornano la giacenza e il registro movimenti', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m);
    const c = await fai(u, m, 'carico', [{ articolo_id: a, qta: 10, prezzo_cent: 500 }]);
    expect(c.documento.stato).toBe('confermato');
    expect(c.documento.numero).toBe(1);
    expect(await totale(u, m, a)).toBe(10);
    const s = await fai(u, m, 'scarico', [{ articolo_id: a, qta: 4 }]);
    expect(s.documento.numero).toBe(1);
    expect(s.documento.stato_spedizione).toBe('da_preparare');
    expect(await totale(u, m, a)).toBe(6);
    const mov = await db.query<any>(`select causale, qta, costo_unit_cent from movimenti_stock where articolo_id = $1 order by id`, [a]);
    expect(mov.rows.map((r) => [r.causale, Number(r.qta), Number(r.costo_unit_cent)])).toEqual([['carico', 10, 500], ['scarico', -4, 500]]);
  });

  test('giacenza_insufficiente: scarico rifiutato, nulla cambia', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m);
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 6 }]);
    const id = await bozza(u, m, 'scarico', [{ articolo_id: a, qta: 7 }]);
    await expect(rpc(db, u, 'api_documento_conferma', { p_id: id })).rejects.toThrow('giacenza_insufficiente');
    expect(await totale(u, m, a)).toBe(6);
    expect((await rpc(db, u, 'api_documento_leggi', { p_id: id })).documento.stato).toBe('bozza');
  });

  test('blocca_giacenza_negativa = false permette il negativo', async () => {
    const { u, m } = await nuovoMagazzino();
    await db.query(`update magazzini set blocca_giacenza_negativa = false where id = $1`, [m]);
    const a = await articolo(m);
    await fai(u, m, 'scarico', [{ articolo_id: a, qta: 3 }]);
    expect(await totale(u, m, a)).toBe(-3);
  });

  test('FEFO: con lotti si consuma prima la scadenza piu vicina', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m, { gestione_lotti: true });
    const tardi = await lotto(m, a, 'L-TARDI', '2027-01-01');
    const presto = await lotto(m, a, 'L-PRESTO', '2026-12-01');
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 5, lotto_id: tardi }, { articolo_id: a, qta: 5, lotto_id: presto }]);
    await fai(u, m, 'scarico', [{ articolo_id: a, qta: 7 }]);
    const g = await rpc(db, u, 'api_giacenze', { p_magazzino: m, p_articolo: a });
    expect(g).toHaveLength(1);
    expect(g[0].lotto_codice).toBe('L-TARDI');
    expect(Number(g[0].qta)).toBe(3);
  });

  test('FIFO: senza lotti si consuma la giacenza piu vecchia', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m);
    const u1 = await ubicazione(m, 'A-01');
    const u2 = await ubicazione(m, 'A-02');
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 5, ubicazione_id: u1 }]);
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 5, ubicazione_id: u2 }]);
    await fai(u, m, 'scarico', [{ articolo_id: a, qta: 7 }]);
    const g = await rpc(db, u, 'api_giacenze', { p_magazzino: m, p_articolo: a });
    expect(g.map((x: any) => [x.ubicazione_codice, Number(x.qta)])).toEqual([['A-02', 3]]);
  });

  test('trasferimento: due movimenti, totale invariato', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m);
    const u1 = await ubicazione(m, 'B-01');
    const u2 = await ubicazione(m, 'B-02');
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 10, ubicazione_id: u1 }]);
    await rpc(db, u, 'api_trasferimento', { p_magazzino: m, p_articolo: a, p_lotto: null, p_da: u1, p_a: u2, p_qta: 4 });
    const g = await rpc(db, u, 'api_giacenze', { p_magazzino: m, p_articolo: a });
    expect(g.map((x: any) => [x.ubicazione_codice, Number(x.qta)])).toEqual([['B-01', 6], ['B-02', 4]]);
    const mov = await db.query<any>(`select causale from movimenti_stock where articolo_id = $1 and causale like 'trasf%' order by causale`, [a]);
    expect(mov.rows.map((r) => r.causale)).toEqual(['trasferimento_in', 'trasferimento_out']);
    await expect(rpc(db, u, 'api_trasferimento', { p_magazzino: m, p_articolo: a, p_lotto: null, p_da: u2, p_a: u1, p_qta: 5 }))
      .rejects.toThrow('giacenza_insufficiente');
  });
});

describe('numerazione', () => {
  test('conferme concorrenti: progressivo per anno, senza buchi ne doppioni', async () => {
    const { u, m } = await nuovoMagazzino();
    const ids: string[] = [];
    for (let i = 0; i < 15; i++) {
      ids.push(await bozza(u, m, 'preventivo', [{ articolo_id: await articolo(m), qta: 1 }]));
    }
    const out = await Promise.all(ids.map((id) => rpc(db, u, 'api_documento_conferma', { p_id: id })));
    const numeri = out.map((d) => d.documento.numero).sort((x, y) => x - y);
    expect(numeri).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  test('anni diversi hanno contatori separati', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m);
    const d25 = await fai(u, m, 'preventivo', [{ articolo_id: a, qta: 1 }], { data: '2025-03-01' });
    const d26 = await fai(u, m, 'preventivo', [{ articolo_id: a, qta: 1 }], { data: '2026-03-01' });
    const d26b = await fai(u, m, 'preventivo', [{ articolo_id: a, qta: 1 }], { data: '2026-04-01' });
    expect([d25.documento.anno, d25.documento.numero]).toEqual([2025, 1]);
    expect([d26.documento.anno, d26.documento.numero]).toEqual([2026, 1]);
    expect(d26b.documento.numero).toBe(2);
  });

  test('scarichi concorrenti sulla stessa merce: nessuno scarica oltre la giacenza, numeri senza buchi', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m);
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 100 }]);
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) ids.push(await bozza(u, m, 'scarico', [{ articolo_id: a, qta: 10 }]));
    const esiti = await Promise.allSettled(ids.map((id) => rpc(db, u, 'api_documento_conferma', { p_id: id })));
    const ok = esiti.filter((e) => e.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const ko = esiti.filter((e) => e.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(10);
    expect(ko).toHaveLength(1);
    expect(String(ko[0].reason.message)).toContain('giacenza_insufficiente');
    expect(ok.map((e) => e.value.documento.numero).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(await totale(u, m, a)).toBe(0);
  });
});

describe('ciclo documentale', () => {
  test('annullo di uno scarico riporta la giacenza e scrive causale annullo', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m);
    const c = await fai(u, m, 'carico', [{ articolo_id: a, qta: 10 }]);
    const s = await fai(u, m, 'scarico', [{ articolo_id: a, qta: 4 }]);
    expect(await totale(u, m, a)).toBe(6);
    const r = await rpc(db, u, 'api_documento_annulla', { p_id: s.documento.id });
    expect(r.documento.stato).toBe('annullato');
    expect(await totale(u, m, a)).toBe(10);
    const mov = await db.query<any>(`select qta from movimenti_stock where documento_id = $1 and causale = 'annullo'`, [s.documento.id]);
    expect(mov.rows.map((x) => Number(x.qta))).toEqual([4]);
    await expect(rpc(db, u, 'api_documento_annulla', { p_id: s.documento.id })).rejects.toThrow('stato_non_valido');
    // ora lo scarico e' annullato: annullare il carico e' possibile (giacenza 10 >= 10)
    await rpc(db, u, 'api_documento_annulla', { p_id: c.documento.id });
    expect(await totale(u, m, a)).toBe(0);
  });

  test('annullo di un carico con merce gia venduta: giacenza_insufficiente', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m);
    const c = await fai(u, m, 'carico', [{ articolo_id: a, qta: 10 }]);
    await fai(u, m, 'scarico', [{ articolo_id: a, qta: 4 }]);
    await expect(rpc(db, u, 'api_documento_annulla', { p_id: c.documento.id })).rejects.toThrow('giacenza_insufficiente');
    expect(await totale(u, m, a)).toBe(6);
  });

  test('catena preventivo -> ordine_cliente -> scarico -> fattura, con totali', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m);
    const cli = await anagrafica(m, 'cliente');
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 20, prezzo_cent: 400 }]);

    const prev = await fai(u, m, 'preventivo', [{ articolo_id: a, qta: 3, prezzo_cent: 1000, sconto_perc: 10, iva_perc: 22 }],
      { anagrafica_id: cli });
    expect(prev.documento.imponibile_cent).toBe(2700);
    expect(prev.documento.imposta_cent).toBe(594);
    expect(prev.documento.totale_cent).toBe(3294);
    expect(prev.righe[0].totale_cent).toBe(3294);

    const ord = await rpc(db, u, 'api_documento_genera', { p_origine: prev.documento.id, p_tipo: 'ordine_cliente' });
    expect(ord.documento.stato).toBe('bozza');
    expect(ord.origine.id).toBe(prev.documento.id);
    expect(ord.righe).toHaveLength(1);
    const ordC = await rpc(db, u, 'api_documento_conferma', { p_id: ord.documento.id });
    expect((await rpc(db, u, 'api_documento_leggi', { p_id: prev.documento.id })).documento.stato).toBe('evaso');
    expect(ordC.documento.stato_spedizione).toBe('da_preparare');

    const sc = await rpc(db, u, 'api_documento_genera', { p_origine: ord.documento.id, p_tipo: 'scarico' });
    const scC = await rpc(db, u, 'api_documento_conferma', { p_id: sc.documento.id });
    expect(await totale(u, m, a)).toBe(17);
    expect((await rpc(db, u, 'api_documento_leggi', { p_id: ord.documento.id })).documento.stato).toBe('evaso');
    expect(scC.documento.anagrafica.id).toBe(cli);

    const fat = await rpc(db, u, 'api_documento_genera', { p_origine: sc.documento.id, p_tipo: 'fattura_vendita' });
    const fatC = await rpc(db, u, 'api_documento_conferma', { p_id: fat.documento.id });
    expect(fatC.documento.totale_cent).toBe(3294);
    const scDopo = await rpc(db, u, 'api_documento_leggi', { p_id: sc.documento.id });
    expect(scDopo.documento.stato).toBe('evaso');
    expect(scDopo.derivati.map((x: any) => x.id)).toEqual([fat.documento.id]);

    await expect(rpc(db, u, 'api_documento_genera', { p_origine: sc.documento.id, p_tipo: 'carico' })).rejects.toThrow('dato_non_valido');
    const pag = await rpc(db, u, 'api_documento_pagato', { p_id: fat.documento.id, p_pagato: true });
    expect(pag.documento.pagato).toBe(true);
  });

  test('ordine fornitore: evadi crea e conferma il carico, l ordine passa a evaso', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m);
    const f = await anagrafica(m, 'fornitore');
    const o = await fai(u, m, 'ordine_fornitore', [{ articolo_id: a, qta: 12, prezzo_cent: 450 }], { anagrafica_id: f });
    expect(await totale(u, m, a)).toBe(0);
    const c = await rpc(db, u, 'api_ordine_evadi', { p_id: o.documento.id });
    expect(c.documento.tipo).toBe('carico');
    expect(c.documento.stato).toBe('confermato');
    expect(await totale(u, m, a)).toBe(12);
    expect((await rpc(db, u, 'api_documento_leggi', { p_id: o.documento.id })).documento.stato).toBe('evaso');
    // annullando il carico l'ordine torna evadibile
    await rpc(db, u, 'api_documento_annulla', { p_id: c.documento.id });
    expect((await rpc(db, u, 'api_documento_leggi', { p_id: o.documento.id })).documento.stato).toBe('confermato');
  });

  test('bozze: modifica, elenco, eliminazione; confermati non si toccano', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m);
    const id = await bozza(u, m, 'carico', [{ articolo_id: a, qta: 2 }]);
    const mod = await rpc(db, u, 'api_documento_salva', { p_magazzino: m, p_documento: { id, note: 'x' }, p_righe: [{ articolo_id: a, qta: 5 }, { articolo_id: a, qta: 1 }] });
    expect(mod.righe).toHaveLength(2);
    expect(mod.documento.note).toBe('x');
    expect(mod.documento.numero).toBeNull();
    const el = await rpc(db, u, 'api_documenti_elenco', { p_magazzino: m, p_tipo: 'carico', p_stato: 'bozza' });
    expect(el).toHaveLength(1);
    expect(el[0].n_righe).toBe(2);
    await rpc(db, u, 'api_documento_conferma', { p_id: id });
    await expect(rpc(db, u, 'api_documento_elimina', { p_id: id })).rejects.toThrow('stato_non_valido');
    await expect(rpc(db, u, 'api_documento_salva', { p_magazzino: m, p_documento: { id }, p_righe: [] })).rejects.toThrow('stato_non_valido');
    const id2 = await bozza(u, m, 'carico', [{ articolo_id: a, qta: 1 }]);
    await rpc(db, u, 'api_documento_elimina', { p_id: id2 });
    await expect(rpc(db, u, 'api_documento_leggi', { p_id: id2 })).rejects.toThrow('non_trovato');
  });
});

describe('spedizioni', () => {
  test('solo in avanti, con notifica', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m);
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 5 }]);
    const s = await fai(u, m, 'scarico', [{ articolo_id: a, qta: 1 }]);
    const id = s.documento.id;
    const r1 = await rpc(db, u, 'api_spedizione_stato', { p_documento: id, p_stato: 'preparato' });
    expect(r1.documento.stato_spedizione).toBe('preparato');
    await expect(rpc(db, u, 'api_spedizione_stato', { p_documento: id, p_stato: 'da_preparare' })).rejects.toThrow('stato_non_valido');
    await expect(rpc(db, u, 'api_spedizione_stato', { p_documento: id, p_stato: 'preparato' })).rejects.toThrow('stato_non_valido');
    await rpc(db, u, 'api_spedizione_stato', { p_documento: id, p_stato: 'spedito' });
    await expect(rpc(db, u, 'api_spedizione_stato', { p_documento: id, p_stato: 'preparato' })).rejects.toThrow('stato_non_valido');
    await expect(rpc(db, u, 'api_spedizione_stato', { p_documento: id, p_stato: 'boh' })).rejects.toThrow('dato_non_valido');
    const n = await db.query(`select 1 from notifiche where magazzino_id = $1 and tipo = 'spedizione'`, [m]);
    expect(n.rowCount).toBe(2);
  });
});

describe('permessi', () => {
  test('ogni ruolo aziendale fa solo i propri documenti', async () => {
    const doc = await utente(db, nome('doc'), 'docente');
    const mag = await utente(db, nome('mag'));
    const acq = await utente(db, nome('acq'));
    const com = await utente(db, nome('com'));
    const amm = await utente(db, nome('amm'));
    const fuori = await utente(db, nome('fuori'));
    const cl = await db.query<{ id: string }>(
      `insert into magazzini (nome, tipo, proprietario_id, codice_ingresso) values ('Classe','classe',$1,$2) returning id`,
      [doc, 'K' + String(++seq).padStart(5, '2')]);
    const m = cl.rows[0].id;
    await db.query(`insert into membri (magazzino_id, user_id, ruolo) values ($1,$2,'docente')`, [m, doc]);
    for (const [uid, ruolo] of [[mag, 'magazziniere'], [acq, 'acquisti'], [com, 'commerciale'], [amm, 'amministrazione']]) {
      await db.query(`insert into membri (magazzino_id, user_id, ruolo, ruolo_aziendale) values ($1,$2,'studente',$3)`, [m, uid, ruolo]);
    }
    const a = await articolo(m);
    const r = [{ articolo_id: a, qta: 2, prezzo_cent: 100 }];
    const salva = (uid: string, tipo: string) =>
      rpc(db, uid, 'api_documento_salva', { p_magazzino: m, p_documento: { tipo }, p_righe: r });

    await expect(salva(mag, 'carico')).resolves.toBeDefined();
    await expect(salva(mag, 'scarico')).resolves.toBeDefined();
    await expect(salva(mag, 'fattura_vendita')).rejects.toThrow('permesso_negato');
    await expect(salva(mag, 'ordine_fornitore')).rejects.toThrow('permesso_negato');
    await expect(salva(acq, 'ordine_fornitore')).resolves.toBeDefined();
    await expect(salva(acq, 'carico')).rejects.toThrow('permesso_negato');
    await expect(salva(com, 'preventivo')).resolves.toBeDefined();
    await expect(salva(com, 'ordine_cliente')).resolves.toBeDefined();
    await expect(salva(com, 'scarico')).rejects.toThrow('permesso_negato');
    await expect(salva(amm, 'fattura_acquisto')).resolves.toBeDefined();
    await expect(salva(amm, 'preventivo')).rejects.toThrow('permesso_negato');
    await expect(salva(doc, 'reso_cliente')).resolves.toBeDefined();
    await expect(salva(fuori, 'carico')).rejects.toThrow('permesso_negato');

    // evasione dell'ordine fornitore: solo chi ha 'evadi_ordine' (magazziniere), non chi lo ha emesso (acquisti)
    const o = await rpc(db, acq, 'api_documento_salva', { p_magazzino: m, p_documento: { tipo: 'ordine_fornitore' }, p_righe: r });
    await rpc(db, acq, 'api_documento_conferma', { p_id: o.documento.id });
    await expect(rpc(db, acq, 'api_ordine_evadi', { p_id: o.documento.id })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, mag, 'api_ordine_evadi', { p_id: o.documento.id })).resolves.toBeDefined();
    // chi non ha 'spedizione' non cambia stato spedizione; gli altri membri leggono
    const sc = await rpc(db, mag, 'api_documento_salva', { p_magazzino: m, p_documento: { tipo: 'scarico' }, p_righe: r });
    const scC = await rpc(db, mag, 'api_documento_conferma', { p_id: sc.documento.id });
    await expect(rpc(db, com, 'api_spedizione_stato', { p_documento: scC.documento.id, p_stato: 'spedito' })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, com, 'api_documento_leggi', { p_id: scC.documento.id })).resolves.toBeDefined();
    await expect(rpc(db, fuori, 'api_documento_leggi', { p_id: scC.documento.id })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, mag, 'api_trasferimento', { p_magazzino: m, p_articolo: a, p_lotto: null, p_da: null, p_a: null, p_qta: 1 }))
      .rejects.toThrow('dato_non_valido');
    await expect(rpc(db, com, 'api_trasferimento', { p_magazzino: m, p_articolo: a, p_lotto: null, p_da: null, p_a: null, p_qta: 1 }))
      .rejects.toThrow('permesso_negato');
  });
});

describe('scorte', () => {
  test('scorta_bassa notificata una sola volta, risolta quando la giacenza risale', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m, { punto_riordino: 10 });
    const aperte = async () =>
      (await db.query<any>(`select messaggio, risolta_il from notifiche where articolo_id = $1 and tipo = 'scorta_bassa' order by created_at`, [a])).rows;
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 20 }]);
    expect(await aperte()).toHaveLength(0);
    await fai(u, m, 'scarico', [{ articolo_id: a, qta: 12 }]); // 8 <= 10
    let n = await aperte();
    expect(n).toHaveLength(1);
    expect(n[0].risolta_il).toBeNull();
    expect(n[0].messaggio).toMatch(/Scorta bassa/);
    await fai(u, m, 'scarico', [{ articolo_id: a, qta: 3 }]); // ancora sotto: nessuna seconda notifica
    expect(await aperte()).toHaveLength(1);
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 30 }]); // 35 > 10
    n = await aperte();
    expect(n).toHaveLength(1);
    expect(n[0].risolta_il).not.toBeNull();
    await fai(u, m, 'scarico', [{ articolo_id: a, qta: 30 }]); // 5: di nuovo sotto
    n = await aperte();
    expect(n).toHaveLength(2);
    expect(n[1].risolta_il).toBeNull();
  });

  test('un ordine fornitore confermato conta come merce in arrivo: niente notifica', async () => {
    const { u, m } = await nuovoMagazzino();
    const a = await articolo(m, { punto_riordino: 10 });
    await fai(u, m, 'ordine_fornitore', [{ articolo_id: a, qta: 50 }]);
    await fai(u, m, 'carico', [{ articolo_id: a, qta: 5 }]);
    const n = await db.query(`select 1 from notifiche where articolo_id = $1`, [a]);
    expect(n.rowCount).toBe(0);
  });
});
