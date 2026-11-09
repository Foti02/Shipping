// Logica pura dell'agenda: griglia del mese, giorni, disposizione delle fasce orarie. Tutto in fuso locale.

export interface Scadenza {
  id: string;
  oggetto: string;
  descrizione: string | null;
  inizio: string; // timestamptz ISO
  fine: string;
  tipo: 'appuntamento' | 'scadenza';
  stato: 'in_sospeso' | 'completato';
  anagrafica_id: string | null;
  ragione_sociale?: string | null;
}

export interface Cella {
  data: Date;
  chiave: string;
  delMese: boolean;
}

const due = (n: number) => String(n).padStart(2, '0');

/** "2026-11-06" nel fuso locale. */
export const chiave = (d: Date) => `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;

export const inizioGiorno = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Somma giorni di calendario (sicuro col cambio dell'ora legale). */
export const aggiungiGiorni = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

/** Stesso giorno del mese spostato di n mesi, ridotto all'ultimo giorno se il mese e' piu' corto. */
export function aggiungiMesi(d: Date, n: number) {
  const primo = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const ultimo = new Date(primo.getFullYear(), primo.getMonth() + 1, 0).getDate();
  return new Date(primo.getFullYear(), primo.getMonth(), Math.min(d.getDate(), ultimo));
}

/** Settimane intere (lunedi' - domenica) che coprono il mese di `d`: da 28 a 42 celle. */
export function grigliaMese(d: Date): Cella[] {
  const primo = new Date(d.getFullYear(), d.getMonth(), 1);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const da = aggiungiGiorni(primo, -((primo.getDay() + 6) % 7));
  const a = aggiungiGiorni(ultimo, 6 - ((ultimo.getDay() + 6) % 7));
  const celle: Cella[] = [];
  for (let x = da; x <= a; x = aggiungiGiorni(x, 1)) celle.push({ data: x, chiave: chiave(x), delMese: x.getMonth() === d.getMonth() });
  return celle;
}

/** Scadenze per giorno (chiave): una voce che attraversa piu' giorni compare in tutti (al massimo 62). */
export function perGiorno(lista: Scadenza[]): Map<string, Scadenza[]> {
  const m = new Map<string, Scadenza[]>();
  for (const s of lista) {
    const ini = new Date(s.inizio);
    const fine = new Date(s.fine);
    let x = inizioGiorno(ini);
    for (let i = 0; i < 62 && (x < fine || i === 0); i++, x = aggiungiGiorni(x, 1)) {
      const k = chiave(x);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
  }
  for (const v of m.values()) v.sort((a, b) => +new Date(a.inizio) - +new Date(b.inizio));
  return m;
}

/** Per <input type="datetime-local">: ISO -> "2026-11-06T10:30" nel fuso locale. */
export const aInputLocale = (iso: string | Date) => {
  const d = new Date(iso);
  return `${chiave(d)}T${due(d.getHours())}:${due(d.getMinutes())}`;
};

/** "2026-11-06T10:30" (ora locale) -> ISO UTC per il database; null se non valido. */
export function daInputLocale(s: string): string | null {
  const d = new Date(s);
  return s && !isNaN(+d) ? d.toISOString() : null;
}

export interface Fascia {
  scadenza: Scadenza;
  /** minuti dall'inizio del giorno */
  da: number;
  a: number;
  col: number;
  colonne: number;
}

const MIN_FASCIA = 30;

/** Posiziona le scadenze di un giorno su fasce orarie; quelle che si sovrappongono si dividono la larghezza. */
export function fasceDelGiorno(giorno: Date, lista: Scadenza[]): Fascia[] {
  const g0 = inizioGiorno(giorno);
  const g1 = aggiungiGiorni(g0, 1);
  const min = (d: Date) => Math.round((+d - +g0) / 60000);
  const voci = lista
    .map((s) => {
      const da = min(new Date(Math.max(+new Date(s.inizio), +g0)));
      const a = Math.max(min(new Date(Math.min(+new Date(s.fine), +g1))), da + MIN_FASCIA);
      return { scadenza: s, da, a, col: 0, colonne: 1 };
    })
    .sort((x, y) => x.da - y.da || y.a - x.a);
  // Gruppi di sovrapposti: colonna libera piu' a sinistra, numero di colonne uguale per tutto il gruppo.
  let gruppo: typeof voci = [];
  let fineGruppo = 0;
  const chiudi = () => gruppo.forEach((v) => (v.colonne = Math.max(...gruppo.map((x) => x.col)) + 1));
  for (const v of voci) {
    if (gruppo.length && v.da >= fineGruppo) {
      chiudi();
      gruppo = [];
    }
    const occupate = new Set(gruppo.filter((x) => x.a > v.da).map((x) => x.col));
    while (occupate.has(v.col)) v.col++;
    gruppo.push(v);
    fineGruppo = Math.max(fineGruppo, v.a);
  }
  chiudi();
  return voci;
}
