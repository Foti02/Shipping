import { expect, test } from 'vitest';
import { chiaveOs, haAggiornamento, leggiLatest } from './aggiornamenti';

const p = (versione: string) => ({ versione, file: `x-${versione}.exe`, url: `https://h/x-${versione}.exe` });

test('legge solo piattaforme ben formate', () => {
  expect(leggiLatest({ windows: p('0.2.0'), mac: { versione: 1 } })).toEqual({ windows: p('0.2.0'), mac: undefined });
  expect(leggiLatest(null)).toEqual({ windows: undefined, mac: undefined });
  expect(leggiLatest('boh')).toEqual({ windows: undefined, mac: undefined });
});

test('aggiornamento disponibile solo se piu nuovo', () => {
  expect(haAggiornamento(p('0.10.0'), '0.9.0')).toBe(true);
  expect(haAggiornamento(p('0.1.0'), '0.1.0')).toBe(false);
  expect(haAggiornamento(undefined, '0.1.0')).toBe(false);
});

test('sistema operativo', () => {
  expect(chiaveOs('MacIntel')).toBe('mac');
  expect(chiaveOs('Win32')).toBe('windows');
});
