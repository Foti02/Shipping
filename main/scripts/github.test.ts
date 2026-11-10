import { expect, test } from 'vitest';
import { pubblicaAsset } from './github.mjs';

const risp = (stato: number, corpo: unknown = {}) => ({ ok: stato < 400, status: stato, json: async () => corpo, text: async () => JSON.stringify(corpo) }) as unknown as Response;

function finto(risposte: Response[]) {
  const chiamate: { url: string; metodo: string }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    chiamate.push({ url, metodo: init?.method ?? 'GET' });
    return risposte.shift()!;
  }) as unknown as typeof fetch;
  return { fn, chiamate };
}
const base = { repo: 'o/r', token: 't', tag: 'v1.0.0', nomeFile: 'a.exe', corpo: Buffer.from('x') };

test('crea la release se manca e carica il file', async () => {
  const { fn, chiamate } = finto([risp(404), risp(201, { id: 7, assets: [] }), risp(201, { browser_download_url: 'https://dl/a.exe' })]);
  expect(await pubblicaAsset({ ...base, fetchFn: fn })).toBe('https://dl/a.exe');
  expect(chiamate.map((c) => c.metodo)).toEqual(['GET', 'POST', 'POST']);
  expect(chiamate[2].url).toContain('/releases/7/assets?name=a.exe');
});

test('se l altro job crea la release insieme, la rilegge', async () => {
  const { fn } = finto([risp(404), risp(422), risp(200, { id: 9, assets: [] }), risp(201, { browser_download_url: 'u' })]);
  expect(await pubblicaAsset({ ...base, fetchFn: fn })).toBe('u');
});

test('rilancio: toglie l allegato con lo stesso nome prima di caricare', async () => {
  const { fn, chiamate } = finto([risp(200, { id: 3, assets: [{ id: 55, name: 'a.exe' }] }), risp(204), risp(201, { browser_download_url: 'u' })]);
  await pubblicaAsset({ ...base, fetchFn: fn });
  expect(chiamate.map((c) => c.metodo)).toEqual(['GET', 'DELETE', 'POST']);
  expect(chiamate[1].url).toContain('/assets/55');
});

test('errori chiari', async () => {
  await expect(pubblicaAsset({ ...base, fetchFn: finto([risp(401)]).fn })).rejects.toThrow('401');
  await expect(pubblicaAsset({ ...base, fetchFn: finto([risp(200, { id: 1, assets: [] }), risp(422, { m: 'x' })]).fn })).rejects.toThrow('a.exe');
});

test('connessione caduta dopo l invio: se il file e gia completo non lo ricarica', async () => {
  let n = 0;
  const chiamate: string[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    chiamate.push(init?.method ?? 'GET');
    if (init?.method === 'POST') throw new TypeError('fetch failed');
    n++;
    return n === 1 ? risp(200, { id: 3, assets: [] }) : risp(200, { id: 3, assets: [{ id: 5, name: 'a.exe', state: 'uploaded', size: 1, browser_download_url: 'gia' }] });
  }) as unknown as typeof fetch;
  expect(await pubblicaAsset({ ...base, fetchFn: fn })).toBe('gia');
  expect(chiamate).toEqual(['GET', 'POST', 'GET']);
});

test('connessione caduta e file non arrivato: riprova, poi si arrende dopo 3 tentativi', async () => {
  let post = 0;
  const fn = (async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { post++; throw new TypeError('fetch failed'); }
    return risp(200, { id: 3, assets: [] });
  }) as unknown as typeof fetch;
  await expect(pubblicaAsset({ ...base, fetchFn: fn })).rejects.toThrow('fetch failed');
  expect(post).toBe(3);
});
