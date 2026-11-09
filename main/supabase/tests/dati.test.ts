import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { nuovoDb, rpc, utente } from './helper';

let db: PGlite;
let doc: string, anna: string, bruno: string, mario: string, gina: string, luca: string;
let mAnna: string, mBruno: string, classe: string;

const q = async <T = any>(sql: string, args: unknown[] = []) => (await db.query<T>(sql, args)).rows;

async function personale(uid: string): Promise<string> {
  const r = await rpc(db, uid, 'api_inizializza');
  return r.magazzini[0].id;
}

async function nuovoArticolo(mg: string, matricola: string, extra: Record<string, unknown> = {}) {
  return (await q<{ id: string }>(
    `insert into articoli (magazzino_id, matricola, descrizione, punto_riordino) values ($1, $2, $3, $4) returning id`,
    [mg, matricola, `Articolo ${matricola}`, extra.punto_riordino ?? 0],
  ))[0].id;
}

async function doc_(mg: string, tipo: string, stato: string, numero: number, righe: [string, number][]) {
  const d = (await q<{ id: string }>(
    `insert into documenti (magazzino_id, tipo, anno, numero, stato) values ($1, $2, 2026, $3, $4) returning id`,
    [mg, tipo, numero, stato],
  ))[0].id;
  let pos = 1;
  for (const [art, qta] of righe) {
    await q(`insert into righe_documento (documento_id, posizione, articolo_id, descrizione, qta) values ($1, $2, $3, 'riga', $4)`, [d, pos++, art, qta]);
  }
  return d;
}

beforeAll(async () => {
  db = await nuovoDb(['0003']);
  doc = await utente(db, 'prof', 'docente');
  anna = await utente(db, 'anna');
  bruno = await utente(db, 'bruno');
  mario = await utente(db, 'mario'); // magazziniere
  gina = await utente(db, 'gina'); // acquisti
  luca = await utente(db, 'luca'); // jolly
  mAnna = await personale(anna);
  mBruno = await personale(bruno);
  classe = (await q<{ id: string }>(
    `insert into magazzini (nome, tipo, proprietario_id, codice_ingresso) values ('4A', 'classe', $1, 'ABC234') returning id`, [doc],
  ))[0].id;
  await q(`insert into azienda (magazzino_id) values ($1)`, [classe]);
  await q(`insert into membri (magazzino_id, user_id, ruolo) values ($1, $2, 'docente')`, [classe, doc]);
  await q(`insert into membri (magazzino_id, user_id, ruolo, ruolo_aziendale) values ($1, $2, 'studente', 'magazziniere')`, [classe, mario]);
  await q(`insert into membri (magazzino_id, user_id, ruolo, ruolo_aziendale) values ($1, $2, 'studente', 'acquisti')`, [classe, gina]);
  await q(`insert into membri (magazzino_id, user_id, ruolo) values ($1, $2, 'studente')`, [classe, luca]);
});

