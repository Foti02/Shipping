import { beforeAll, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { nuovoDb, rpc, utente } from './helper';

let db: PGlite;
let prof: string, anna: string, classe: string;

beforeAll(async () => {
  db = await nuovoDb();
  prof = await utente(db, 'prof', 'docente');
  anna = await utente(db, 'anna');
  await rpc(db, prof, 'api_inizializza');
  await rpc(db, anna, 'api_inizializza');
  const c = await rpc(db, prof, 'api_classe_crea', { p_nome: 'Classe A' });
  classe = c.id;
  await rpc(db, anna, 'api_classe_entra', { p_codice: c.codice_ingresso });
});

test('il docente vede gli scenari con l avanzamento dei compiti, dal piu recente', async () => {
  expect(await rpc(db, prof, 'api_scenari_elenco', { p_magazzino: classe })).toEqual([]);
  await rpc(db, prof, 'api_scenario_genera', { p_magazzino: classe, p_nome: 'Uno', p_config: { seed: 1, n_articoli: 6 } });
  await rpc(db, prof, 'api_scenario_genera', { p_magazzino: classe, p_nome: 'Due', p_config: { seed: 2, n_articoli: 6 } });
  const e = await rpc(db, prof, 'api_scenari_elenco', { p_magazzino: classe });
  expect(e.map((s: any) => s.nome)).toEqual(['Due', 'Uno']);
  expect(e[0].stato).toBe('bozza');
  expect(Number(e[0].compiti.totale)).toBeGreaterThan(0);
  expect(Number(e[0].compiti.completati)).toBe(0);
});

test('uno studente non puo elencare gli scenari', async () => {
  await expect(rpc(db, anna, 'api_scenari_elenco', { p_magazzino: classe })).rejects.toThrow('permesso_negato');
});
