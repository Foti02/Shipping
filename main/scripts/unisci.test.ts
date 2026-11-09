import { expect, test } from 'vitest';
import { unisci } from './unisci.mjs';

const esito = (piattaforma: string, versione: string) => ({ piattaforma, versione, file: `f-${piattaforma}-${versione}`, url: `https://h/${piattaforma}/${versione}` });

test('un esito sostituisce la piattaforma e lascia l altra', () => {
  const prima = { windows: { versione: '0.1.0', file: 'a', url: 'u' }, mac: { versione: '0.1.0', file: 'b', url: 'v' } };
  const r = unisci(prima, [esito('windows', '0.2.0')]);
  expect(r.windows.versione).toBe('0.2.0');
  expect(r.mac).toEqual(prima.mac);
});

test('senza latest.json precedente usa solo gli esiti', () => {
  const r = unisci(null, [esito('mac', '0.2.0')]);
  expect(r.mac.file).toBe('f-mac-0.2.0');
  expect('windows' in r).toBe(false);
});
