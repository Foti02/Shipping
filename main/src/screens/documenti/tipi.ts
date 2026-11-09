import type { Azione } from '../../lib/permessi';

export type TipoDoc =
  | 'preventivo' | 'ordine_cliente' | 'ordine_fornitore' | 'carico' | 'scarico' | 'reso_cliente' | 'fattura_vendita' | 'fattura_acquisto';

export interface ConfigTipo {
  titolo: string;
  singolare: string;
  /** Azione di permesso (contratto sez. 4) necessaria per scrivere. */
  azione: Azione;
  /** Tipo di anagrafica della controparte. */
  controparte: 'cliente' | 'fornitore';
  etichettaControparte: string;
  /** Il documento muove il magazzino alla conferma. */
  movimenta: boolean;
  fattura: boolean;
  spedizione: boolean;
  /** Prezzo proposto dall'articolo: acquisto per i documenti verso fornitori. */
  prezzoAcquisto: boolean;
  /** Documento che si puo' generare da questo (catena di api_documento_genera). */
  successivo?: TipoDoc;
  /** Gruppo di schede nella testata (movimenti, ordini, fatture). */
  gruppo: 'movimenti' | 'ordini' | 'fatture';
}

export const TIPI: Record<TipoDoc, ConfigTipo> = {
  carico: { titolo: 'Carichi', singolare: 'Carico', azione: 'carico', controparte: 'fornitore', etichettaControparte: 'Fornitore', movimenta: true, fattura: false, spedizione: false, prezzoAcquisto: true, successivo: 'fattura_acquisto', gruppo: 'movimenti' },
  scarico: { titolo: 'Scarichi', singolare: 'Scarico (DDT)', azione: 'scarico', controparte: 'cliente', etichettaControparte: 'Cliente', movimenta: true, fattura: false, spedizione: true, prezzoAcquisto: false, successivo: 'fattura_vendita', gruppo: 'movimenti' },
  reso_cliente: { titolo: 'Resi', singolare: 'Reso da cliente', azione: 'reso', controparte: 'cliente', etichettaControparte: 'Cliente', movimenta: true, fattura: false, spedizione: false, prezzoAcquisto: false, gruppo: 'movimenti' },
  ordine_fornitore: { titolo: 'Ordini fornitore', singolare: 'Ordine fornitore', azione: 'ordine_fornitore', controparte: 'fornitore', etichettaControparte: 'Fornitore', movimenta: false, fattura: false, spedizione: false, prezzoAcquisto: true, successivo: 'carico', gruppo: 'ordini' },
  ordine_cliente: { titolo: 'Ordini cliente', singolare: 'Ordine cliente', azione: 'ordine_cliente', controparte: 'cliente', etichettaControparte: 'Cliente', movimenta: false, fattura: false, spedizione: true, prezzoAcquisto: false, successivo: 'scarico', gruppo: 'ordini' },
  preventivo: { titolo: 'Preventivi', singolare: 'Preventivo', azione: 'preventivo', controparte: 'cliente', etichettaControparte: 'Cliente', movimenta: false, fattura: false, spedizione: false, prezzoAcquisto: false, successivo: 'ordine_cliente', gruppo: 'ordini' },
  fattura_vendita: { titolo: 'Fatture di vendita', singolare: 'Fattura di vendita', azione: 'fattura', controparte: 'cliente', etichettaControparte: 'Cliente', movimenta: false, fattura: true, spedizione: false, prezzoAcquisto: false, gruppo: 'fatture' },
  fattura_acquisto: { titolo: 'Fatture di acquisto', singolare: 'Fattura di acquisto', azione: 'fattura', controparte: 'fornitore', etichettaControparte: 'Fornitore', movimenta: false, fattura: true, spedizione: false, prezzoAcquisto: true, gruppo: 'fatture' },
};

export const GRUPPI: Record<ConfigTipo['gruppo'], TipoDoc[]> = {
  movimenti: ['carico', 'scarico', 'reso_cliente'],
  ordini: ['ordine_fornitore', 'ordine_cliente', 'preventivo'],
  fatture: ['fattura_vendita', 'fattura_acquisto'],
};

export const eTipoDoc = (t: string | undefined): t is TipoDoc => !!t && t in TIPI;

export const STATI_DOC = [
  { value: '', label: 'Tutti gli stati' },
  { value: 'bozza', label: 'Bozza' },
  { value: 'confermato', label: 'Confermato' },
  { value: 'evaso', label: 'Evaso' },
  { value: 'annullato', label: 'Annullato' },
];

export const PASSI_SPEDIZIONE = [
  { id: 'da_preparare', testo: 'Da preparare' },
  { id: 'preparato', testo: 'Preparato' },
  { id: 'spedito', testo: 'Spedito' },
  { id: 'consegnato', testo: 'Consegnato' },
];

// Forme restituite dalle api_* (0004_documenti.sql, commento "-- ritorna:").
export interface RigaElenco {
  id: string; tipo: TipoDoc; anno: number; numero: number | null; data: string; stato: string; stato_spedizione: string | null;
  anagrafica_id: string | null; anagrafica: string | null; titolo: string | null; totale_cent: number; pagato: boolean; n_righe: number;
}
export interface Collegato { id: string; tipo: TipoDoc; anno: number; numero: number | null; stato: string }
export interface RigaDocumento {
  id: string; posizione: number; articolo_id: string | null; descrizione: string; qta: number | string; prezzo_cent: number | string;
  sconto_perc: number | string; iva_perc: number | string; inps_perc: number | string; ritenuta_perc: number | string;
  netto_cent: number; imposta_cent: number; totale_cent: number | string; articolo_matricola: string | null; um: string | null;
  giacenza: number | string | null;
}
export interface Documento {
  id: string; tipo: TipoDoc; anno: number; numero: number | null; data: string; stato: string; stato_spedizione: string | null;
  anagrafica_id: string | null; anagrafica: { id: string; codice: string | null; ragione_sociale: string; tipo: string } | null;
  titolo: string | null; banca: string | null; iban: string | null; condizioni_pagamento: string | null; pagato: boolean; note: string | null;
  imponibile_cent: number | string; imposta_cent: number | string; inps_cent: number | string; ritenuta_cent: number | string; totale_cent: number | string;
}
export interface DocumentoCompleto { documento: Documento; righe: RigaDocumento[]; origine: Collegato | null; derivati: Collegato[] }

/** "Bozza" o "5/2026". */
export const numeroDoc = (d: { numero: number | null; anno: number }) => (d.numero == null ? 'Bozza' : `${d.numero}/${d.anno}`);

/** "Scarico (DDT)" -> "scarico (DDT)": per le frasi, senza abbassare le sigle. */
export const minuscolo = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
