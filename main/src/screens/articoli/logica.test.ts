import { expect, test } from 'vitest';
import { analizzaCsv, dividiCsv, euroInCent, leggiNumero, prezzoVendita } from './logica';

test("numeri all'italiana", () => {
  expect(leggiNumero('12,50')).toBe(12.5);
  expect(leggiNumero('1.234,56')).toBe(1234.56);
  expect(leggiNumero('12.5')).toBe(12.5);
  expect(leggiNumero(' 3 € ')).toBe(3);
  expect(leggiNumero('')).toBeNull();
  expect(leggiNumero('abc')).toBeNaN();
  expect(euroInCent('19,99')).toBe(1999);
  expect(euroInCent('0,1')).toBe(10);
});

test('prezzo di vendita: ricarico, sconto, IVA', () => {
  expect(prezzoVendita(1000, 0, 0, 22)).toMatchObject({ listino: 1000, netto: 1000, ivato: 1220, acquistoIvato: 1220 });
  expect(prezzoVendita(1000, 30, 10, 22)).toMatchObject({ listino: 1300, netto: 1170, ivato: 1427 });
  expect(prezzoVendita(0, 50, 0, 22).ivato).toBe(0);
});

test('CSV: virgolette, a capo e BOM', () => {
  expect(dividiCsv('﻿a;"b;c";"d ""x"""\r\n1;2;3\n')).toEqual([['a', 'b;c', 'd "x"'], ['1', '2', '3']]);
  expect(dividiCsv('a;b\n\n  ;  \nc;d')).toEqual([['a', 'b'], ['c', 'd']]);
});

test('CSV importazione: per posizione, per intestazione, errori', () => {
  const r = analizzaCsv('A1;Cavo;MT.;Elettrica;1.250,50;22;10\nA2;Mouse;;;;;\n;Senza matricola;;;;;\nA3;Prezzo;;;xx;;');
  expect(r[0]).toEqual({
    riga: 1,
    dati: { matricola: 'A1', descrizione: 'Cavo', um: 'MT.', categoria: 'Elettrica', prezzo_acquisto_cent: 125050, iva_perc: 22, giacenza_iniziale: 10 },
  });
  expect(r[1].dati).toEqual({ matricola: 'A2', descrizione: 'Mouse' });
  expect(r[2].errore).toBe('matricola mancante');
  expect(r[3].errore).toBe('prezzo di acquisto non valido');

  const h = analizzaCsv('descrizione;matricola;extra;iva\nPenna;P1;x;4\nGomma;G1;y;200');
  expect(h[0].dati).toEqual({ matricola: 'P1', descrizione: 'Penna', iva_perc: 4 });
  expect(h[1].errore).toBe('IVA non valido');
});
