import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { nuovoDb, rpc, utente } from './helper';

// 0004 fornisce _movimenta (usata solo dalla rettifica d'inventario); i calcoli leggono il registro.
let db: PGlite;
let anna: string;
let mg: string;
let n = 0;

beforeAll(async () => {
  db = await nuovoDb(['0004', '0007']);
  anna = await utente(db, 'anna');
  mg = (await rpc(db, anna, 'api_inizializza')).magazzini[0].id;
});

async function nuovoMagazzino(): Promise<string> {
  const u = await utente(db, `utente${++n}`);
  return (await rpc(db, u, 'api_inizializza')).magazzini[0].id;
}

/** Inserisce un articolo e ritorna il suo id. */
async function articolo(m: string, matricola: string, extra: Record<string, unknown> = {}): Promise<string> {
  const campi = { magazzino_id: m, matricola, descrizione: `Articolo ${matricola}`, ...extra };
  const k = Object.keys(campi);
  const r = await db.query<{ id: string }>(
    `insert into articoli (${k.join(',')}) values (${k.map((_, i) => `$${i + 1}`).join(',')}) returning id`,
    Object.values(campi) as any[],
  );
  return r.rows[0].id;
}

/** Movimento diretto nel registro (qta con segno, costo in centesimi, giorni fa). */
async function mov(m: string, art: string, qta: number, costo: number, causale: string, giorniFa = 0) {
  await db.query(
    `insert into movimenti_stock (magazzino_id, articolo_id, qta, costo_unit_cent, causale, created_at)
     values ($1, $2, $3, $4, $5, now() - make_interval(days => $6))`,
    [m, art, qta, costo, causale, giorniFa],
  );
}

async function giacenza(m: string, art: string, qta: number, ubicazione: string | null = null) {
  await db.query(`insert into giacenze (magazzino_id, articolo_id, ubicazione_id, qta) values ($1, $2, $3, $4)`, [m, art, ubicazione, qta]);
}

describe('valorizzazione', () => {
  test('CMP, FIFO e LIFO a confronto: carico 10@100, carico 10@120, scarico 15', async () => {
    const m = await nuovoMagazzino();
    const a = await articolo(m, 'V1');
    await mov(m, a, 10, 100, 'carico', 10);
    await mov(m, a, 10, 120, 'carico', 9);
    await mov(m, a, -15, 110, 'scarico', 8);
    // un trasferimento non cambia nulla
    await mov(m, a, -2, 110, 'trasferimento_out', 7);
    await mov(m, a, 2, 110, 'trasferimento_in', 7);
    // rimangono 5 pezzi: CMP 110 -> 550; FIFO (restano 5@120) -> 600; LIFO (restano 5@100) -> 500
    await expect(rpc(db, null, 'api_valorizzazione', { p_magazzino: m })).rejects.toThrow('non_autenticato');
    const u = (await db.query<{ proprietario_id: string }>(`select proprietario_id from magazzini where id = $1`, [m])).rows[0].proprietario_id;
    const r = await rpc(db, u, 'api_valorizzazione', { p_magazzino: m });
    expect(r.righe).toHaveLength(1);
    expect(r.righe[0]).toMatchObject({ matricola: 'V1', qta: 5, valore_cmp: 550, valore_fifo: 600, valore_lifo: 500 });
    expect(r.righe[0]).toMatchObject({ diff_fifo_cmp: 50, diff_lifo_cmp: -50, diff_fifo_lifo: 100 });
    expect(r.totali).toMatchObject({ valore_cmp: 550, valore_fifo: 600, valore_lifo: 500, diff_fifo_lifo: 100 });
  });

  test('un non membro non legge', async () => {
    const m = await nuovoMagazzino();
    await expect(rpc(db, anna, 'api_valorizzazione', { p_magazzino: m })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, anna, 'api_kpi', { p_magazzino: m })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, anna, 'api_riordino_suggerimenti', { p_magazzino: m })).rejects.toThrow('permesso_negato');
  });
});

