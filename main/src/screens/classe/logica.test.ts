import { expect, test } from 'vitest';
import { dettaglioAttivita, etichettaAzione, etichettaPagina, percentuale, tempoRelativo } from './logica';

const T = Date.parse('2026-11-09T12:00:00Z');
const fa = (s: number) => new Date(T - s * 1000).toISOString();

test('tempo relativo', () => {
  expect(tempoRelativo(null, T)).toBe('mai');
  expect(tempoRelativo(fa(3), T)).toBe('adesso');
  expect(tempoRelativo(fa(-30), T)).toBe('adesso'); // futuro
  expect(tempoRelativo(fa(42), T)).toBe('42 secondi fa');
  expect(tempoRelativo(fa(60), T)).toBe('1 minuto fa');
  expect(tempoRelativo(fa(180), T)).toBe('3 minuti fa');
  expect(tempoRelativo(fa(3600), T)).toBe('1 ora fa');
  expect(tempoRelativo(fa(7300), T)).toBe('2 ore fa');
  expect(tempoRelativo(fa(86400 * 1.5), T)).toBe('ieri');
  expect(tempoRelativo(fa(86400 * 5), T)).toBe('5 giorni fa');
});

test('etichette azione, pagina e dettaglio', () => {
  expect(etichettaAzione('documento_conferma')).toBe('ha confermato un documento');
  expect(etichettaAzione('articolo.crea')).toBe('ha creato un articolo');
  expect(etichettaAzione('nuova_cosa.strana')).toBe('nuova cosa strana');
  expect(etichettaPagina('documenti/ordine_fornitore')).toBe('Documenti: ordine fornitore');
  expect(etichettaPagina('articoli')).toBe('Magazzino');
  expect(etichettaPagina(null)).toBe('');
  expect(dettaglioAttivita({ tipo: 'carico', anno: 2026, numero: 3 })).toBe('carico n. 3/2026');
  expect(dettaglioAttivita(null)).toBe('');
});


test('percentuale', () => {
  expect(percentuale(0, 0)).toBe(0);
  expect(percentuale(1, 3)).toBe(33);
  expect(percentuale(3, 3)).toBe(100);
});