describe('permessi', () => {
  test('un non membro non legge ne scrive', async () => {
    await expect(rpc(db, bruno, 'api_articoli_elenco', { p_magazzino: mAnna })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, bruno, 'api_anagrafiche_elenco', { p_magazzino: mAnna })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, bruno, 'api_ubicazioni_elenco', { p_magazzino: mAnna })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, bruno, 'api_azienda_leggi', { p_magazzino: mAnna })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, bruno, 'api_articolo_salva', { p_magazzino: mAnna, p_dati: { matricola: 'X', descrizione: 'x' } })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, null, 'api_articoli_elenco', { p_magazzino: mAnna })).rejects.toThrow('non_autenticato');
  });

  test('ruolo aziendale: magazziniere lotti/ubicazioni, acquisti articoli e anagrafiche, jolly tutto', async () => {
    const art = { matricola: 'P1', descrizione: 'Prova permessi' };
    await expect(rpc(db, mario, 'api_articolo_salva', { p_magazzino: classe, p_dati: art })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, mario, 'api_anagrafica_salva', { p_magazzino: classe, p_dati: { tipo: 'cliente', ragione_sociale: 'X' } })).rejects.toThrow('permesso_negato');
    const ub = await rpc(db, mario, 'api_ubicazione_salva', { p_magazzino: classe, p_dati: { codice: 'A-01' } });
    expect(ub.codice).toBe('A-01');

    const a = await rpc(db, gina, 'api_articolo_salva', { p_magazzino: classe, p_dati: art });
    expect(a.matricola).toBe('P1');
    await expect(rpc(db, gina, 'api_ubicazione_salva', { p_magazzino: classe, p_dati: { codice: 'B-01' } })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, gina, 'api_articolo_elimina', { p_id: a.id })).resolves.toMatchObject({ ok: true });
    await expect(rpc(db, gina, 'api_articoli_variazione', { p_magazzino: classe, p_ids: [a.id], p_tipo: 'prezzo_perc', p_valore: 5 })).resolves.toMatchObject({ aggiornati: 0 });

    // tutti i membri leggono
    expect(await rpc(db, mario, 'api_articoli_elenco', { p_magazzino: classe })).toBeInstanceOf(Array);
    // jolly e docente scrivono
    await rpc(db, luca, 'api_articolo_salva', { p_magazzino: classe, p_dati: { matricola: 'P2', descrizione: 'Jolly' } });
    await rpc(db, doc, 'api_articolo_salva', { p_magazzino: classe, p_dati: { matricola: 'P3', descrizione: 'Docente' } });
  });

  test('ogni scrittura finisce nel registro attivita', async () => {
    const r = await q<{ azione: string }>(`select azione from attivita where magazzino_id = $1`, [classe]);
    const azioni = r.map((x) => x.azione);
    expect(azioni).toContain('articolo.crea');
    expect(azioni).toContain('ubicazione.crea');
    expect(azioni).toContain('articolo.elimina');
  });

  test('impostazioni: solo docente o proprietario del personale', async () => {
    await expect(rpc(db, luca, 'api_magazzino_impostazioni', { p_magazzino: classe, p_blocca_giacenza_negativa: false })).rejects.toThrow('permesso_negato');
    expect(await rpc(db, luca, 'api_magazzino_impostazioni', { p_magazzino: classe })).toMatchObject({ blocca_giacenza_negativa: true });
    expect(await rpc(db, doc, 'api_magazzino_impostazioni', { p_magazzino: classe, p_blocca_giacenza_negativa: false })).toMatchObject({ blocca_giacenza_negativa: false });
    expect(await rpc(db, anna, 'api_magazzino_impostazioni', { p_magazzino: mAnna, p_blocca_giacenza_negativa: false })).toMatchObject({ blocca_giacenza_negativa: false });
    await expect(rpc(db, bruno, 'api_magazzino_impostazioni', { p_magazzino: mAnna, p_blocca_giacenza_negativa: true })).rejects.toThrow('permesso_negato');
  });
});

