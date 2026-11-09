import { expect, test } from 'vitest';
import { nomePagina } from './heartbeat';

test('nome pagina dal percorso', () => {
  expect(nomePagina('/')).toBe('scelta_magazzino');
  expect(nomePagina('/m/abc')).toBe('cruscotto');
  expect(nomePagina('/m/abc/articoli')).toBe('articoli');
  expect(nomePagina('/m/abc/documenti/carico')).toBe('documenti/carico');
  expect(nomePagina('/docente/xyz')).toBe('docente');
});
