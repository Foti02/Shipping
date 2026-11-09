// Logica pura delle anagrafiche: tipi, validazioni leggere, filtro, CSV.

export type Tipo = 'cliente' | 'fornitore';

export interface Anagrafica {
  id: string;
  tipo: Tipo;
  codice: string | null;
  ragione_sociale: string;
  indirizzo: string | null;
  comune: string | null;
  email: string | null;
  sito_web: string | null;
  banca: string | null;
  iban: string | null;
  cod_fisc: string | null;
  p_iva: string | null;
  telefono: string | null;
  cellulare: string | null;
  sconto_perc: number | string;
  lead_time_giorni: number;
  note: string | null;
}

/** Valori del modulo: tutto testo, convertito all'invio. */
export interface Modulo {
  codice: string;
  ragione_sociale: string;
  indirizzo: string;
  comune: string;
  email: string;
  sito_web: string;
  banca: string;
  iban: string;
  cod_fisc: string;
  p_iva: string;
  telefono: string;
  cellulare: string;
  sconto_perc: string;
  lead_time_giorni: string;
  note: string;
}

export const moduloDa = (a?: Anagrafica): Modulo => ({
  codice: a?.codice ?? '',
  ragione_sociale: a?.ragione_sociale ?? '',
  indirizzo: a?.indirizzo ?? '',
  comune: a?.comune ?? '',
  email: a?.email ?? '',
  sito_web: a?.sito_web ?? '',
  banca: a?.banca ?? '',
  iban: a?.iban ?? '',
  cod_fisc: a?.cod_fisc ?? '',
  p_iva: a?.p_iva ?? '',
  telefono: a?.telefono ?? '',
  cellulare: a?.cellulare ?? '',
  sconto_perc: a ? String(a.sconto_perc ?? 0).replace('.', ',') : '0',
  lead_time_giorni: String(a?.lead_time_giorni ?? 3),
  note: a?.note ?? '',
});

const vuoto = (s: string) => s.trim() === '';

/** Numero con virgola o punto decimale; NaN se non e' un numero. */
export const numero = (s: string) => (vuoto(s) ? NaN : Number(s.trim().replace(',', '.')));

export const emailValida = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
export const pivaValida = (s: string) => /^\d{11}$/.test(s.trim());
export const codFiscValido = (s: string) => /^[A-Za-z0-9]{16}$/.test(s.trim()) || /^\d{11}$/.test(s.trim());
export function ibanValido(s: string) {
  const x = s.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(x)) return false;
  return !x.startsWith('IT') || x.length === 27;
}

/** Avvisi (non bloccanti) sui campi compilati. Chiave = campo del modulo. */
export function avvisi(valori: Partial<Modulo>): Partial<Record<keyof Modulo, string>> {
  const m = { email: '', iban: '', p_iva: '', cod_fisc: '', ...valori };
  const r: Partial<Record<keyof Modulo, string>> = {};
  if (!vuoto(m.email) && !emailValida(m.email)) r.email = 'L\'e-mail non sembra corretta (esempio: nome@dominio.it).';
  if (!vuoto(m.iban) && !ibanValido(m.iban)) r.iban = 'IBAN non valido: 2 lettere, 2 cifre e il resto (in Italia 27 caratteri in tutto).';
  if (!vuoto(m.p_iva) && !pivaValida(m.p_iva)) r.p_iva = 'La partita IVA ha 11 cifre.';
  if (!vuoto(m.cod_fisc) && !codFiscValido(m.cod_fisc)) r.cod_fisc = 'Il codice fiscale ha 16 caratteri (11 cifre per le società).';
  return r;
}

/** Errori che bloccano il salvataggio (il database li rifiuterebbe comunque). */
export function errori(m: Modulo, fornitore: boolean): Partial<Record<keyof Modulo, string>> {
  const r: Partial<Record<keyof Modulo, string>> = {};
  if (vuoto(m.ragione_sociale)) r.ragione_sociale = 'La ragione sociale è obbligatoria.';
  const s = vuoto(m.sconto_perc) ? 0 : numero(m.sconto_perc);
  if (isNaN(s) || s < 0 || s > 100) r.sconto_perc = 'Lo sconto è un numero tra 0 e 100.';
  if (fornitore) {
    const g = numero(m.lead_time_giorni);
    if (isNaN(g) || g < 0 || !Number.isInteger(g)) r.lead_time_giorni = 'I giorni di consegna sono un numero intero, zero o più.';
  }
  return r;
}

const testoOrNull = (s: string) => (vuoto(s) ? null : s.trim());

/** Dati per api_anagrafica_salva. `id` presente = modifica (il tipo non cambia). */
export function datiPerSalva(m: Modulo, tipo: Tipo, id?: string): Record<string, unknown> {
  const d: Record<string, unknown> = {
    codice: testoOrNull(m.codice),
    ragione_sociale: m.ragione_sociale.trim(),
    indirizzo: testoOrNull(m.indirizzo),
    comune: testoOrNull(m.comune),
    email: testoOrNull(m.email),
    sito_web: testoOrNull(m.sito_web),
    banca: testoOrNull(m.banca),
    iban: testoOrNull(m.iban),
    cod_fisc: testoOrNull(m.cod_fisc),
    p_iva: testoOrNull(m.p_iva),
    telefono: testoOrNull(m.telefono),
    cellulare: testoOrNull(m.cellulare),
    sconto_perc: vuoto(m.sconto_perc) ? 0 : numero(m.sconto_perc),
    note: testoOrNull(m.note),
  };
  if (tipo === 'fornitore') d.lead_time_giorni = numero(m.lead_time_giorni);
  if (id) d.id = id;
  else d.tipo = tipo;
  return d;
}

export type Filtro = 'tutti' | Tipo;

/** Filtra per tipo e testo libero (maiuscole e accenti ignorati). */
export function filtra(righe: Anagrafica[], filtro: Filtro, cerca: string): Anagrafica[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(cerca.trim());
  return righe.filter(
    (r) =>
      (filtro === 'tutti' || r.tipo === filtro) &&
      (!q ||
        norm([r.ragione_sociale, r.codice, r.comune, r.indirizzo, r.p_iva, r.cod_fisc, r.email, r.telefono, r.cellulare].filter(Boolean).join(' ')).includes(q)),
  );
}

export const TIPO_DOCUMENTO: Record<string, string> = {
  preventivo: 'Preventivo',
  ordine_cliente: 'Ordine cliente',
  ordine_fornitore: 'Ordine fornitore',
  carico: 'Carico',
  scarico: 'Scarico',
  reso_cliente: 'Reso cliente',
  fattura_vendita: 'Fattura di vendita',
  fattura_acquisto: 'Fattura di acquisto',
};

export const righeCsv = (righe: Anagrafica[]) =>
  righe.map((r) => ({
    Tipo: r.tipo === 'cliente' ? 'Cliente' : 'Fornitore',
    Codice: r.codice ?? '',
    'Ragione sociale': r.ragione_sociale,
    Indirizzo: r.indirizzo ?? '',
    Comune: r.comune ?? '',
    Telefono: r.telefono ?? '',
    Cellulare: r.cellulare ?? '',
    'E-mail': r.email ?? '',
    'Codice fiscale': r.cod_fisc ?? '',
    'Partita IVA': r.p_iva ?? '',
    'Sconto %': r.sconto_perc,
    Banca: r.banca ?? '',
    IBAN: r.iban ?? '',
  }));
