import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { nuovoDb, rpc, utente } from './helper';

let db: PGlite;
let n = 0;
beforeAll(async () => { db = await nuovoDb(['0005']); });

/** Un docente con una classe e due studenti iscritti (nomi utente unici per test). */
async function scenario() {
  const k = ++n;
  const doc = await utente(db, `doc${k}`, 'docente');
  const s1 = await utente(db, `alu${k}a`);
  const s2 = await utente(db, `alu${k}b`);
  const nome = `Classe ${k}`;
  const c = await rpc(db, doc, 'api_classe_crea', { p_nome: nome });
  await rpc(db, s1, 'api_classe_entra', { p_codice: c.codice_ingresso });
  await rpc(db, s2, 'api_classe_entra', { p_codice: c.codice_ingresso });
  return { doc, s1, s2, id: c.id as string, nome, codice: c.codice_ingresso as string };
}
const conta = async (sql: string, p: unknown[]) => Number((await db.query<{ n: string }>(sql, p as any[])).rows[0].n);

describe('crea ed entra', () => {
  test('solo il docente crea classi', async () => {
    const stud = await utente(db, 'soloalu');
    await expect(rpc(db, stud, 'api_classe_crea', { p_nome: 'Mia' })).rejects.toThrow('permesso_negato');
    const doc = await utente(db, 'sologiu', 'docente');
    await expect(rpc(db, doc, 'api_classe_crea', { p_nome: '  ' })).rejects.toThrow('dato_non_valido');
    const c = await rpc(db, doc, 'api_classe_crea', { p_nome: '3A Logistica' });
    expect(c.codice_ingresso).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(c.tipo).toBe('classe');
    const m = await db.query<any>(`select tipo from magazzini where id = $1`, [c.id]);
    expect(m.rows[0].tipo).toBe('classe');
    expect(await conta(`select count(*) n from membri where magazzino_id = $1 and user_id = $2 and ruolo = 'docente'`, [c.id, doc])).toBe(1);
    expect(await conta(`select count(*) n from azienda where magazzino_id = $1`, [c.id])).toBe(1);
  });

  test('entrare col codice: studente senza ruolo aziendale, idempotente', async () => {
    const { doc, id, codice } = await scenario();
    const s = await utente(db, `nuovo${n}`);
    await expect(rpc(db, s, 'api_classe_entra', { p_codice: 'XXXXXX' })).rejects.toThrow('codice_non_valido');
    const e = await rpc(db, s, 'api_classe_entra', { p_codice: codice.toLowerCase() });
    expect(e).toMatchObject({ id, tipo: 'classe', ruolo: 'studente', ruolo_aziendale: null });
    await rpc(db, s, 'api_classe_entra', { p_codice: codice });
    expect(await conta(`select count(*) n from membri where magazzino_id = $1 and user_id = $2`, [id, s])).toBe(1);
    // il docente che rientra col proprio codice resta docente
    expect((await rpc(db, doc, 'api_classe_entra', { p_codice: codice })).ruolo).toBe('docente');
  });

  test('codice disattivato e rigenerato', async () => {
    const { doc, id, codice } = await scenario();
    const x = await utente(db, `x${n}a`);
    expect(await rpc(db, doc, 'api_classe_codice', { p_magazzino: id, p_azione: 'disattiva' })).toEqual({ codice, attivo: false });
    await expect(rpc(db, x, 'api_classe_entra', { p_codice: codice })).rejects.toThrow('codice_non_valido');
    expect((await rpc(db, doc, 'api_classe_codice', { p_magazzino: id, p_azione: 'attiva' })).attivo).toBe(true);
    const r = await rpc(db, doc, 'api_classe_codice', { p_magazzino: id, p_azione: 'rigenera' });
    expect(r.codice).not.toBe(codice);
    expect(r.codice).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    await expect(rpc(db, x, 'api_classe_entra', { p_codice: codice })).rejects.toThrow('codice_non_valido');
    await rpc(db, x, 'api_classe_entra', { p_codice: r.codice });
    await expect(rpc(db, doc, 'api_classe_codice', { p_magazzino: id, p_azione: 'boh' })).rejects.toThrow('dato_non_valido');
  });
});

