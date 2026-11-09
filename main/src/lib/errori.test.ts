import { expect, test } from 'vitest';
import { MESSAGGIO_GENERICO, erroreDb, messaggioErrore } from './errori';

const CODICI = ['non_autenticato', 'permesso_negato', 'non_trovato', 'dato_non_valido', 'giacenza_insufficiente', 'codice_non_valido', 'conferma_errata', 'stato_non_valido', 'gia_esiste'];

test('ogni codice del contratto ha un testo proprio', () => {
  const testi = CODICI.map((c) => messaggioErrore(c));
  for (const t of testi) expect(t).not.toBe(MESSAGGIO_GENERICO);
  expect(new Set(testi).size).toBe(CODICI.length);
});

test('il detail di stato_non_valido precisa il motivo (possiede_classi, ultimo_admin)', () => {
  const generico = messaggioErrore('stato_non_valido');
  const classi = messaggioErrore(erroreDb('stato_non_valido', 'possiede_classi'));
  const admin = messaggioErrore(erroreDb('stato_non_valido', 'ultimo_admin '));
  expect(classi).toMatch(/classi/);
  expect(admin).toMatch(/ultimo amministratore/);
  expect(new Set([generico, classi, admin]).size).toBe(3);
  expect(messaggioErrore(erroreDb('stato_non_valido', 'boh'))).toBe(generico); // detail sconosciuto: resta il codice
  expect(messaggioErrore(erroreDb('stato_non_valido'))).toBe(generico);
  expect(messaggioErrore(erroreDb('credenziali_errate'))).toBe(messaggioErrore('credenziali_errate'));
});

test('accetta Error e ricade sul generico', () => {
  expect(messaggioErrore(new Error('giacenza_insufficiente'))).toBe(messaggioErrore('giacenza_insufficiente'));
  expect(messaggioErrore('boh')).toBe(MESSAGGIO_GENERICO);
  expect(messaggioErrore(undefined)).toBe(MESSAGGIO_GENERICO);
  expect(messaggioErrore(new Error('Failed to fetch'))).toBe(MESSAGGIO_GENERICO);
});
