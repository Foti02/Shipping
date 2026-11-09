import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { nuovoDb, rpc, utente } from './helper';

// Classe di 6 studenti: st01,st02 magazzinieri, st03 acquisti, st04 commerciale, st05 amministrazione, st06 jolly.
const RUOLI = ['magazziniere', 'magazziniere', 'acquisti', 'commerciale', 'amministrazione', null] as (string | null)[];
const CONFIG = { seed: 7, n_articoli: 12, sottoscorta_forzata: true, con_inventario: true };

interface Classe { m: string; doc: string; st: Record<string, string>; }

async function classe(db: PGlite, ruoli: (string | null)[], tag: string): Promise<Classe> {
  const doc = await utente(db, `doc${tag}`, 'docente');
  const m = (await db.query<{ id: string }>(
    `insert into magazzini (nome, tipo, proprietario_id) values ('Classe', 'classe', $1) returning id`, [doc])).rows[0].id;
  await db.query<any>(`insert into membri (magazzino_id, user_id, ruolo) values ($1, $2, 'docente')`, [m, doc]);
  const st: Record<string, string> = {};
  for (let i = 0; i < ruoli.length; i++) {
    const nome = `st${String(i + 1).padStart(2, '0')}${tag}`;
    st[nome] = await utente(db, nome);
    await db.query<any>(`insert into membri (magazzino_id, user_id, ruolo, ruolo_aziendale) values ($1, $2, 'studente', $3)`, [m, st[nome], ruoli[i]]);
  }
  return { m, doc, st };
}
/** username senza il tag finale: st01..st06 */
const U = (c: Classe, n: number) => Object.values(c.st)[n - 1];

/** Impronta del contenuto di uno scenario: uguale tra due database = stessa generazione. */
async function firma(db: PGlite, m: string): Promise<string[]> {
  const r = await db.query<{ f: string }>(
    `select regexp_replace(p.username, '[a-z]+$', '') || '|' || c.tipo || '|' || coalesce(a.matricola, '') || '|' || coalesce(an.codice, '')
            || '|' || coalesce(c.qta::text, '') || '|' || c.stato as f
       from compiti c left join profili p on p.user_id = c.assegnato_a
       left join articoli a on a.id = c.articolo_id left join anagrafiche an on an.id = c.anagrafica_id
      where c.magazzino_id = $1 order by 1`, [m]);
  return r.rows.map((x) => x.f);
}

let db: PGlite;
let c: Classe;
let sid: string;
beforeAll(async () => {
  db = await nuovoDb(['0004', '0006']);
  c = await classe(db, RUOLI, 'a');
}, 60_000);

const miei = (u: string) => rpc<any[]>(db, u, 'api_compiti_miei', { p_magazzino: c.m });
const tutti = () => rpc<any[]>(db, c.doc, 'api_compiti_tutti', { p_scenario: sid });
async function fai(u: string, tipo: string, righe: any[], extra: Record<string, unknown> = {}) {
  const b = await rpc(db, u, 'api_documento_salva', { p_magazzino: c.m, p_documento: { tipo, ...extra }, p_righe: righe });
  return rpc(db, u, 'api_documento_conferma', { p_id: b.documento.id });
}
const trova = async (u: string, tipo: string) => (await miei(u)).find((t) => t.tipo === tipo)!;

