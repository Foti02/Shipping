import { beforeAll, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { nuovoDb, rpc, utente } from './helper';

let db: PGlite;
beforeAll(async () => { db = await nuovoDb(); });

test('il primo accesso crea profilo e magazzino personale, ed e idempotente', async () => {
  const anna = await utente(db, 'anna');
  const a = await rpc(db, anna, 'api_inizializza');
  expect(a.profilo.username).toBe('anna');
  expect(a.magazzini).toHaveLength(1);
  expect(a.magazzini[0].tipo).toBe('personale');
  const b = await rpc(db, anna, 'api_inizializza');
  expect(b.magazzini).toHaveLength(1);
});

test('senza accesso le funzioni rifiutano', async () => {
  await expect(rpc(db, null, 'api_inizializza')).rejects.toThrow('non_autenticato');
});

test('un utente non entra in un magazzino altrui', async () => {
  const bruno = await utente(db, 'bruno');
  const carla = await utente(db, 'carla');
  await rpc(db, bruno, 'api_inizializza');
  const mg = (await rpc(db, bruno, 'api_inizializza')).magazzini[0].id;
  await rpc(db, carla, 'api_inizializza');
  await expect(rpc(db, carla, 'api_heartbeat', { p_magazzino: mg, p_pagina: 'x' })).rejects.toThrow('permesso_negato');
});

test('le tabelle non si leggono direttamente dal client', async () => {
  await db.query(`set role authenticated`);
  await expect(db.query(`select * from articoli`)).rejects.toThrow();
  await db.query(`reset role`);
});
