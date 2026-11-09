import { describe, expect, it } from 'vitest';
import { aggiungiMesi, aInputLocale, chiave, daInputLocale, fasceDelGiorno, grigliaMese, perGiorno, type Scadenza } from './griglia';

const s = (id: string, inizio: string, fine: string): Scadenza => ({
  id, oggetto: id, descrizione: null, inizio: new Date(inizio).toISOString(), fine: new Date(fine).toISOString(), tipo: 'appuntamento',
  stato: 'in_sospeso', anagrafica_id: null,
});

describe('grigliaMese', () => {
  it('novembre 2026: inizia lunedi 26 ottobre, finisce domenica 6 dicembre (6 settimane)', () => {
    const g = grigliaMese(new Date(2026, 10, 15));
    expect(g).toHaveLength(42);
    expect(g[0].chiave).toBe('2026-10-26');
    expect(g[41].chiave).toBe('2026-12-06');
    expect(g.filter((c) => c.delMese)).toHaveLength(30);
  });
  it('febbraio 2027 comincia di lunedi: esattamente 4 settimane', () => {
    const g = grigliaMese(new Date(2027, 1, 10));
    expect(g).toHaveLength(28);
    expect(g[0].chiave).toBe('2027-02-01');
  });
  it('mese che finisce di domenica non aggiunge settimane (marzo 2026 finisce martedi)', () => {
    const g = grigliaMese(new Date(2026, 2, 1));
    expect(g[0].chiave).toBe('2026-02-23');
    expect(g[g.length - 1].chiave).toBe('2026-04-05');
  });
  it('attraversa il cambio ora legale senza saltare giorni (marzo 2026)', () => {
    const k = grigliaMese(new Date(2026, 2, 1)).map((c) => c.chiave);
    expect(new Set(k).size).toBe(k.length);
  });
});

describe('aggiungiMesi', () => {
  it('31 gennaio + 1 mese = ultimo giorno di febbraio', () => expect(chiave(aggiungiMesi(new Date(2027, 0, 31), 1))).toBe('2027-02-28'));
  it('indietro oltre l anno', () => expect(chiave(aggiungiMesi(new Date(2026, 0, 15), -1))).toBe('2025-12-15'));
});

describe('perGiorno', () => {
  it('una voce su piu giorni compare in ognuno e le liste sono ordinate per inizio', () => {
    const m = perGiorno([s('b', '2026-11-06T15:00', '2026-11-06T16:00'), s('a', '2026-11-05T22:00', '2026-11-06T02:00'), s('c', '2026-11-06T09:00', '2026-11-06T10:00')]);
    expect(m.get('2026-11-05')!.map((x) => x.id)).toEqual(['a']);
    expect(m.get('2026-11-06')!.map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('input locale', () => {
  it('andata e ritorno', () => {
    const iso = daInputLocale('2026-11-06T10:30')!;
    expect(aInputLocale(iso)).toBe('2026-11-06T10:30');
    expect(new Date(iso).getHours()).toBe(10);
  });
  it('vuoto = null', () => expect(daInputLocale('')).toBeNull());
});

describe('fasceDelGiorno', () => {
  const g = new Date(2026, 10, 6);
  it('una voce: posizione in minuti, durata minima 30', () => {
    const [f] = fasceDelGiorno(g, [s('a', '2026-11-06T10:00', '2026-11-06T10:00')]);
    expect([f.da, f.a, f.col, f.colonne]).toEqual([600, 630, 0, 1]);
  });
  it('sovrapposte: due colonne; non sovrapposta: una', () => {
    const f = fasceDelGiorno(g, [
      s('a', '2026-11-06T10:00', '2026-11-06T11:00'),
      s('b', '2026-11-06T10:30', '2026-11-06T11:30'),
      s('c', '2026-11-06T13:00', '2026-11-06T14:00'),
    ]);
    expect(f.map((x) => [x.scadenza.id, x.col, x.colonne])).toEqual([['a', 0, 2], ['b', 1, 2], ['c', 0, 1]]);
  });
  it('taglia ai bordi del giorno', () => {
    const [f] = fasceDelGiorno(g, [s('a', '2026-11-05T22:00', '2026-11-07T02:00')]);
    expect([f.da, f.a]).toEqual([0, 1440]);
  });
});