describe('azienda e anagrafiche', () => {
  test('azienda: salva parziale e rilegge', async () => {
    const a = await rpc(db, anna, 'api_azienda_salva', { p_magazzino: mAnna, p_dati: { ragione_sociale: 'Rossi Srl', p_iva: '12345678901' } });
    expect(a.ragione_sociale).toBe('Rossi Srl');
    await rpc(db, anna, 'api_azienda_salva', { p_magazzino: mAnna, p_dati: { comune: 'Milano' } });
    const l = await rpc(db, anna, 'api_azienda_leggi', { p_magazzino: mAnna });
    expect(l).toMatchObject({ ragione_sociale: 'Rossi Srl', p_iva: '12345678901', comune: 'Milano', nazione: 'Italia' });
    await expect(rpc(db, bruno, 'api_azienda_salva', { p_magazzino: mAnna, p_dati: { comune: 'X' } })).rejects.toThrow('permesso_negato');
  });

  test('anagrafiche: crea, filtra, modifica, duplicati, isolamento', async () => {
    const c = await rpc(db, anna, 'api_anagrafica_salva', { p_magazzino: mAnna, p_dati: { tipo: 'cliente', ragione_sociale: 'Zeta SpA', codice: 'C1', comune: 'Roma' } });
    const f = await rpc(db, anna, 'api_anagrafica_salva', { p_magazzino: mAnna, p_dati: { tipo: 'fornitore', ragione_sociale: 'Alfa Srl', codice: 'F1', lead_time_giorni: 5 } });
    expect(f.lead_time_giorni).toBe(5);

    const tutti = await rpc(db, anna, 'api_anagrafiche_elenco', { p_magazzino: mAnna });
    expect(tutti.map((x: any) => x.ragione_sociale)).toEqual(['Alfa Srl', 'Zeta SpA']);
    expect(await rpc(db, anna, 'api_anagrafiche_elenco', { p_magazzino: mAnna, p_tipo: 'cliente' })).toHaveLength(1);
    expect(await rpc(db, anna, 'api_anagrafiche_elenco', { p_magazzino: mAnna, p_cerca: 'roma' })).toHaveLength(1);
    await expect(rpc(db, anna, 'api_anagrafiche_elenco', { p_magazzino: mAnna, p_tipo: 'boh' })).rejects.toThrow('dato_non_valido');

    const m = await rpc(db, anna, 'api_anagrafica_salva', { p_magazzino: mAnna, p_dati: { id: c.id, comune: 'Torino', tipo: 'fornitore' } });
    expect(m).toMatchObject({ comune: 'Torino', ragione_sociale: 'Zeta SpA', tipo: 'cliente', codice: 'C1' });

    await expect(rpc(db, anna, 'api_anagrafica_salva', { p_magazzino: mAnna, p_dati: { tipo: 'cliente', ragione_sociale: 'Altro', codice: 'C1' } })).rejects.toThrow('gia_esiste');
    await expect(rpc(db, anna, 'api_anagrafica_salva', { p_magazzino: mAnna, p_dati: { tipo: 'cliente', ragione_sociale: '  ' } })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, anna, 'api_anagrafica_salva', { p_magazzino: mAnna, p_dati: { ragione_sociale: 'Senza tipo' } })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, anna, 'api_anagrafica_salva', { p_magazzino: mAnna, p_dati: { id: c.id, sconto_perc: 150 } })).rejects.toThrow('dato_non_valido');

    // isolamento
    expect(await rpc(db, bruno, 'api_anagrafiche_elenco', { p_magazzino: mBruno })).toHaveLength(0);
    await expect(rpc(db, bruno, 'api_anagrafica_salva', { p_magazzino: mBruno, p_dati: { id: c.id, comune: 'Hack' } })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, bruno, 'api_anagrafica_elimina', { p_id: c.id })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, bruno, 'api_anagrafica_storico', { p_id: c.id })).rejects.toThrow('permesso_negato');
  });

  test('storico documenti e eliminazione bloccata se ci sono documenti', async () => {
    const [c] = await rpc(db, anna, 'api_anagrafiche_elenco', { p_magazzino: mAnna, p_tipo: 'cliente' });
    const d = await doc_(mAnna, 'preventivo', 'bozza', 1, []);
    await q(`update documenti set anagrafica_id = $1, totale_cent = 1220 where id = $2`, [c.id, d]);
    const st = await rpc(db, anna, 'api_anagrafica_storico', { p_id: c.id });
    expect(st).toHaveLength(1);
    expect(st[0]).toMatchObject({ tipo: 'preventivo', totale_cent: 1220 });
    await expect(rpc(db, anna, 'api_anagrafica_elimina', { p_id: c.id })).rejects.toThrow('stato_non_valido');

    const libero = await rpc(db, anna, 'api_anagrafica_salva', { p_magazzino: mAnna, p_dati: { tipo: 'cliente', ragione_sociale: 'Libero' } });
    expect(await rpc(db, anna, 'api_anagrafica_elimina', { p_id: libero.id })).toMatchObject({ ok: true });
    await expect(rpc(db, anna, 'api_anagrafica_elimina', { p_id: libero.id })).rejects.toThrow('non_trovato');
  });
});

