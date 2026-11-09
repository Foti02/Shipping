// Logica pura della schermata Articoli: numeri all'italiana, prezzo di vendita, lettura del CSV di importazione.

/** "12,50" / "1.234,56" / "12.5" -> numero; null se vuoto, NaN se non valido. Senza virgola il punto e' decimale. */
export function leggiNumero(testo: string): number | null {
  const s = testo.replace(/[\s€]/g, '');
  if (s === '') return null;
  const n = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : NaN;
}

/** Importo in euro (testo) -> centesimi interi; null/NaN come leggiNumero. */
export function euroInCent(testo: string): number | null {
  const n = leggiNumero(testo);
  return n === null || Number.isNaN(n) ? n : Math.round(n * 100);
}

export const centInEuro = (cent: number) => (cent / 100).toFixed(2).replace('.', ',');
export const numeroInTesto = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

/** Come nel database (0004: round(acquisto * (1 + ricarico/100))): listino = acquisto + ricarico; netto dopo lo sconto fisso; ivato con IVA. Tutto in centesimi. */
export function prezzoVendita(acquistoCent: number, ricaricoPerc: number, scontoPerc: number, ivaPerc: number) {
  const listino = Math.round(acquistoCent * (1 + ricaricoPerc / 100));
  const netto = Math.round(listino * (1 - scontoPerc / 100));
  const ivato = Math.round(netto * (1 + ivaPerc / 100));
  return { listino, netto, ivato, acquistoIvato: Math.round(acquistoCent * (1 + ivaPerc / 100)) };
}

// ---------------------------------------------------------------- CSV

/** Divide il testo CSV in righe di celle (virgolette doppie, "" per il carattere "). Il separatore e' ";" (o tab/virgola se ";" manca). */
export function dividiCsv(testo: string): string[][] {
  const t = testo.replace(/^﻿/, '');
  const primaRiga = t.split(/\r?\n/, 1)[0];
  const sep = primaRiga.includes(';') ? ';' : primaRiga.includes('\t') ? '\t' : ',';
  const righe: string[][] = [];
  let riga: string[] = [];
  let cella = '';
  let dentro = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dentro) {
      if (c === '"' && t[i + 1] === '"') {
        cella += '"';
        i++;
      } else if (c === '"') dentro = false;
      else cella += c;
    } else if (c === '"') dentro = true;
    else if (c === sep) {
      riga.push(cella);
      cella = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      riga.push(cella);
      cella = '';
      righe.push(riga);
      riga = [];
    } else cella += c;
  }
  if (cella !== '' || riga.length) {
    riga.push(cella);
    righe.push(riga);
  }
  return righe.filter((r) => r.some((c) => c.trim() !== ''));
}

export const COLONNE_CSV = ['matricola', 'descrizione', 'um', 'categoria', 'prezzo_acquisto', 'iva', 'giacenza_iniziale'] as const;

export interface RigaCsv {
  /** Numero della riga dati nel file (la prima dopo l'intestazione e' 1). */
  riga: number;
  /** Chiavi di api_articoli_importa; le celle vuote non compaiono, cosi' non cancellano dati gia' presenti. */
  dati: Record<string, string | number>;
  errore?: string;
}

/** Legge il CSV di importazione. Con intestazione (una cella "matricola") le colonne si riconoscono per nome e le extra si ignorano, senza per posizione. */
export function analizzaCsv(testo: string): RigaCsv[] {
  const celle = dividiCsv(testo);
  let indice: number[] = COLONNE_CSV.map((_, i) => i);
  if (celle[0]?.some((n) => n.trim().toLowerCase() === 'matricola')) {
    const nomi = celle.shift()!.map((n) => n.trim().toLowerCase());
    indice = COLONNE_CSV.map((c) => nomi.indexOf(c));
  }
  return celle.map((r, k) => {
    const v = (i: number) => (indice[i] >= 0 ? (r[indice[i]] ?? '').trim() : '');
    const dati: RigaCsv['dati'] = {};
    const errori: string[] = [];
    if (v(0) === '') errori.push('matricola mancante');
    else dati.matricola = v(0);
    if (v(1) === '') errori.push('descrizione mancante');
    else dati.descrizione = v(1);
    if (v(2)) dati.um = v(2);
    if (v(3)) dati.categoria = v(3);
    const numero = (i: number, nome: string, chiave: string, ok: (n: number) => boolean, conv = (n: number) => n) => {
      if (!v(i)) return;
      const n = leggiNumero(v(i));
      if (n === null || Number.isNaN(n) || !ok(n)) errori.push(`${nome} non valido`);
      else dati[chiave] = conv(n);
    };
    numero(4, 'prezzo di acquisto', 'prezzo_acquisto_cent', (n) => n >= 0, (n) => Math.round(n * 100));
    numero(5, 'IVA', 'iva_perc', (n) => n >= 0 && n <= 100);
    numero(6, 'giacenza iniziale', 'giacenza_iniziale', (n) => n >= 0);
    return { riga: k + 1, dati, errore: errori.length ? errori.join(', ') : undefined };
  });
}