describe('riordino', () => {
  test('punto di riordino consigliato, EOQ, urgenza e ordinamento', async () => {
    const m = await nuovoMagazzino();
    const u = (await db.query<{ proprietario_id: string }>(`select proprietario_id from magazzini where id = $1`, [m])).rows[0].proprietario_id;
    // A: domanda 10/giorno, lead 4, sicurezza 20 -> consigliato 60. EOQ = ceil(sqrt(2*3650*5000/200)) = ceil(427.2) = 428
    const a = await articolo(m, 'A', { domanda_giornaliera: 10, lead_time_giorni: 4, scorta_sicurezza: 20,
                                       costo_ordine_cent: 5000, prezzo_acquisto_cent: 1000, costo_mantenimento_perc: 20 });
    await giacenza(m, a, 30);
    // B: domanda dai movimenti = 60 scarichi negli ultimi 30 giorni / 30 = 2; lead 5, sicurezza 4 -> 14; giacenza 100 -> nessuna
    const b = await articolo(m, 'B', { lead_time_giorni: 5, scorta_sicurezza: 4 });
    await giacenza(m, b, 100);
    await mov(m, b, 160, 50, 'carico', 40);
    await mov(m, b, -30, 50, 'scarico', 10);
    await mov(m, b, -30, 50, 'scarico', 5);
    await mov(m, b, -500, 50, 'scarico', 60); // fuori finestra: non conta
    // C: esaurito, sicurezza 5 -> urgenza alta
    const c = await articolo(m, 'C', { scorta_sicurezza: 5 });
    await giacenza(m, c, 0);
    // D: sotto il punto di riordino impostato ma coperto da un ordine fornitore confermato -> nessuna
    const d = await articolo(m, 'D', { punto_riordino: 10 });
    await giacenza(m, d, 4);
    const doc = await db.query<{ id: string }>(
      `insert into documenti (magazzino_id, tipo, anno, numero, stato) values ($1, 'ordine_fornitore', 2026, 1, 'confermato') returning id`, [m]);
    await db.query(`insert into righe_documento (documento_id, posizione, articolo_id, descrizione, qta) values ($1, 1, $2, 'x', 20)`, [doc.rows[0].id, d]);

    const r = await rpc<any[]>(db, u, 'api_riordino_suggerimenti', { p_magazzino: m });
    expect(r.map((x) => [x.matricola, x.urgenza])).toEqual([['C', 'alta'], ['A', 'media'], ['B', 'nessuna'], ['D', 'nessuna']]);
    const ra = r.find((x) => x.matricola === 'A');
    expect(ra).toMatchObject({ giacenza: 30, punto_riordino_consigliato: 60, eoq: 428, qta_suggerita: 428, punto_riordino: 0 });
    const rb = r.find((x) => x.matricola === 'B');
    expect(rb).toMatchObject({ domanda_giornaliera: 2, punto_riordino_consigliato: 14, qta_suggerita: 0 });
    expect(r.find((x) => x.matricola === 'D')).toMatchObject({ ordinato: 20 });
    expect(r.find((x) => x.matricola === 'C')).toMatchObject({ qta_suggerita: 5 });
  });
});

describe('kpi', () => {
  test('valore, rotazione, copertura, sottoscorta, ABC a tre classi, fermi', async () => {
    const m = await nuovoMagazzino();
    const u = (await db.query<{ proprietario_id: string }>(`select proprietario_id from magazzini where id = $1`, [m])).rows[0].proprietario_id;
    // consumi del periodo (30 giorni): X1 800, X2 150, X3 50 (costo 10 al pezzo)
    const x1 = await articolo(m, 'X1', { punto_riordino: 10 });
    const x2 = await articolo(m, 'X2');
    const x3 = await articolo(m, 'X3', { punto_riordino: 20 }); // giacenza 15 <= 20: sottoscorta
    for (const [a, c, s, g] of [[x1, 100, 80, 20], [x2, 50, 15, 35], [x3, 20, 5, 15]] as const) {
      await mov(m, a, c, 10, 'carico', 90);
      await mov(m, a, -s, 10, 'scarico', 5);
      await giacenza(m, a, g);
    }
    // fermo: l'ultimo scarico e' di 60 giorni fa
    const dd = await articolo(m, 'D');
    await mov(m, dd, 10, 100, 'carico', 90);
    await mov(m, dd, -2, 100, 'scarico', 60);
    await giacenza(m, dd, 8);

    const k = await rpc(db, u, 'api_kpi', { p_magazzino: m, p_giorni: 30 });
    // valore fine: 200+350+150+800 = 1500; inizio (30 giorni fa): 1000+500+200+800 = 2500; media 2000; venduto 1000
    expect(k).toMatchObject({ giorni: 30, valore_giacenza: 1500, costo_venduto: 1000, rotazione: 0.5, copertura_giorni: 45, sottoscorta: 1 });
    expect(k.abc.map((x: any) => [x.articolo, x.classe, x.valore, x.perc_cum])).toEqual([
      ['X1', 'A', 800, 80], ['X2', 'B', 150, 95], ['X3', 'C', 50, 100],
    ]);
    expect(k.fermi.map((x: any) => [x.matricola, x.giacenza, x.valore])).toEqual([['D', 8, 800]]);
    // su 90 giorni D ha avuto uno scarico: non e' piu' fermo
    const k90 = await rpc(db, u, 'api_kpi', { p_magazzino: m, p_giorni: 90 });
    expect(k90.fermi).toEqual([]);
    await expect(rpc(db, u, 'api_kpi', { p_magazzino: m, p_giorni: 0 })).rejects.toThrow('dato_non_valido');
  });
});