describe('articoli', () => {
  test('crea con giacenza iniziale, valida e modifica', async () => {
    const a = await rpc(db, anna, 'api_articolo_salva', {
      p_magazzino: mAnna,
      p_dati: { matricola: ' VITE-1 ', descrizione: 'Vite 4x20', prezzo_acquisto_cent: 12, scorta_minima: 10, giacenza_iniziale: 50 },
    });
    expect(a).toMatchObject({ matricola: 'VITE-1', um: 'PZ.', categoria: 'Standard', punto_riordino: 10 });
    const l = await rpc(db, anna, 'api_articolo_leggi', { p_id: a.id });
    expect(l.giacenza).toBe(50);
    expect(l.movimenti).toHaveLength(1);
    expect(l.movimenti[0]).toMatchObject({ causale: 'apertura', qta: 50, username: 'anna' });
    expect(l.giacenze).toHaveLength(1);

    const m = await rpc(db, anna, 'api_articolo_salva', { p_magazzino: mAnna, p_dati: { id: a.id, descrizione: 'Vite 4x25', categoria: 'Viteria' } });
    expect(m).toMatchObject({ matricola: 'VITE-1', descrizione: 'Vite 4x25', categoria: 'Viteria', prezzo_acquisto_cent: 12 });

    await expect(rpc(db, anna, 'api_articolo_salva', { p_magazzino: mAnna, p_dati: { matricola: 'VITE-1', descrizione: 'Doppia' } })).rejects.toThrow('gia_esiste');
    await expect(rpc(db, anna, 'api_articolo_salva', { p_magazzino: mAnna, p_dati: { matricola: '', descrizione: 'x' } })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, anna, 'api_articolo_salva', { p_magazzino: mAnna, p_dati: { matricola: 'Q', descrizione: '  ' } })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, anna, 'api_articolo_salva', { p_magazzino: mAnna, p_dati: { matricola: 'Q', descrizione: 'q', prezzo_acquisto_cent: -1 } })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, anna, 'api_articolo_salva', { p_magazzino: mAnna, p_dati: { matricola: 'Q', descrizione: 'q', iva_perc: 'abc' } })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, anna, 'api_articolo_salva', { p_magazzino: mAnna, p_dati: { matricola: 'Q', descrizione: 'q', scorta_sicurezza: 8, punto_riordino: 5 } })).rejects.toThrow('dato_non_valido');
    // la creazione fallita non lascia righe
    expect(await q(`select 1 from articoli where magazzino_id = $1 and matricola = 'Q'`, [mAnna])).toHaveLength(0);
    // senza punto_riordino esplicito segue la scorta di sicurezza
    const s = await rpc(db, anna, 'api_articolo_salva', { p_magazzino: mAnna, p_dati: { matricola: 'S1', descrizione: 's', scorta_sicurezza: 7 } });
    expect(s.punto_riordino).toBe(7);
  });

  test('isolamento tra magazzini', async () => {
    const mio = await rpc(db, bruno, 'api_articolo_salva', { p_magazzino: mBruno, p_dati: { matricola: 'VITE-1', descrizione: 'Stessa matricola, altro magazzino' } });
    const elA = await rpc(db, anna, 'api_articoli_elenco', { p_magazzino: mAnna });
    const elB = await rpc(db, bruno, 'api_articoli_elenco', { p_magazzino: mBruno });
    expect(elB).toHaveLength(1);
    expect(elA.some((x: any) => x.id === mio.id)).toBe(false);

    const [vA] = elA.filter((x: any) => x.matricola === 'VITE-1');
    await expect(rpc(db, bruno, 'api_articolo_leggi', { p_id: vA.id })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, bruno, 'api_articolo_salva', { p_magazzino: mBruno, p_dati: { id: vA.id, descrizione: 'Hack' } })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, bruno, 'api_articolo_elimina', { p_id: vA.id })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, bruno, 'api_lotti_elenco', { p_articolo: vA.id })).rejects.toThrow('permesso_negato');

    // ubicazione e fornitore di un altro magazzino non si collegano
    const ubA = await rpc(db, anna, 'api_ubicazione_salva', { p_magazzino: mAnna, p_dati: { codice: 'ISO-1' } });
    await expect(rpc(db, bruno, 'api_articolo_salva', { p_magazzino: mBruno, p_dati: { id: mio.id, ubicazione_id: ubA.id } })).rejects.toThrow('dato_non_valido');
    const [fA] = await rpc(db, anna, 'api_anagrafiche_elenco', { p_magazzino: mAnna, p_tipo: 'fornitore' });
    await expect(rpc(db, bruno, 'api_articolo_salva', { p_magazzino: mBruno, p_dati: { id: mio.id, fornitore_abituale_id: fA.id } })).rejects.toThrow('dato_non_valido');
    // l'id deve appartenere al magazzino indicato
    await expect(rpc(db, bruno, 'api_articoli_variazione', { p_magazzino: mBruno, p_ids: [vA.id], p_tipo: 'prezzo_perc', p_valore: 50 })).resolves.toMatchObject({ aggiornati: 0 });
    const [dopo] = (await rpc(db, anna, 'api_articoli_elenco', { p_magazzino: mAnna })).filter((x: any) => x.id === vA.id);
    expect(dopo.prezzo_acquisto_cent).toBe(12);
  });

  test('elenco: giacenza, carichi, scarichi, resi, ordinato e stato_riga', async () => {
    const mg = classe;
    const verde = await nuovoArticolo(mg, 'E-VERDE', { punto_riordino: 5 });
    const giallo = await nuovoArticolo(mg, 'E-GIALLO', { punto_riordino: 5 });
    const blu = await nuovoArticolo(mg, 'E-BLU', { punto_riordino: 5 });
    const ubi = (await q<{ id: string }>(`select id from ubicazioni where magazzino_id = $1 limit 1`, [mg]))[0].id;
    const docCarico = await doc_(mg, 'carico', 'confermato', 1, []);
    const docScarico = await doc_(mg, 'scarico', 'confermato', 1, []);
    const mov = (art: string, qta: number, causale: string, d: string | null = null) =>
      q(`insert into movimenti_stock (magazzino_id, articolo_id, qta, causale, documento_id) values ($1, $2, $3, $4, $5)`, [mg, art, qta, causale, d]);

    // verde: apertura 20, carico 30, scarico 10, reso 2 -> 42
    await q(`insert into giacenze (magazzino_id, articolo_id, qta) values ($1, $2, 42)`, [mg, verde]);
    await mov(verde, 20, 'apertura'); await mov(verde, 30, 'carico', docCarico);
    await mov(verde, -10, 'scarico', docScarico); await mov(verde, 2, 'reso_cliente');
    // scarico annullato: non conta
    await mov(verde, -4, 'scarico', docScarico); await mov(verde, 4, 'annullo', docScarico);
    // giallo: giacenza 5 su due ubicazioni (3 + 2) = punto di riordino
    await q(`insert into giacenze (magazzino_id, articolo_id, qta) values ($1, $2, 3)`, [mg, giallo]);
    await q(`insert into giacenze (magazzino_id, articolo_id, ubicazione_id, qta) values ($1, $2, $3, 2)`, [mg, giallo, ubi]);
    // blu: giacenza bassa ma ordine fornitore confermato 40 + bozza 7 (non conta) + evaso 9 (non conta)
    await q(`insert into giacenze (magazzino_id, articolo_id, qta) values ($1, $2, 1)`, [mg, blu]);
    await doc_(mg, 'ordine_fornitore', 'confermato', 1, [[blu, 40]]);
    await doc_(mg, 'ordine_fornitore', 'bozza', 2, [[blu, 7]]);
    await doc_(mg, 'ordine_fornitore', 'evaso', 3, [[blu, 9]]);

    const el = await rpc(db, luca, 'api_articoli_elenco', { p_magazzino: mg, p_cerca: 'E-' });
    const per = (m: string) => el.find((x: any) => x.matricola === m);
    expect(el).toHaveLength(3);
    expect(per('E-VERDE')).toMatchObject({ giacenza: 42, carichi: 30, scarichi: 10, resi: 2, ordinato: 0, stato_riga: 'verde' });
    expect(per('E-GIALLO')).toMatchObject({ giacenza: 5, carichi: 0, scarichi: 0, ordinato: 0, stato_riga: 'giallo' });
    expect(per('E-BLU')).toMatchObject({ giacenza: 1, ordinato: 40, stato_riga: 'blu' });

    // filtri
    await rpc(db, luca, 'api_articolo_salva', { p_magazzino: mg, p_dati: { id: giallo, categoria: 'Ricambi' } });
    const solo = await rpc(db, luca, 'api_articoli_elenco', { p_magazzino: mg, p_categoria: 'Ricambi' });
    expect(solo.map((x: any) => x.matricola)).toEqual(['E-GIALLO']);
    expect(await rpc(db, luca, 'api_articoli_elenco', { p_magazzino: mg, p_cerca: 'non-esiste' })).toHaveLength(0);
  });

  test('eliminazione bloccata con movimenti, ammessa senza', async () => {
    const [conMov] = (await rpc(db, anna, 'api_articoli_elenco', { p_magazzino: mAnna })).filter((x: any) => x.matricola === 'VITE-1');
    await expect(rpc(db, anna, 'api_articolo_elimina', { p_id: conMov.id })).rejects.toThrow('stato_non_valido');
    const senza = await rpc(db, anna, 'api_articolo_salva', { p_magazzino: mAnna, p_dati: { matricola: 'SENZA', descrizione: 'senza movimenti' } });
    expect(await rpc(db, anna, 'api_articolo_elimina', { p_id: senza.id })).toMatchObject({ ok: true });
    await expect(rpc(db, anna, 'api_articolo_leggi', { p_id: senza.id })).rejects.toThrow('non_trovato');
    // un articolo con sola riga di documento non si elimina
    const inDoc = await nuovoArticolo(mAnna, 'IN-DOC');
    await doc_(mAnna, 'ordine_cliente', 'bozza', 1, [[inDoc, 1]]);
    await expect(rpc(db, anna, 'api_articolo_elimina', { p_id: inDoc })).rejects.toThrow('stato_non_valido');
  });

  test('importazione: upsert per matricola e righe errate riportate', async () => {
    const r1 = await rpc(db, anna, 'api_articoli_importa', {
      p_magazzino: mAnna,
      p_righe: [
        { matricola: 'IMP-1', descrizione: 'Uno', prezzo_acquisto_cent: 100 },
        { matricola: 'IMP-2', descrizione: 'Due', giacenza_iniziale: 5 },
        { matricola: '', descrizione: 'Senza matricola' },
        { matricola: 'IMP-3', descrizione: 'Prezzo negativo', prezzo_acquisto_cent: -5 },
      ],
    });
    expect(r1).toMatchObject({ creati: 2, aggiornati: 0 });
    expect(r1.errori).toEqual([
      { riga: 3, matricola: '', errore: 'dato_non_valido' },
      { riga: 4, matricola: 'IMP-3', errore: 'dato_non_valido' },
    ]);
    const r2 = await rpc(db, anna, 'api_articoli_importa', {
      p_magazzino: mAnna,
      p_righe: [{ matricola: 'IMP-1', descrizione: 'Uno bis' }, { matricola: 'IMP-4', descrizione: 'Quattro' }],
    });
    expect(r2).toMatchObject({ creati: 1, aggiornati: 1, errori: [] });
    const el = await rpc(db, anna, 'api_articoli_elenco', { p_magazzino: mAnna, p_cerca: 'IMP-' });
    expect(el.map((x: any) => x.matricola)).toEqual(['IMP-2', 'IMP-4', 'IMP-1']); // ordinati per descrizione
    expect(el.find((x: any) => x.matricola === 'IMP-1')).toMatchObject({ descrizione: 'Uno bis', prezzo_acquisto_cent: 100 });
    expect(el.find((x: any) => x.matricola === 'IMP-2').giacenza).toBe(5);
    // importare nel magazzino di altri e' vietato; un'importazione non e' un array
    await expect(rpc(db, bruno, 'api_articoli_importa', { p_magazzino: mAnna, p_righe: [] })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, anna, 'api_articoli_importa', { p_magazzino: mAnna, p_righe: { a: 1 } })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, mario, 'api_articoli_importa', { p_magazzino: classe, p_righe: [] })).rejects.toThrow('permesso_negato');
  });

  test('variazione di prezzo, ricarico e sconto', async () => {
    const el = await rpc(db, anna, 'api_articoli_elenco', { p_magazzino: mAnna, p_cerca: 'IMP-1' });
    const id = el[0].id;
    expect(await rpc(db, anna, 'api_articoli_variazione', { p_magazzino: mAnna, p_ids: [id], p_tipo: 'prezzo_perc', p_valore: 10 })).toEqual({ aggiornati: 1 });
    await rpc(db, anna, 'api_articoli_variazione', { p_magazzino: mAnna, p_ids: [id], p_tipo: 'ricarico_perc', p_valore: 30 });
    await rpc(db, anna, 'api_articoli_variazione', { p_magazzino: mAnna, p_ids: [id], p_tipo: 'sconto_perc', p_valore: 5 });
    const { articolo } = await rpc(db, anna, 'api_articolo_leggi', { p_id: id });
    expect(articolo).toMatchObject({ prezzo_acquisto_cent: 110, ricarico_perc: 30, sconto_perc: 5 });
    await expect(rpc(db, anna, 'api_articoli_variazione', { p_magazzino: mAnna, p_ids: [id], p_tipo: 'boh', p_valore: 1 })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, anna, 'api_articoli_variazione', { p_magazzino: mAnna, p_ids: [], p_tipo: 'sconto_perc', p_valore: 1 })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, anna, 'api_articoli_variazione', { p_magazzino: mAnna, p_ids: [id], p_tipo: 'sconto_perc', p_valore: 101 })).rejects.toThrow('dato_non_valido');
  });
});