describe('gestione membri', () => {
  test('lo studente (e un estraneo) non gestisce la classe', async () => {
    const { s1, id, nome, s2 } = await scenario();
    const estraneo = await utente(db, `estr${n}`);
    for (const chi of [s1, estraneo]) {
      await expect(rpc(db, chi, 'api_classe_membri', { p_magazzino: id })).rejects.toThrow('permesso_negato');
      await expect(rpc(db, chi, 'api_classe_codice', { p_magazzino: id, p_azione: 'rigenera' })).rejects.toThrow('permesso_negato');
      await expect(rpc(db, chi, 'api_classe_imposta_ruolo', { p_magazzino: id, p_user: s2, p_ruolo_aziendale: 'acquisti' })).rejects.toThrow('permesso_negato');
      await expect(rpc(db, chi, 'api_classe_rimuovi', { p_magazzino: id, p_user: s2 })).rejects.toThrow('permesso_negato');
      await expect(rpc(db, chi, 'api_classe_azzera', { p_magazzino: id, p_conferma: nome })).rejects.toThrow('permesso_negato');
      await expect(rpc(db, chi, 'api_classe_elimina', { p_magazzino: id, p_conferma: nome })).rejects.toThrow('permesso_negato');
      await expect(rpc(db, chi, 'api_docente_utenti', { p_magazzino: id })).rejects.toThrow('permesso_negato');
    }
  });

  test('ruoli aziendali, elenco membri, rimozione', async () => {
    const { doc, s1, s2, id } = await scenario();
    await rpc(db, doc, 'api_classe_imposta_ruolo', { p_magazzino: id, p_user: s1, p_ruolo_aziendale: 'magazziniere' });
    await expect(rpc(db, doc, 'api_classe_imposta_ruolo', { p_magazzino: id, p_user: s1, p_ruolo_aziendale: 'capo' })).rejects.toThrow('dato_non_valido');
    await expect(rpc(db, doc, 'api_classe_imposta_ruolo', { p_magazzino: id, p_user: doc, p_ruolo_aziendale: 'acquisti' })).rejects.toThrow('dato_non_valido');
    const membri = await rpc(db, doc, 'api_classe_membri', { p_magazzino: id });
    expect(membri).toHaveLength(3);
    expect(membri.find((m: any) => m.user_id === s1).ruolo_aziendale).toBe('magazziniere');
    // ruolo nullo = jolly
    await rpc(db, doc, 'api_classe_imposta_ruolo', { p_magazzino: id, p_user: s1, p_ruolo_aziendale: null });
    expect((await rpc(db, doc, 'api_classe_membri', { p_magazzino: id })).find((m: any) => m.user_id === s1).ruolo_aziendale).toBeNull();

    await expect(rpc(db, doc, 'api_classe_rimuovi', { p_magazzino: id, p_user: doc })).rejects.toThrow('permesso_negato');
    await rpc(db, doc, 'api_classe_rimuovi', { p_magazzino: id, p_user: s2 });
    expect(await rpc(db, doc, 'api_classe_membri', { p_magazzino: id })).toHaveLength(2);
    await expect(rpc(db, doc, 'api_classe_rimuovi', { p_magazzino: id, p_user: s2 })).rejects.toThrow('non_trovato');
    await expect(rpc(db, s2, 'api_attivita', { p_magazzino: id })).rejects.toThrow('permesso_negato');
  });
});