describe('generazione', () => {
  test('crea catalogo, anagrafiche, giacenze con apertura e compiti; scenario in bozza', async () => {
    const r = await rpc(db, c.doc, 'api_scenario_genera', { p_magazzino: c.m, p_nome: 'Scenario 1', p_config: CONFIG });
    sid = r.scenario_id;
    expect(r.stato).toBe('bozza');
    expect(r.n_studenti).toBe(6);
    expect(r.n_articoli).toBeGreaterThanOrEqual(12); // max(config, 2 x studenti + merci speciali)
    const art = await db.query<any>(`select * from articoli where scenario_id = $1`, [sid]);
    expect(art.rows).toHaveLength(r.n_articoli);
    for (const a of art.rows) {
      expect(Number(a.punto_riordino)).toBeGreaterThan(Number(a.scorta_sicurezza));
      expect(Number(a.scorta_sicurezza)).toBeGreaterThan(0);
    }
    expect((await db.query<any>(`select count(*)::int n from anagrafiche where magazzino_id = $1 and tipo = 'cliente'`, [c.m])).rows[0].n).toBeGreaterThan(5);
    expect((await db.query<any>(`select count(*)::int n from ubicazioni where magazzino_id = $1`, [c.m])).rows[0].n).toBe(12);
    // ogni articolo: movimento di apertura = giacenza (prima di eventuali documenti preesistenti)
    const ap = await db.query<any>(`select count(*)::int n from movimenti_stock where magazzino_id = $1 and causale = 'apertura'`, [c.m]);
    expect(ap.rows[0].n).toBe(r.n_articoli);
    const sc = (await db.query<any>(`select stato, seed from scenari where id = $1`, [sid])).rows[0];
    expect(sc).toEqual({ stato: 'bozza', seed: 7 });
  });

  test('nessun compito identico e ogni studente ne ha di suoi', async () => {
    const dup = await db.query<any>(
      `select tipo, articolo_id, anagrafica_id, qta, count(*) from compiti where scenario_id = $1
        group by 1, 2, 3, 4 having count(*) > 1`, [sid]);
    expect(dup.rows).toHaveLength(0);
    // compiti per studente su merci diverse: nessuna merce condivisa tranne quelle della sottoscorta
    const cond = await db.query<any>(
      `select a.matricola, count(distinct c.assegnato_a)::int n from compiti c join articoli a on a.id = c.articolo_id
        where c.scenario_id = $1 and c.assegnato_a is not null group by 1 having count(distinct c.assegnato_a) > 1`, [sid]);
    for (const r of cond.rows) expect(r.n).toBeLessThanOrEqual(3);
    for (let i = 1; i <= 6; i++) expect((await db.query<any>(`select 1 from compiti where assegnato_a = $1`, [U(c, i)])).rows.length).toBeGreaterThan(0);
  });

  test('i compiti rispettano il ruolo aziendale', async () => {
    const ammessi: Record<string, string[]> = {
      magazziniere: ['carico', 'scarico', 'trasferimento', 'inventario'],
      acquisti: ['ordine_fornitore', 'evadi_ordine', 'riordino'],
      commerciale: ['preventivo', 'ordine_cliente'],
      amministrazione: ['fattura_vendita', 'fattura_acquisto'],
    };
    const r = await db.query<{ tipo: string; ruolo: string | null }>(
      `select c.tipo, m.ruolo_aziendale ruolo from compiti c join membri m on m.user_id = c.assegnato_a and m.magazzino_id = c.magazzino_id
        where c.scenario_id = $1`, [sid]);
    expect(r.rows.length).toBeGreaterThan(15);
    for (const x of r.rows) if (x.ruolo) expect(ammessi[x.ruolo]).toContain(x.tipo);
    // il jolly riceve un mix di tipi
    const jolly = await db.query<any>(`select distinct tipo from compiti where assegnato_a = $1`, [U(c, 6)]);
    expect(jolly.rows.length).toBeGreaterThanOrEqual(4);
  });

  test('sottoscorta: scarichi a studenti, clienti e quantita diversi; l ultimo e impossibile senza riordino', async () => {
    const pool = await db.query<{ articolo_id: string }>(
      `select articolo_id from compiti where scenario_id = $1 and tipo = 'scarico' group by 1 having count(*) = 3`, [sid]);
    expect(pool.rows.length).toBeGreaterThanOrEqual(1);
    for (const { articolo_id } of pool.rows) {
      const art = (await db.query<any>(`select punto_riordino r from articoli where id = $1`, [articolo_id])).rows[0];
      const g = Number((await db.query<any>(`select sum(qta) g from giacenze where articolo_id = $1`, [articolo_id])).rows[0].g);
      const t = (await db.query<any>(`select assegnato_a, anagrafica_id, qta::float q, stato, motivo from compiti
                                  where articolo_id = $1 and tipo = 'scarico' order by ordine`, [articolo_id])).rows;
      expect(new Set(t.map((x) => x.assegnato_a)).size).toBe(3);
      expect(new Set(t.map((x) => x.anagrafica_id)).size).toBe(3);
      expect(new Set(t.map((x) => x.q)).size).toBe(3);
      const resto = g - t[0].q - t[1].q;
      expect(resto).toBeGreaterThanOrEqual(0);
      expect(resto).toBeLessThan(Number(art.r)); // la somma dei primi due porta sotto il punto di riordino
      expect(g).toBeGreaterThan(Number(art.r));
      expect(t[2].q).toBeGreaterThan(resto);
      expect(t[2].stato).toBe('bloccato');
      expect(t[2].motivo).toBe('scorta insufficiente');
      expect([t[0].stato, t[1].stato]).toEqual(['da_fare', 'da_fare']);
    }
  });

  test('inventario: quantita reale diversa dal sistema e compiti inventario', async () => {
    const f = await db.query<any>(
      `select f.qta_reale::float reale, (select sum(qta) from giacenze g where g.articolo_id = f.articolo_id)::float sis
         from scenario_fisico f where f.scenario_id = $1`, [sid]);
    expect(f.rows.length).toBe(3); // st01, st02 e il jolly st06
    for (const x of f.rows) expect(x.reale).not.toBe(x.sis);
    const n = await db.query<any>(`select count(*)::int n from compiti where scenario_id = $1 and tipo = 'inventario'`, [sid]);
    expect(n.rows[0].n).toBe(3);
  });

  test('stesso seed = stessi compiti, seed diverso = compiti diversi', async () => {
    const db2 = await nuovoDb(['0004', '0006']);
    const c2 = await classe(db2, RUOLI, 'a');
    await rpc(db2, c2.doc, 'api_scenario_genera', { p_magazzino: c2.m, p_nome: 'Altro', p_config: CONFIG });
    const c3 = await classe(db2, RUOLI, 'b');
    await rpc(db2, c3.doc, 'api_scenario_genera', { p_magazzino: c3.m, p_nome: 'Altro', p_config: { ...CONFIG, seed: 8 } });
    const f1 = await firma(db, c.m);
    expect(f1.length).toBeGreaterThan(15);
    expect(await firma(db2, c2.m)).toEqual(f1);
    expect(await firma(db2, c3.m)).not.toEqual(f1);
    // le merci dello scenario ricalcano lo stesso catalogo
    const d = (db: PGlite, m: string) => db.query<any>(`select matricola, descrizione, prezzo_acquisto_cent from articoli where magazzino_id = $1 order by 1`, [m]);
    expect((await d(db2, c2.m)).rows).toEqual((await d(db, c.m)).rows);
  }, 60_000);

  test('permessi e dati non validi', async () => {
    const studente = U(c, 1);
    await expect(rpc(db, studente, 'api_scenario_genera', { p_magazzino: c.m, p_nome: 'X', p_config: {} })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, studente, 'api_scenario_stato', { p_scenario: sid, p_stato: 'attivo' })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, studente, 'api_scenario_controlla', { p_scenario: sid })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, studente, 'api_compiti_tutti', { p_scenario: sid })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, c.doc, 'api_scenario_stato', { p_scenario: sid, p_stato: 'bozza' })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, c.doc, 'api_scenario_genera', { p_magazzino: c.m, p_nome: '  ', p_config: {} })).rejects.toThrow('dato_non_valido');
    const vuota = await classe(db, [], 'v');
    await expect(rpc(db, vuota.doc, 'api_scenario_genera', { p_magazzino: vuota.m, p_nome: 'X', p_config: {} })).rejects.toThrow('dato_non_valido');
  });

  test('un secondo scenario nella stessa classe usa matricole e codici nuovi', async () => {
    const c2 = await classe(db, ['magazziniere', 'acquisti'], 'c');
    const a = await rpc(db, c2.doc, 'api_scenario_genera', { p_magazzino: c2.m, p_nome: 'Uno', p_config: { seed: 1 } });
    const b = await rpc(db, c2.doc, 'api_scenario_genera', { p_magazzino: c2.m, p_nome: 'Due', p_config: { seed: 1 } });
    expect(a.scenario_id).not.toBe(b.scenario_id);
    const m = await db.query<any>(`select distinct left(matricola, 3) p from articoli where magazzino_id = $1 order by 1`, [c2.m]);
    expect(m.rows.map((x) => x.p)).toEqual(['S1-', 'S2-']);
  });
});

