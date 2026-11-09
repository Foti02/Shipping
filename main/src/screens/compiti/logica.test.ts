import { expect, test } from 'vitest';
import { azioneCompito, ordinaCompiti, percorsoCompito, righeErrore, spiegaBlocco } from './logica';

test('errori dall\'esito in italiano', () => {
  expect(righeErrore({ errori: [{ campo: 'quantita', atteso: 10, trovato: 8 }, { campo: 'controparte', atteso: 'Rossi Srl', trovato: null }] })).toEqual([
    'Quantità: richiesto 10, trovato 8',
    'Cliente/fornitore: richiesto Rossi Srl, trovato niente',
  ]);
  expect(righeErrore({ ok: true })).toEqual([]);
  expect(righeErrore(null)).toEqual([]);
});

test('stato: errori e bloccati prima, completati in fondo, ordine stabile', () => {
  const c = [{ stato: 'completato', n: 1 }, { stato: 'da_fare', n: 2 }, { stato: 'bloccato', n: 3 }, { stato: 'da_fare', n: 4 }, { stato: 'errore', n: 5 }];
  expect(ordinaCompiti(c).map((x) => x.n)).toEqual([5, 3, 2, 4, 1]);
});

test('schermata e permesso di ogni tipo di compito', () => {
  expect(percorsoCompito('scarico')).toBe('documenti/scarico');
  expect(percorsoCompito('evadi_ordine')).toBe('documenti/ordine_fornitore');
  expect(percorsoCompito('riordino')).toBe('documenti/ordine_fornitore');
  expect(percorsoCompito('inventario')).toBe('inventario');
  expect(azioneCompito('reso_cliente')).toBe('reso');
  expect(azioneCompito('fattura_acquisto')).toBe('fattura');
  expect(azioneCompito('boh')).toBeNull();
});

test('blocco per scorta spiega il riordino', () => {
  expect(spiegaBlocco('scorta insufficiente')).toContain('riordino');
  expect(spiegaBlocco(null)).toBe('Compito in attesa.');
});
