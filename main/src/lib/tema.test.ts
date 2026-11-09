import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHIAVE_TEMA, applicaTema, leggiTema, prossimoTema, salvaTema } from './tema';

const finta = () => {
  const attr = new Map<string, string>();
  return { attr, setAttribute: (k: string, v: string) => void attr.set(k, v), removeAttribute: (k: string) => void attr.delete(k) };
};
const memoria = (inizio: Record<string, string> = {}) => {
  const d = { ...inizio };
  return { getItem: (k: string) => d[k] ?? null, setItem: (k: string, v: string) => void (d[k] = v), d };
};

afterEach(() => vi.unstubAllGlobals());

describe('tema', () => {
  it('il pulsante gira tra automatico, chiaro e scuro', () => {
    expect(prossimoTema('auto')).toBe('light');
    expect(prossimoTema('light')).toBe('dark');
    expect(prossimoTema('dark')).toBe('auto');
  });

  it('applica data-theme solo per chiaro e scuro, l\'automatico lo toglie', () => {
    const r = finta();
    applicaTema('dark', r);
    expect(r.attr.get('data-theme')).toBe('dark');
    applicaTema('light', r);
    expect(r.attr.get('data-theme')).toBe('light');
    applicaTema('auto', r);
    expect(r.attr.has('data-theme')).toBe(false);
  });

  it('salva e rilegge la preferenza; un valore strano vale automatico', () => {
    const m = memoria();
    vi.stubGlobal('localStorage', m);
    expect(leggiTema()).toBe('auto');
    salvaTema('dark');
    expect(m.d[CHIAVE_TEMA]).toBe('dark');
    expect(leggiTema()).toBe('dark');
    m.d[CHIAVE_TEMA] = 'viola';
    expect(leggiTema()).toBe('auto');
  });

  it('senza localStorage non solleva errori', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloccato'); }, setItem: () => { throw new Error('bloccato'); } });
    expect(leggiTema()).toBe('auto');
    expect(() => salvaTema('light')).not.toThrow();
  });
});