describe('compiti, riassegnazione', () => {
  test('api_compiti_miei: vuoto finche lo scenario e in bozza, poi solo i miei, ordinati e in chiaro', async () => {
    expect(await miei(U(c, 4))).toEqual([]);
    expect(await rpc(db, c.doc, 'api_scenario_stato', { p_scenario: sid, p_stato: 'attivo' })).toEqual({ id: sid, stato: 'attivo' });
    const m = await miei(U(c, 4));
    expect(m.map((t) => t.tipo)).toEqual(['preventivo', 'ordine_cliente']);
    expect(m[0].articolo_matricola).toMatch(/^S1-\d{3}$/);
    expect(m[0].controparte).toBeTruthy();
    expect(m[0].controparte_tipo).toBe('cliente');
    expect(m.every((t) => t.stato === 'da_fare')).toBe(true);
    const altro = await utente(db, 'estraneo');
    await expect(rpc(db, altro, 'api_compiti_miei', { p_magazzino: c.m })).rejects.toThrow('permesso_negato');
  });

  test('api_compiti_tutti elenca tutto con username; riassegna e libera', async () => {
    const t = await tutti();
    expect(t.length).toBeGreaterThan(15);
    const x = t.find((k) => k.tipo === 'preventivo' && k.username?.startsWith('st04'))!;
    expect(x.controparte).toBeTruthy();
    const r = await rpc(db, c.doc, 'api_scenario_riassegna', { p_compito: x.id, p_user: U(c, 6) });
    expect(r.assegnato_a).toBe(U(c, 6));
    expect((await miei(U(c, 6))).some((k) => k.id === x.id)).toBe(true);
    expect((await rpc(db, c.doc, 'api_scenario_riassegna', { p_compito: x.id, p_user: null })).assegnato_a).toBeNull();
    await expect(rpc(db, c.doc, 'api_scenario_riassegna', { p_compito: x.id, p_user: c.doc })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, U(c, 1), 'api_scenario_riassegna', { p_compito: x.id, p_user: U(c, 4) })).rejects.toThrow('permesso_negato');
    await rpc(db, c.doc, 'api_scenario_riassegna', { p_compito: x.id, p_user: U(c, 4) }); // ripristino
  });
});

