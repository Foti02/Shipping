import { expect, test } from 'vitest';
import { data, dataOra, euro, qta } from './formati';

const nb = (s: string) => s.replace(/ /g, ' ');

test('euro da centesimi', () => {
  expect(nb(euro(123456))).toBe('1.234,56 €');
  expect(nb(euro(0))).toBe('0,00 €');
  expect(nb(euro(-50))).toBe('-0,50 €');
  expect(nb(euro(null))).toBe('0,00 €');
});

test('quantita italiane', () => {
  expect(qta(1234.5)).toBe('1.234,5');
  expect(qta('12.250')).toBe('12,25');
  expect(qta(0.0004)).toBe('0');
  expect(qta(undefined)).toBe('0');
});

test('date italiane, senza spostamenti di fuso', () => {
  expect(data('2026-11-06')).toBe('06/11/2026');
  expect(data(new Date(2026, 0, 5))).toBe('05/01/2026');
  expect(data(null)).toBe('');
  expect(data('non una data')).toBe('');
  expect(dataOra(new Date(2026, 10, 6, 13, 42))).toMatch(/06\/11\/2026.*13:42/);
});