describe('ubicazioni e lotti', () => {
  test('ubicazioni: crea, duplicato, modifica, elimina (non se c e merce)', async () => {
    const u = await rpc(db, anna, 'api_ubicazione_salva', { p_magazzino: mAnna, p_dati: { codice: 'A-01-03', zona: 'A', scaffale: '3' } });
    expect(u).toMatchObject({ codice: 'A-01-03', zona: 'A', scaffale: '3' });
    await expect(rpc(db, anna, 'api_ubicazione_salva', { p_magazzino: mAnna, p_dati: { codice: 'A-01-03' } })).rejects.toThrow('gia_esiste');
    await expect(rpc(db, anna, 'api_ubicazione_salva', { p_magazzino: mAnna, p_dati: { codice: ' ' } })).rejects.toThrow('dato_non_valido');
    const m = await rpc(db, anna, 'api_ubicazione_salva', { p_magazzino: mAnna, p_dati: { id: u.id, zona: 'B' } });
    expect(m).toMatchObject({ codice: 'A-01-03', zona: 'B', scaffale: '3' });
    // stesso codice in un altro magazzino va bene
    await rpc(db, bruno, 'api_ubicazione_salva', { p_magazzino: mBruno, p_dati: { codice: 'A-01-03' } });

    const el = await rpc(db, anna, 'api_ubicazioni_elenco', { p_magazzino: mAnna });
    expect(el.map((x: any) => x.codice)).toContain('A-01-03');
    expect(el.every((x: any) => x.codice !== undefined)).toBe(true);

    const art = await nuovoArticolo(mAnna, 'UB-ART');
    await q(`insert into giacenze (magazzino_id, articolo_id, ubicazione_id, qta) values ($1, $2, $3, 4)`, [mAnna, art, u.id]);
    await expect(rpc(db, anna, 'api_ubicazione_elimina', { p_id: u.id })).rejects.toThrow('stato_non_valido');
    await expect(rpc(db, bruno, 'api_ubicazione_elimina', { p_id: u.id })).rejects.toThrow('permesso_negato');
    await q(`update giacenze set qta = 0 where articolo_id = $1`, [art]);
    expect(await rpc(db, anna, 'api_ubicazione_elimina', { p_id: u.id })).toMatchObject({ ok: true });
  });

  test('lotti: crea, duplicato, ordine per scadenza, giacenza, isolamento', async () => {
    const art = await nuovoArticolo(mAnna, 'LOTTI-ART');
    const l1 = await rpc(db, anna, 'api_lotto_salva', { p_magazzino: mAnna, p_dati: { articolo_id: art, codice: 'L-LUNGO', scadenza: '2027-12-31' } });
    await rpc(db, anna, 'api_lotto_salva', { p_magazzino: mAnna, p_dati: { articolo_id: art, codice: 'L-NOSCAD' } });
    await rpc(db, anna, 'api_lotto_salva', { p_magazzino: mAnna, p_dati: { articolo_id: art, codice: 'L-CORTO', scadenza: '2026-12-01' } });
    await expect(rpc(db, anna, 'api_lotto_salva', { p_magazzino: mAnna, p_dati: { articolo_id: art, codice: 'L-CORTO' } })).rejects.toThrow('gia_esiste');
    await expect(rpc(db, anna, 'api_lotto_salva', { p_magazzino: mAnna, p_dati: { articolo_id: art, codice: 'X', scadenza: 'ieri' } })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, anna, 'api_lotto_salva', { p_magazzino: mAnna, p_dati: { codice: 'SENZA-ART' } })).rejects.toThrow('dato_non_valido');
    // l'articolo deve essere del magazzino indicato
    await expect(rpc(db, bruno, 'api_lotto_salva', { p_magazzino: mBruno, p_dati: { articolo_id: art, codice: 'HACK' } })).rejects.toThrow('non_trovato');

    await q(`insert into giacenze (magazzino_id, articolo_id, lotto_id, qta) values ($1, $2, $3, 12)`, [mAnna, art, l1.id]);
    const el = await rpc(db, anna, 'api_lotti_elenco', { p_articolo: art });
    expect(el.map((x: any) => x.codice)).toEqual(['L-CORTO', 'L-LUNGO', 'L-NOSCAD']);
    expect(el.find((x: any) => x.codice === 'L-LUNGO')).toMatchObject({ qta: 12, scadenza: '2027-12-31' });

    const m = await rpc(db, anna, 'api_lotto_salva', { p_magazzino: mAnna, p_dati: { id: l1.id, scadenza: null } });
    expect(m).toMatchObject({ codice: 'L-LUNGO', scadenza: null });
    await expect(rpc(db, bruno, 'api_lotti_elenco', { p_articolo: art })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, bruno, 'api_lotto_salva', { p_magazzino: mBruno, p_dati: { id: l1.id, codice: 'HACK' } })).rejects.toThrow('permesso_negato');
  });
});