describe('controllo automatico degli errori', () => {
  test('documento sbagliato -> errore con esito; corretto e riconfermato -> completato', async () => {
    const u = U(c, 4);
    const t = await trova(u, 'preventivo');
    const altroCliente = (await db.query<{ id: string }>(
      `select id from anagrafiche where magazzino_id = $1 and tipo = 'cliente' and id <> $2 limit 1`, [c.m, t.controparte_id])).rows[0].id;

    await fai(u, 'preventivo', [{ articolo_id: t.articolo_id, qta: Number(t.qta) + 1 }], { anagrafica_id: altroCliente });
    const e = await trova(u, 'preventivo');
    expect(e.stato).toBe('errore');
    expect(e.esito.errori.map((x: any) => x.campo).sort()).toEqual(['controparte', 'quantita']);
    const qta = e.esito.errori.find((x: any) => x.campo === 'quantita');
    expect([qta.atteso, qta.trovato]).toEqual([Number(t.qta), Number(t.qta) + 1]);
    expect((await rpc(db, c.doc, 'api_scenario_controlla', { p_scenario: sid })).compiti_in_errore).toHaveLength(1);

    // un documento su un'altra merce non c'entra col compito
    const altra = (await miei(u)).find((k) => k.tipo === 'ordine_cliente')!;
    await fai(u, 'preventivo', [{ articolo_id: altra.articolo_id, qta: 1 }], { anagrafica_id: altroCliente });
    expect((await trova(u, 'preventivo')).stato).toBe('errore');
    expect((await miei(u)).find((k) => k.tipo === 'ordine_cliente')!.stato).toBe('da_fare');

    await fai(u, 'preventivo', [{ articolo_id: t.articolo_id, qta: Number(t.qta) }], { anagrafica_id: t.controparte_id });
    const ok = await trova(u, 'preventivo');
    expect(ok.stato).toBe('completato');
    expect(ok.documento_id).toBeTruthy();
    expect(ok.completato_il).toBeTruthy();
    expect((await rpc(db, c.doc, 'api_scenario_controlla', { p_scenario: sid })).compiti_in_errore).toHaveLength(0);
  });

  test('evadi ordine fornitore (acquisti) e fattura del DDT (amministrazione)', async () => {
    const ev = await trova(U(c, 3), 'evadi_ordine');
    await rpc(db, U(c, 3), 'api_ordine_evadi', { p_id: ev.parametri.ordine_id });
    expect((await trova(U(c, 3), 'evadi_ordine')).stato).toBe('completato');

    const fv = await trova(U(c, 5), 'fattura_vendita');
    const ctl0 = await rpc(db, c.doc, 'api_scenario_controlla', { p_scenario: sid });
    expect(ctl0.ddt_senza_fattura.length).toBeGreaterThanOrEqual(1);
    const b = await rpc(db, U(c, 5), 'api_documento_genera', { p_origine: fv.parametri.ddt_id, p_tipo: 'fattura_vendita' });
    expect((await trova(U(c, 5), 'fattura_vendita')).stato).toBe('da_fare'); // bozza: ancora niente
    await rpc(db, U(c, 5), 'api_documento_conferma', { p_id: b.documento.id });
    expect((await trova(U(c, 5), 'fattura_vendita')).stato).toBe('completato');
    const ctl = await rpc(db, c.doc, 'api_scenario_controlla', { p_scenario: sid });
    expect(ctl.ddt_senza_fattura.length).toBe(ctl0.ddt_senza_fattura.length - 1);
    expect(ctl.fatture_senza_ddt).toEqual([]);
    expect(ctl.giacenze_negative).toEqual([]);
    expect(ctl.spedizioni_ferme).toEqual([]);
    expect(ctl.totale).toBe(ctl.ordini_non_evasi.length + ctl.ddt_senza_fattura.length);
  });

  test('spedizione ferma e fattura senza DDT vengono segnalate', async () => {
    const u = U(c, 5);
    const art = (await trova(u, 'fattura_acquisto')).articolo_id;
    await fai(u, 'fattura_acquisto', [{ articolo_id: art, qta: 1 }]); // libera, senza carico d'origine
    const ddt = (await db.query<{ id: string }>(
      `select id from documenti where magazzino_id = $1 and tipo = 'scarico' and stato in ('confermato', 'evaso') limit 1`, [c.m])).rows[0].id;
    await db.query<any>(`alter table documenti disable trigger tocca_updated_at`);
    await db.query<any>(`update documenti set stato_spedizione = 'da_preparare', updated_at = now() - interval '2 hours' where id = $1`, [ddt]);
    await db.query<any>(`alter table documenti enable trigger tocca_updated_at`);
    const ctl = await rpc(db, c.doc, 'api_scenario_controlla', { p_scenario: sid });
    expect(ctl.fatture_senza_ddt).toHaveLength(1);
    expect(ctl.spedizioni_ferme.map((x: any) => x.documento_id)).toEqual([ddt]);
    // una fattura senza carico non completa il compito (la controparte e' sbagliata: errore, non completato)
    expect((await trova(u, 'fattura_acquisto')).stato).toBe('errore');
  });

  test('trasferimento e inventario completano i compiti tramite le funzioni interne', async () => {
    const u = U(c, 1);
    const tr = await trova(u, 'trasferimento');
    await rpc(db, u, 'api_trasferimento', {
      p_magazzino: c.m, p_articolo: tr.articolo_id, p_lotto: null,
      p_da: tr.parametri.da_ubicazione_id, p_a: tr.parametri.a_ubicazione_id, p_qta: tr.qta,
    });
    await db.query<any>(`select _valuta_trasferimento($1, $2, $3)`, [c.m, tr.articolo_id, tr.qta]);
    expect((await trova(u, 'trasferimento')).stato).toBe('completato');

    const inv = await trova(u, 'inventario');
    await db.query<any>(`select _valuta_inventario($1, $2)`, [c.m, inv.articolo_id]);
    expect((await trova(u, 'inventario')).stato).toBe('errore'); // sistema ancora diverso dal fisico
    const reale = (await db.query<any>(`select qta_reale from scenario_fisico where articolo_id = $1`, [inv.articolo_id])).rows[0].qta_reale;
    await db.query<any>(`update giacenze set qta = $2 where articolo_id = $1`, [inv.articolo_id, reale]);
    await db.query<any>(`select _valuta_inventario($1, $2)`, [c.m, inv.articolo_id]);
    expect((await trova(u, 'inventario')).stato).toBe('completato');
  });
});

