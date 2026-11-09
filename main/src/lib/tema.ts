/** Tema dell'interfaccia: i valori coincidono con `data-theme` su <html>; 'auto' toglie l'attributo e segue il sistema. */
export type Tema = 'light' | 'dark' | 'auto';

export const CHIAVE_TEMA = 'shipping-tema';
// L'ordine del ciclo del pulsante: automatico, chiaro, scuro.
const ORDINE: Tema[] = ['auto', 'light', 'dark'];

export const eTema = (v: unknown): v is Tema => v === 'light' || v === 'dark' || v === 'auto';

export function leggiTema(): Tema {
  try {
    const v = localStorage.getItem(CHIAVE_TEMA);
    return eTema(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function salvaTema(t: Tema) {
  try {
    localStorage.setItem(CHIAVE_TEMA, t);
  } catch { /* nessun salvataggio: il tema vale fino alla chiusura della pagina */ }
}

export function applicaTema(t: Tema, radice: Pick<Element, 'setAttribute' | 'removeAttribute'> = document.documentElement) {
  if (t === 'auto') radice.removeAttribute('data-theme');
  else radice.setAttribute('data-theme', t);
}

export const prossimoTema = (t: Tema): Tema => ORDINE[(ORDINE.indexOf(t) + 1) % ORDINE.length];