describe('azzera ed elimina', () => {
  async function riempi(id: string, s1: string) {
    const art = (await db.query<any>(`insert into articoli (magazzino_id, matricola, descrizione) values ($1,'A1','Vite') returning id`, [id])).rows[0].id;
    const an = (await db.query<any>(`insert into anagrafiche (magazzino_id, tipo, ragione_sociale) values ($1,'cliente','Rossi') returning id`, [id])).rows[0].id;
    const ub = (await db.query<any>(`insert into ubicazioni (magazzino_id, codice) values ($1,'A-01') returning id`, [id])).rows[0].id;
    await db.query(`insert into lotti (magazzino_id, articolo_id, codice) values ($1,$2,'L1')`, [id, art]);
    await db.query(`insert into giacenze (magazzino_id, articolo_id, ubicazione_id, qta) values ($1,$2,$3,10)`, [id, art, ub]);
    await db.query(`insert into movimenti_stock (magazzino_id, articolo_id, qta, causale) values ($1,$2,10,'apertura')`, [id, art]);
    const doc = (await db.query<any>(`insert into documenti (magazzino_id, tipo, anno, numero, anagrafica_id) values ($1,'scarico',2026,1,$2) returning id`, [id, an])).rows[0].id;
    await db.query(`insert into righe_documento (documento_id, posizione, articolo_id, descrizione) values ($1,1,$2,'Vite')`, [doc, art]);
    const inv = (await db.query<any>(`insert into inventari (magazzino_id, nome) values ($1,'Inv') returning id`, [id])).rows[0].id;
    await db.query(`insert into inventario_righe (inventario_id, articolo_id, qta_sistema) values ($1,$2,10)`, [inv, art]);
    await db.query(`insert into scadenze (magazzino_id, user_id, oggetto, inizio, fine) values ($1,$2,'x',now(),now())`, [id, s1]);
    const nt = (await db.query<any>(`insert into notifiche (magazzino_id, tipo, messaggio) values ($1,'sistema','ciao') returning id`, [id])).rows[0].id;
    await db.query(`insert into notifiche_lette (notifica_id, user_id) values ($1,$2)`, [nt, s1]);
    const sc = (await db.query<any>(`insert into scenari (magazzino_id, nome) values ($1,'Sc') returning id`, [id])).rows[0].id;
    await db.query(`insert into compiti (scenario_id, magazzino_id, assegnato_a, tipo, titolo) values ($1,$2,$3,'carico','t')`, [sc, id, s1]);
    await db.query(`insert into contatori (magazzino_id, tipo, anno, ultimo) values ($1,'scarico',2026,1)`, [id]);
    await db.query(`insert into attivita (magazzino_id, user_id, azione) values ($1,$2,'prova')`, [id, s1]);
  }
  const tabelle = ['articoli', 'anagrafiche', 'ubicazioni', 'lotti', 'giacenze', 'movimenti_stock', 'documenti', 'inventari',
    'scadenze', 'notifiche', 'scenari', 'compiti', 'contatori'];

  test('azzera: conferma sbagliata fallisce, giusta svuota ma tiene i membri', async () => {
    const { doc, s1, id, nome } = await scenario();
    await riempi(id, s1);
    await expect(rpc(db, doc, 'api_classe_azzera', { p_magazzino: id, p_conferma: 'altro' })).rejects.toThrow('conferma_errata');
    expect(await conta(`select count(*) n from articoli where magazzino_id = $1`, [id])).toBe(1);

    await rpc(db, doc, 'api_classe_azzera', { p_magazzino: id, p_conferma: nome });
    for (const t of tabelle) expect(await conta(`select count(*) n from ${t} where magazzino_id = $1`, [id]), t).toBe(0);
    expect(await conta(`select count(*) n from membri where magazzino_id = $1`, [id])).toBe(3);
    expect(await conta(`select count(*) n from magazzini where id = $1`, [id])).toBe(1);
    expect(await conta(`select count(*) n from azienda where magazzino_id = $1`, [id])).toBe(1);
    const att = await rpc(db, doc, 'api_attivita', { p_magazzino: id });
    expect(att).toHaveLength(1);
    expect(att[0].azione).toBe('classe_azzera');
    expect(att[0].username).toMatch(/^doc/);
  });

  test('elimina: stessa conferma, poi la classe sparisce', async () => {
    const { doc, s1, id, nome } = await scenario();
    await riempi(id, s1);
    await expect(rpc(db, doc, 'api_classe_elimina', { p_magazzino: id, p_conferma: 'altro' })).rejects.toThrow('conferma_errata');
    await rpc(db, doc, 'api_classe_elimina', { p_magazzino: id, p_conferma: nome });
    expect(await conta(`select count(*) n from magazzini where id = $1`, [id])).toBe(0);
    expect(await conta(`select count(*) n from membri where magazzino_id = $1`, [id])).toBe(0);
    expect(await conta(`select count(*) n from documenti where magazzino_id = $1`, [id])).toBe(0);
    expect((await rpc(db, doc, 'api_docente_classi')).find((c: any) => c.id === id)).toBeUndefined();
  });
});