describe('sottoscorta condivisa: scarichi -> riordino -> carico -> sblocco', () => {
  test('flusso completo', async () => {
    const t0 = await tutti();
    const conta: Record<string, number> = {};
    for (const t of t0) if (t.tipo === 'scarico') conta[t.articolo_matricola] = (conta[t.articolo_matricola] ?? 0) + 1;
    const matr = Object.keys(conta).filter((k) => conta[k] === 3).sort()[0];
    const tt = t0.filter((t) => t.tipo === 'scarico' && t.articolo_matricola === matr);
    const bloccato = tt.find((t) => t.stato === 'bloccato')!;
    const normali = tt.filter((t) => t.stato === 'da_fare');
    expect(normali).toHaveLength(2);
    const art = (await db.query<{ id: string; r: string }>(
      `select id, punto_riordino r from articoli where magazzino_id = $1 and matricola = $2`, [c.m, matr])).rows[0];
    const mio = async (t: any) => (await miei(c.st[t.username])).find((k) => k.id === t.id)!;
    const scarica = async (t: any) => {
      const k = await mio(t);
      return fai(c.st[t.username], 'scarico', [{ articolo_id: k.articolo_id, qta: Number(k.qta) }], { anagrafica_id: k.controparte_id });
    };

    // primo scarico: ancora sopra il punto di riordino, niente notifiche
    await scarica(normali[0]);
    expect((await db.query<any>(`select 1 from notifiche where articolo_id = $1`, [art.id])).rows).toHaveLength(0);
    expect((await mio(normali[0])).stato).toBe('completato');
    expect((await mio(bloccato)).stato).toBe('bloccato'); // altre conferme non lo sbloccano

    // secondo scarico: sotto il punto -> notifica scorta bassa, compito di riordino, notifica compito
    await scarica(normali[1]);
    const nt = await db.query<any>(`select tipo from notifiche where articolo_id = $1 and risolta_il is null order by tipo`, [art.id]);
    expect(nt.rows.map((x) => x.tipo)).toEqual(['compito', 'scorta_bassa']);
    const rio = (await tutti()).filter((t) => t.tipo === 'riordino');
    expect(rio).toHaveLength(1);
    expect(rio[0].origine).toBe('dinamico');
    expect(rio[0].username).toBe(Object.keys(c.st)[2]); // l'unico studente acquisti
    expect(rio[0].stato).toBe('da_fare');

    // lo scarico successivo, senza riordino, e' impossibile
    await expect(scarica(bloccato)).rejects.toThrow('giacenza_insufficiente');
    expect((await mio(bloccato)).stato).toBe('bloccato');

    // l'acquisti emette l'ordine (compare tra i suoi compiti) e lo evade: carico confermato
    const acq = U(c, 3);
    const r = (await miei(acq)).find((k) => k.tipo === 'riordino')!;
    expect(Number(r.qta)).toBeGreaterThan(0);
    const ord = await fai(acq, 'ordine_fornitore', [{ articolo_id: r.articolo_id, qta: Number(r.qta) }], { anagrafica_id: r.controparte_id });
    expect((await mio(bloccato)).stato).toBe('bloccato'); // ordinato ma non ancora arrivato
    await rpc(db, acq, 'api_ordine_evadi', { p_id: ord.documento.id });

    // la giacenza risale: il riordino risulta completato, la notifica risolta, lo scarico bloccato torna da fare
    expect((await miei(acq)).find((k) => k.tipo === 'riordino')!.stato).toBe('completato');
    expect((await db.query<any>(`select 1 from notifiche where articolo_id = $1 and risolta_il is null`, [art.id])).rows).toHaveLength(0);
    const sb = await mio(bloccato);
    expect(sb.stato).toBe('da_fare');
    expect(sb.motivo).toBeNull();

    // e ora lo studente puo' completarlo
    await scarica(bloccato);
    expect((await mio(bloccato)).stato).toBe('completato');
  });

  test('senza studenti acquisti il riordino dinamico e libero', async () => {
    const c2 = await classe(db, ['magazziniere', 'magazziniere', 'commerciale'], 'z');
    const g = await rpc(db, c2.doc, 'api_scenario_genera', { p_magazzino: c2.m, p_nome: 'S', p_config: { seed: 3, sottoscorta_forzata: true } });
    await rpc(db, c2.doc, 'api_scenario_stato', { p_scenario: g.scenario_id, p_stato: 'attivo' });
    const art = (await db.query<{ id: string }>(
      `select articolo_id id from compiti where scenario_id = $1 and tipo = 'scarico' group by 1 having count(*) = 3 limit 1`, [g.scenario_id])).rows[0].id;
    const mag = (await db.query<any>(`select user_id, ruolo_aziendale from membri where magazzino_id = $1 and ruolo = 'studente'`, [c2.m])).rows;
    // abbassa direttamente la giacenza sotto il punto di riordino con uno scarico del docente
    const k = (await db.query<any>(`select anagrafica_id cli, qta::float q from compiti where articolo_id = $1 and tipo = 'scarico' order by ordine limit 2`, [art])).rows;
    const tot = k[0].q + k[1].q;
    const b = await rpc(db, c2.doc, 'api_documento_salva', { p_magazzino: c2.m, p_documento: { tipo: 'scarico', anagrafica_id: k[0].cli }, p_righe: [{ articolo_id: art, qta: tot }] });
    await rpc(db, c2.doc, 'api_documento_conferma', { p_id: b.documento.id });
    const r = (await db.query<any>(`select assegnato_a, stato, origine, qta::float q from compiti where scenario_id = $1 and tipo = 'riordino'`, [g.scenario_id])).rows;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ assegnato_a: null, stato: 'da_fare', origine: 'dinamico' });
    expect(mag).toHaveLength(3);
  });
});
