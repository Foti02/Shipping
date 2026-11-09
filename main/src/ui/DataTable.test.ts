import { expect, test } from 'vitest';
import { ordina } from './DataTable';

test('ordina numeri, testi naturali e vuoti in fondo', () => {
  const v = (x: (string | number | null)[], verso: 1 | -1 = 1) => ordina(x, (r) => r, verso);
  expect(v([10, 2, 33])).toEqual([2, 10, 33]);
  expect(v(['ART10', 'art2', 'ART1'])).toEqual(['ART1', 'art2', 'ART10']);
  expect(v([3, null, 1])).toEqual([1, 3, null]);
  expect(v([3, null, 1], -1)).toEqual([3, 1, null]);
});
