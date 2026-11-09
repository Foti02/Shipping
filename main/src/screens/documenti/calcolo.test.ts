import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { nuovoDb, rpc, utente } from '../../../supabase/tests/helper';
import { calcolaTotali, centInEuro, euroInCent, impostaRiga, nettoRiga, numero, totaleRiga, type RigaCalc } from './calcolo';

const r = (o: Partial<RigaCalc> = {}): RigaCalc => ({ qta: 1, prezzo_cent: 1000, sconto_perc: 0, iva_perc: 22, ...o });

describe('righe', () => {
  test('netto, imposta e totale di riga', () => {
    expect(nettoRiga(r({ qta: 5, prezzo_cent: 2100 }))).toBe(10500);
    expect(impostaRiga(r({ qta: 5, prezzo_cent: 2100 }))).toBe(2310);
    expect(totaleRiga(r({ qta: 5, prezzo_cent: 2100 }))).toBe(12810);
  });
  test('sconto e arrotondamento sui mezzi (verso l alto, come Postgres)', () => {
    expect(nettoRiga(r({ prezzo_cent: 1050, sconto_perc: 50 }))).toBe(525);
    expect(nettoRiga(r({ prezzo_cent: 1, qta: 0.5 }))).toBe(1); // 0,5 -> 1
    expect(impostaRiga(r({ prezzo_cent: 1050, iva_perc: 5 }))).toBe(53); // 52,5 -> 53
    expect(nettoRiga(r({ qta: 1.005, prezzo_cent: 100 }))).toBe(101); // 100,5 esatto, non 100,49999
  });
  test('prezzo negativo si arrotonda lontano da zero', () => {
    expect(nettoRiga(r({ prezzo_cent: -1, qta: 0.5 }))).toBe(-1);
  });
});

describe('totali', () => {
  test('INPS e ritenuta sul netto, totale = imp + iva + inps - rit', () => {
    const t = calcolaTotali([r({ prezzo_cent: 10000, inps_perc: 4, ritenuta_perc: 20 })]);
    expect(t).toEqual({ imponibile_cent: 10000, imposta_cent: 2200, inps_cent: 400, ritenuta_cent: 2000, totale_cent: 10600 });
  });
  test('si arrotonda riga per riga, non sul totale', () => {
    const t = calcolaTotali([r({ prezzo_cent: 1050, iva_perc: 5 }), r({ prezzo_cent: 1050, iva_perc: 5 })]);
    expect(t.imposta_cent).toBe(106); // 53 + 53, non round(105)
  });
  test('nessuna riga', () => {
    expect(calcolaTotali([]).totale_cent).toBe(0);
  });
});

test('numeri digitati', () => {
  expect(numero('4,20')).toBe(4.2);
  expect(numero(' 7.5 ')).toBe(7.5);
  expect(numero('abc')).toBe(0);
  expect(euroInCent('4,20')).toBe(420);
  expect(euroInCent('19,99')).toBe(1999);
  expect(centInEuro(420)).toBe('4,20');
});

// Confronto con il database vero (PGlite): stesse righe, stessi totali.
describe('identico al database', () => {
  let db: PGlite;
  beforeAll(async () => { db = await nuovoDb(['0004']); }, 60_000);

  test('righe casuali con sconti, IVA, INPS e ritenuta', async () => {
    const u = await utente(db, 'calcolo');
    const m = (await rpc(db, u, 'api_inizializza')).magazzini[0].id as string;
    let seme = 12345;
    const rnd = () => ((seme = (seme * 1103515245 + 12345) % 2147483648) / 2147483648);
    const scelta = <T,>(v: T[]) => v[Math.floor(rnd() * v.length)];

    for (let prova = 0; prova < 25; prova++) {
      const righe = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => ({
        qta: scelta([1, 2, 0.5, 1.005, 3.333, 12, 0.001, 7.25]),
        prezzo_cent: Math.floor(rnd() * 100000) + 1,
        sconto_perc: scelta([0, 5, 12.5, 33.33, 50, 100]),
        iva_perc: scelta([0, 4, 5, 10, 22]),
        inps_perc: scelta([0, 4]),
        ritenuta_perc: scelta([0, 20, 4]),
      }));
      const doc = await rpc(db, u, 'api_documento_salva', {
        p_magazzino: m,
        p_documento: { tipo: 'fattura_vendita' },
        p_righe: righe.map((x, i) => ({ ...x, descrizione: `riga ${i}` })),
      });
      const t = calcolaTotali(righe);
      const d = doc.documento;
      expect([d.imponibile_cent, d.imposta_cent, d.inps_cent, d.ritenuta_cent, d.totale_cent].map(Number)).toEqual(
        [t.imponibile_cent, t.imposta_cent, t.inps_cent, t.ritenuta_cent, t.totale_cent],
      );
      doc.righe.forEach((rr: any, i: number) => {
        expect(Number(rr.totale_cent)).toBe(totaleRiga(righe[i]));
        expect(Number(rr.netto_cent)).toBe(nettoRiga(righe[i]));
      });
    }
  }, 60_000);
});
