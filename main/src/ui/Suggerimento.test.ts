import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AIUTI } from '../lib/aiuti';
import { RITARDO_SUGGERIMENTO_MS, creaTemporizzatore, posiziona } from './Suggerimento';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const prova = () => {
  const eventi: boolean[] = [];
  return { eventi, t: creaTemporizzatore(RITARDO_SUGGERIMENTO_MS, (a) => eventi.push(a)) };
};

test('il ritardo e\' 1,5 secondi: niente prima, apre allo scadere', () => {
  const { t, eventi } = prova();
  t.avvia();
  vi.advanceTimersByTime(1499);
  expect(eventi).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(eventi).toEqual([true]);
});

test('mouseleave (chiudi) prima del ritardo annulla: non si apre mai', () => {
  const { t, eventi } = prova();
  t.avvia();
  vi.advanceTimersByTime(1000);
  t.chiudi();
  vi.advanceTimersByTime(5000);
  expect(eventi).toEqual([]);
});

test('Esc (chiudi) a riquadro aperto lo chiude una volta sola', () => {
  const { t, eventi } = prova();
  t.avvia();
  vi.advanceTimersByTime(1500);
  t.chiudi();
  t.chiudi();
  expect(eventi).toEqual([true, false]);
});

test('un nuovo avvia riparte da zero', () => {
  const { t, eventi } = prova();
  t.avvia();
  vi.advanceTimersByTime(1000);
  t.avvia();
  vi.advanceTimersByTime(1000);
  expect(eventi).toEqual([]);
  vi.advanceTimersByTime(500);
  expect(eventi).toEqual([true]);
});

test('il riquadro sta sotto se c\'e\' spazio, sopra se manca, e non esce dallo schermo', () => {
  const finestra = { width: 400, height: 600 };
  const box = { width: 240, height: 80 };
  const sotto = posiziona({ top: 100, bottom: 130, left: 10, width: 40 }, box, finestra);
  expect(sotto.sotto).toBe(true);
  expect(sotto.top).toBeGreaterThan(130);
  expect(sotto.left).toBe(8); // centrato sarebbe a sinistra dello schermo: si ferma al margine
  const sopra = posiziona({ top: 560, bottom: 590, left: 380, width: 20 }, box, finestra);
  expect(sopra.sotto).toBe(false);
  expect(sopra.top + box.height).toBeLessThanOrEqual(560);
  expect(sopra.left + box.width).toBeLessThanOrEqual(finestra.width - 8);
});

test('tutti i testi dei suggerimenti sono brevi (max 240 caratteri)', () => {
  for (const [k, v] of Object.entries(AIUTI)) {
    expect(v.length, k).toBeGreaterThan(20);
    expect(v.length, k).toBeLessThanOrEqual(240);
  }
});
