import { expect, test } from 'vitest';
import { cercaPulita, fraseRegistro } from './logica';

test('frasi del registro admin', () => {
  expect(fraseRegistro({ azione: 'ruolo', bersaglio: 'anna', dettagli: { da: 'studente', a: 'docente' } })).toBe('ha cambiato il ruolo di anna da studente a docente');
  expect(fraseRegistro({ azione: 'ruolo', bersaglio: 'anna', dettagli: { da: 'docente', a: 'admin' } })).toMatch(/amministratore/);
  expect(fraseRegistro({ azione: 'password_reimposta', bersaglio: 'bruno', dettagli: {} })).toBe('ha reimpostato la password di bruno');
  expect(fraseRegistro({ azione: 'utente_elimina', bersaglio: 'carla', dettagli: null })).toBe('ha eliminato l\'utente carla');
  expect(fraseRegistro({ azione: 'account_elimina', bersaglio: 'x', dettagli: {} })).toBe('ha eliminato il proprio account');
  expect(fraseRegistro({ azione: 'classe_crea', bersaglio: null, dettagli: { nome: '3A' } })).toBe('ha creato la classe "3A"');
  expect(fraseRegistro({ azione: 'classe_trasferisci', bersaglio: 'docente', dettagli: { nome: '3A' } })).toBe('ha trasferito la classe "3A" a docente');
});

test('azioni sconosciute e dati mancanti non rompono la frase', () => {
  expect(fraseRegistro({ azione: 'qualcosa_di_nuovo', bersaglio: null, dettagli: null })).toBe('qualcosa di nuovo');
  expect(fraseRegistro({ azione: 'ruolo', bersaglio: null, dettagli: null })).toContain('un utente');
});

test('ricerca: minuscola, senza spazi ai bordi, massimo 100 caratteri (limite del database)', () => {
  expect(cercaPulita('  AnNa ')).toBe('anna');
  expect(cercaPulita('x'.repeat(150))).toHaveLength(100);
});
