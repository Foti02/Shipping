import { expect, test } from 'vitest';
import { PASSWORD_MIN, confermaScritta, haErrori, validaPassword } from './account';

test('password: minimo, conferma uguale, nuova diversa dalla vecchia', () => {
  expect(haErrori(validaPassword('segreta', 'segreta'))).toBe(false);
  expect(validaPassword('a'.repeat(PASSWORD_MIN - 1), 'a'.repeat(PASSWORD_MIN - 1)).nuova).toBeDefined();
  expect(validaPassword('segreta', 'altra').conferma).toBeDefined();
  expect(validaPassword('segreta', 'segreta', '').vecchia).toBeDefined();
  expect(validaPassword('segreta', 'segreta', 'segreta').nuova).toMatch(/diversa/);
  expect(haErrori(validaPassword('segreta', 'segreta', 'demo'))).toBe(false);
});

test('conferma scritta: esattamente lo username, mai vuota', () => {
  expect(confermaScritta('anna', 'anna')).toBe(true);
  expect(confermaScritta(' anna ', 'anna')).toBe(true);
  expect(confermaScritta('Anna', 'anna')).toBe(false);
  expect(confermaScritta('ann', 'anna')).toBe(false);
  expect(confermaScritta('', '')).toBe(false);
});

test('password: minimo 6 caratteri e massimo 72 byte', async () => {
  const { passwordOk } = await import('./account');
  expect(passwordOk('12345')).toBe(false);
  expect(passwordOk('123456')).toBe(true);
  expect(passwordOk('a'.repeat(72))).toBe(true);
  expect(passwordOk('a'.repeat(73))).toBe(false);
  expect(passwordOk('è'.repeat(37))).toBe(false); // 37 lettere accentate = 74 byte
});
