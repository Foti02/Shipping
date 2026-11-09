import { expect, test } from 'vitest';
import { PASSWORD_MIN, confermaScritta, haErrori, validaNome, validaPassword, validaUsername } from './account';

test('username: 3-20 caratteri a-z 0-9 . _ -', () => {
  for (const ok of ['abc', 'francesco_foti', 'a.b-c_9', 'x'.repeat(20)]) expect(validaUsername(ok), ok).toBeUndefined();
  for (const no of ['ab', 'x'.repeat(21), 'Anna', 'ann a', 'anna!', 'àèì', '']) expect(validaUsername(no), no).toBeDefined();
});

test('nominativo: non vuoto', () => {
  expect(validaNome('Anna')).toBeUndefined();
  expect(validaNome('   ')).toBeDefined();
});

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