describe('vista docente', () => {
  test('online/offline, magazzino usato, compiti; il personale resta privato', async () => {
    const { doc, s1, s2, id, nome } = await scenario();
    const personale = (await rpc(db, s2, 'api_inizializza')).magazzini.find((m: any) => m.tipo === 'personale').id;
    await db.query(`insert into articoli (magazzino_id, matricola, descrizione) values ($1,'SEGRETO','Merce privata di s2')`, [personale]);
    await rpc(db, doc, 'api_classe_imposta_ruolo', { p_magazzino: id, p_user: s1, p_ruolo_aziendale: 'acquisti' });

    await db.query(`insert into presenze (user_id, magazzino_id, pagina, visto_il) values ($1,$2,'articoli', now())`, [s1, id]);
    await db.query(`insert into presenze (user_id, magazzino_id, pagina, visto_il) values ($1,$2,'articoli', now() - interval '10 minutes')`, [s2, personale]);
    await db.query(`insert into attivita (magazzino_id, user_id, azione) values ($1,$2,'carico_creato')`, [id, s1]);
    const sc = (await db.query<any>(`insert into scenari (magazzino_id, nome) values ($1,'Sc') returning id`, [id])).rows[0].id;
    for (const [i, stato] of ['completato', 'completato', 'errore', 'bloccato', 'da_fare'].entries())
      await db.query(`insert into compiti (scenario_id, magazzino_id, assegnato_a, tipo, titolo, qta, stato) values ($1,$2,$3,'carico','t',$4,$5)`, [sc, id, s1, i + 1, stato]);

    const classi = await rpc(db, doc, 'api_docente_classi');
    const mia = classi.find((c: any) => c.id === id);
    expect(mia).toMatchObject({ nome, n_iscritti: 2, n_online: 1 });

    const u = await rpc(db, doc, 'api_docente_utenti', { p_magazzino: id });
    expect(u).toHaveLength(2);
    const a = u.find((x: any) => x.user_id === s1);
    const b = u.find((x: any) => x.user_id === s2);
    expect(a).toMatchObject({ ruolo_aziendale: 'acquisti', online: true, pagina: 'articoli',
      magazzino_usato: { tipo: 'classe', id, nome }, ultima_azione: 'carico_creato',
      compiti: { totale: 5, completati: 2, errori: 1, bloccati: 1 } });
    expect(a.ultima_azione_il).toBeTruthy();
    expect(b).toMatchObject({ online: false, ruolo_aziendale: null, ultima_azione: 'classe_entra',
      compiti: { totale: 0, completati: 0, errori: 0, bloccati: 0 } });
    expect(b.magazzino_usato).toEqual({ tipo: 'personale' });

    // s2 torna online: si vede che usa il personale, ma nessun contenuto ne' id
    await db.query(`update presenze set visto_il = now() where user_id = $1`, [s2]);
    const u2 = await rpc(db, doc, 'api_docente_utenti', { p_magazzino: id });
    const b2 = u2.find((x: any) => x.user_id === s2);
    expect(b2.online).toBe(true);
    expect(b2.magazzino_usato).toEqual({ tipo: 'personale' });
    const testo = JSON.stringify(u2);
    expect(testo).not.toContain(personale);
    expect(testo).not.toContain('SEGRETO');
    expect(testo).not.toContain('Merce privata');
    // e il docente non puo' aprire il personale con le altre funzioni
    await expect(rpc(db, doc, 'api_attivita', { p_magazzino: personale })).rejects.toThrow('permesso_negato');
    await expect(rpc(db, doc, 'api_docente_utenti', { p_magazzino: personale })).rejects.toThrow('permesso_negato');
  });

  test('un docente vede solo le proprie classi', async () => {
    const x = await scenario();
    const y = await scenario();
    const mie = await rpc(db, x.doc, 'api_docente_classi');
    expect(mie.map((c: any) => c.id)).toContain(x.id);
    expect(mie.map((c: any) => c.id)).not.toContain(y.id);
    await expect(rpc(db, x.doc, 'api_docente_utenti', { p_magazzino: y.id })).rejects.toThrow('permesso_negato');
  });
});

