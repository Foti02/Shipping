import { expect, test } from 'vitest';
import { cmp } from './semver.js';

test('confronto per posizione, non come testo', () => {
  expect(cmp('0.0.1', '0.0.0')).toBe(1);
  expect(cmp('0.1.0', '0.0.9')).toBe(1);
  expect(cmp('1.0.0', '0.9.9')).toBe(1);
  expect(cmp('0.10.0', '0.9.0')).toBe(1); // 10 > 9, non "1" < "9"
  expect(cmp('0.2.0', '0.10.0')).toBe(-1);
});

test('uguali e prefisso v', () => {
  expect(cmp('v1.2.3', '1.2.3')).toBe(0);
  expect(cmp('v0.0.0', 'v0.0.1')).toBe(-1);
});
