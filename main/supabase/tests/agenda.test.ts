import { beforeAll, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { nuovoDb, rpc, utente } from './helper';

let db: PGlite;
let anna: string, bruno: string, mg: string;

beforeAll(async () => {
  db = await nuovoDb(['0008']);
  anna = await utente(db, 'anna');
  bruno = await utente(db, 'bruno');
  mg = (await rpc(db, anna, 'api_inizializza')).magazzini[0].id;
  await rpc(db, bruno, 'api_inizializza');
});

test('crea, modifica, filtra per data ed elimina una scadenza', async () => {
  const s = await rpc(db, anna, 'api_scadenza_salva', {
    p_magazzino: mg, p_dati: { oggetto: 'Pagare fattura 14', inizio: '2026-11-10T09:00:00Z', fine: '2026-11-10T09:30:00Z', tipo: 'scadenza' },
  });
  expect(s.stato).toBe('in_sospeso');
  await rpc(db, anna, 'api_scadenza_salva', {
    p_magazzino: mg, p_dati: { id: s.id, oggetto: 'Pagare fattura 14', inizio: '2026-11-10T09:00:00Z', fine: '2026-11-10T09:30:00Z', tipo: 'scadenza', stato: 'completato' },
  });
  const tutte = await rpc(db, anna, 'api_scadenze_elenco', { p_magazzino: mg });
  expect(tutte).toHaveLength(1);
  expect(tutte[0].stato).toBe('completato');
  const altroMese = await rpc(db, anna, 'api_scadenze_elenco', { p_magazzino: mg, p_dal: '2026-12-01T00:00:00Z', p_al: '2027-01-01T00:00:00Z' });
  expect(altroMese).toHaveLength(0);
  await rpc(db, anna, 'api_scadenza_elimina', { p_id: s.id });
  expect(await rpc(db, anna, 'api_scadenze_elenco', { p_magazzino: mg })).toHaveLength(0);
});

test('l agenda e personale: un altro utente non vede ne tocca', async () => {
  const s = await rpc(db, anna, 'api_scadenza_salva', {
    p_magazzino: mg, p_dati: { oggetto: 'Privata', inizio: '2026-11-11T10:00:00Z', fine: '2026-11-11T11:00:00Z' },
  });
  await expect(rpc(db, bruno, 'api_scadenze_elenco', { p_magazzino: mg })).rejects.toThrow('permesso_negato');
  await expect(rpc(db, bruno, 'api_scadenza_elimina', { p_id: s.id })).rejects.toThrow('non_trovato');
});

test('dati non validi', async () => {
  await expect(rpc(db, anna, 'api_scadenza_salva', { p_magazzino: mg, p_dati: { oggetto: '', inizio: '2026-11-11T10:00:00Z' } })).rejects.toThrow('dato_non_valido');
  await expect(rpc(db, anna, 'api_scadenza_salva', { p_magazzino: mg, p_dati: { oggetto: 'x', inizio: '2026-11-11T10:00:00Z', fine: '2026-11-11T09:00:00Z' } })).rejects.toThrow('dato_non_valido');
  await expect(rpc(db, anna, 'api_scadenza_salva', { p_magazzino: mg, p_dati: { oggetto: 'x', inizio: 'non una data' } })).rejects.toThrow('dato_non_valido');
});