describe('inventario', () => {
  test('apri, conta (fisico fittizio), rettifica fino alla quantita reale, chiudi', async () => {
    const m = await nuovoMagazzino();
    const u = (await db.query<{ proprietario_id: string }>(`select proprietario_id from magazzini where id = $1`, [m])).rows[0].proprietario_id;
    const ub = (await db.query<{ id: string }>(`insert into ubicazioni (magazzino_id, codice) values ($1, 'A-01') returning id`, [m])).rows[0].id;
    const a = await articolo(m, 'I1', { prezzo_acquisto_cent: 100 });
    const b = await articolo(m, 'I2');
    // giacenze coerenti col registro
    await mov(m, a, 10, 100, 'apertura', 5);
    await mov(m, b, 5, 200, 'apertura', 5);
    await giacenza(m, a, 10, ub);
    await giacenza(m, b, 5, ub);
    // fisico fittizio dello scenario: di I1 ce ne sono 7, di I2 nessun dato
    const sc = (await db.query<{ id: string }>(`insert into scenari (magazzino_id, nome) values ($1, 's') returning id`, [m])).rows[0].id;
    await db.query(`insert into scenario_fisico (scenario_id, articolo_id, ubicazione_id, qta_reale) values ($1, $2, $3, 7)`, [sc, a, ub]);

    await expect(rpc(db, u, 'api_inventario_apri', { p_magazzino: m, p_nome: ' ' })).rejects.toThrow('dato_non_valido');
    const inv = await rpc(db, u, 'api_inventario_apri', { p_magazzino: m, p_nome: 'Fine anno' });
    expect(inv).toMatchObject({ stato: 'aperto', righe: 2 });
    let el = await rpc<any[]>(db, u, 'api_inventari_elenco', { p_magazzino: m });
    const ri1 = el[0].righe.find((x: any) => x.matricola === 'I1').id;
    const ri2 = el[0].righe.find((x: any) => x.matricola === 'I2').id;

    // senza qta e senza fisico fittizio: serve p_qta
    await expect(rpc(db, u, 'api_inventario_conta', { p_riga: ri2 })).rejects.toThrow('dato_non_valido');
    // chiudere con righe non contate non si puo'
    await expect(rpc(db, u, 'api_inventario_chiudi', { p_inventario: inv.id })).rejects.toThrow('stato_non_valido');
    // rettificare una riga non contata no
    await expect(rpc(db, u, 'api_inventario_rettifica', { p_riga: ri1, p_causale: 'smarrito' })).rejects.toThrow('stato_non_valido');

    const c1 = await rpc(db, u, 'api_inventario_conta', { p_riga: ri1 });
    expect(c1).toMatchObject({ qta_sistema: 10, qta_contata: 7, differenza: -3, rivelata: true });
    const c2 = await rpc(db, u, 'api_inventario_conta', { p_riga: ri2, p_qta: 6 });
    expect(c2).toMatchObject({ qta_contata: 6, differenza: 1, rivelata: false });

    // la causale e' obbligatoria
    await expect(rpc(db, u, 'api_inventario_rettifica', { p_riga: ri1, p_causale: null })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, u, 'api_inventario_rettifica', { p_riga: ri1, p_causale: 'boh' })).rejects.toThrow('dato_non_valido');
    const rt = await rpc(db, u, 'api_inventario_rettifica', { p_riga: ri1, p_causale: 'smarrito' });
    expect(rt).toMatchObject({ differenza: -3, movimento: true });
    const g = await db.query<{ q: string }>(`select sum(qta) as q from giacenze where articolo_id = $1`, [a]);
    expect(Number(g.rows[0].q)).toBe(7);
    const mv = await db.query<any>(`select qta, causale from movimenti_stock where articolo_id = $1 and causale = 'rettifica'`, [a]);
    expect(mv.rows.map((x) => [Number(x.qta), x.causale])).toEqual([[-3, 'rettifica']]);
    // una riga rettificata non si rettifica due volte
    await expect(rpc(db, u, 'api_inventario_rettifica', { p_riga: ri1, p_causale: 'smarrito' })).rejects.toThrow('stato_non_valido');

    // I2 resta con differenza +1 non rettificata: la chiusura la segnala
    const ch = await rpc(db, u, 'api_inventario_chiudi', { p_inventario: inv.id });
    expect(ch).toMatchObject({ stato: 'chiuso', righe: 2, rettificate: 1 });
    expect(ch.non_rettificate).toHaveLength(1);
    expect(ch.non_rettificate[0]).toMatchObject({ matricola: 'I2', differenza: 1 });
    await expect(rpc(db, u, 'api_inventario_chiudi', { p_inventario: inv.id })).rejects.toThrow('stato_non_valido');

    el = await rpc(db, u, 'api_inventari_elenco', { p_magazzino: m });
    expect(el[0]).toMatchObject({ stato: 'chiuso', n_righe: 2, n_contate: 2, n_rettificate: 1 });
    expect(el[0].righe.find((x: any) => x.matricola === 'I1')).toMatchObject({ rettificata: true, causale: 'smarrito', ubicazione: 'A-01' });
  });

  test('differenza zero: nessun movimento; permessi per ruolo aziendale', async () => {
    const m = await nuovoMagazzino();
    const u = (await db.query<{ proprietario_id: string }>(`select proprietario_id from magazzini where id = $1`, [m])).rows[0].proprietario_id;
    const a = await articolo(m, 'Z1');
    await mov(m, a, 4, 100, 'apertura', 1);
    await giacenza(m, a, 4);
    const inv = await rpc(db, u, 'api_inventario_apri', { p_magazzino: m, p_nome: 'Z' });
    const riga = (await rpc<any[]>(db, u, 'api_inventari_elenco', { p_magazzino: m }))[0].righe[0].id;
    await rpc(db, u, 'api_inventario_conta', { p_riga: riga, p_qta: 4 });
    const rt = await rpc(db, u, 'api_inventario_rettifica', { p_riga: riga, p_causale: 'conteggio' });
    expect(rt).toMatchObject({ differenza: 0, movimento: false });
    const mv = await db.query(`select 1 from movimenti_stock where articolo_id = $1 and causale = 'rettifica'`, [a]);
    expect(mv.rows).toHaveLength(0);
    const ch = await rpc(db, u, 'api_inventario_chiudi', { p_inventario: inv.id });
    expect(ch.non_rettificate).toEqual([]);

    // in una classe un utente "acquisti" non puo' aprire inventari, ma li legge
    const doc = await utente(db, 'prof', 'docente');
    const cl = (await db.query<{ id: string }>(
      `insert into magazzini (nome, tipo, proprietario_id, codice_ingresso) values ('3A', 'classe', $1, 'ABC234') returning id`, [doc])).rows[0].id;
    const acq = await utente(db, 'acq');
    await db.query(`insert into membri (magazzino_id, user_id, ruolo) values ($1, $2, 'docente')`, [cl, doc]);
    await db.query(`insert into membri (magazzino_id, user_id, ruolo, ruolo_aziendale) values ($1, $2, 'studente', 'acquisti')`, [cl, acq]);
    await expect(rpc(db, acq, 'api_inventario_apri', { p_magazzino: cl, p_nome: 'x' })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, acq, 'api_inventari_elenco', { p_magazzino: cl })).resolves.toEqual([]);
    await expect(rpc(db, doc, 'api_inventario_apri', { p_magazzino: cl, p_nome: 'x' })).resolves.toMatchObject({ stato: 'aperto' });
  });
});