describe('notifiche e attivita', () => {
  test('notifiche comuni a tutta la classe, lettura per utente', async () => {
    const { s1, s2, id } = await scenario();
    await db.query(`insert into notifiche (magazzino_id, tipo, messaggio) values ($1,'sistema','uno'), ($1,'scorta_bassa','due')`, [id]);
    expect((await rpc(db, s1, 'api_notifiche', { p_magazzino: id })).non_lette).toBe(2);
    expect((await rpc(db, s2, 'api_notifiche', { p_magazzino: id })).non_lette).toBe(2);

    expect((await rpc(db, s1, 'api_notifiche_leggi', { p_magazzino: id })).segnate).toBe(2);
    const n1 = await rpc(db, s1, 'api_notifiche', { p_magazzino: id });
    expect(n1.non_lette).toBe(0);
    expect(n1.elenco).toHaveLength(2);
    expect(n1.elenco.every((x: any) => x.letta === true)).toBe(true);
    const n2 = await rpc(db, s2, 'api_notifiche', { p_magazzino: id });
    expect(n2.non_lette).toBe(2);
    expect(n2.elenco.every((x: any) => x.letta === false)).toBe(true);
    expect((await rpc(db, s1, 'api_notifiche_leggi', { p_magazzino: id })).segnate).toBe(0);

    const estraneo = await utente(db, `estn${n}`);
    await expect(rpc(db, estraneo, 'api_notifiche', { p_magazzino: id })).rejects.toThrow('permesso_negato');
  });

  test('elenco notifiche: ultime 50, non_lette le conta tutte', async () => {
    const { s1, id } = await scenario();
    await db.query(`insert into notifiche (magazzino_id, tipo, messaggio) select $1, 'sistema', 'n' || g from generate_series(1, 55) g`, [id]);
    const r = await rpc(db, s1, 'api_notifiche', { p_magazzino: id });
    expect(r.non_lette).toBe(55);
    expect(r.elenco).toHaveLength(50);
  });

  test('registro attivita: tutti i membri, dal piu recente, con autore e filtro dopo_id', async () => {
    const { doc, s1, id } = await scenario();
    await db.query(`insert into attivita (magazzino_id, user_id, azione) values ($1,$2,'a1'), ($1,$2,'a2'), ($1,$2,'a3')`, [id, s1]);
    const r = await rpc(db, s1, 'api_attivita', { p_magazzino: id });
    expect(r.length).toBeGreaterThanOrEqual(3);
    expect(r[0].azione).toBe('a3');
    expect(r[0].username).toMatch(/^alu/);
    expect(r.map((x: any) => x.id)).toEqual([...r.map((x: any) => x.id)].sort((p: number, q: number) => q - p));
    const dopo = await rpc(db, doc, 'api_attivita', { p_magazzino: id, p_dopo_id: r[1].id });
    expect(dopo.map((x: any) => x.azione)).toEqual(['a3']);
    expect(await rpc(db, doc, 'api_attivita', { p_magazzino: id, p_limite: 2 })).toHaveLength(2);
  });
});
