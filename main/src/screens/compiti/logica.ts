// Logica pura dei compiti: stato, spiegazione degli errori, schermata a cui rimandare.
import { qta } from '../../lib/formati';
import type { Azione } from '../../lib/permessi';

export type StatoCompito = 'da_fare' | 'bloccato' | 'errore' | 'completato';

export interface Compito {
  id: string;
  tipo: string;
  titolo: string;
  istruzioni: string | null;
  articolo_matricola: string | null;
  articolo_descrizione: string | null;
  controparte: string | null;
  qta: number | string | null;
  stato: string;
  motivo: string | null;
  esito: { ok?: boolean; errori?: { campo: string; atteso: unknown; trovato: unknown }[]; giacenza_ripristinata?: boolean } | null;
}

/** Ordine di attenzione: prima cio' che richiede azione (errore, bloccato), poi da fare, in fondo i completati. */
const PRIORITA: Record<string, number> = { errore: 0, bloccato: 1, da_fare: 2, completato: 3 };
export const prioritaStato = (s: string) => PRIORITA[s] ?? 2;

/** Ordina per urgenza mantenendo l'ordine originale a parita' di stato. */
export const ordinaCompiti = <T extends { stato: string }>(c: T[]): T[] =>
  c.map((x, i) => [x, i] as const).sort((a, b) => prioritaStato(a[0].stato) - prioritaStato(b[0].stato) || a[1] - b[1]).map(([x]) => x);

const CAMPI: Record<string, string> = { controparte: 'Cliente/fornitore', quantita: 'Quantità', ordine: 'Ordine', giacenza: 'Giacenza' };

/** Righe in italiano da `esito.errori`: "Quantità: richiesto 10, inserito 8". Vuoto se non c'e' nessun errore. */
export function righeErrore(esito: Compito['esito']): string[] {
  const f = (v: unknown) => (v == null || v === '' ? 'niente' : typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v)) ? qta(v as number) : String(v));
  return (esito?.errori ?? []).map((e) => `${CAMPI[e.campo] ?? e.campo}: richiesto ${f(e.atteso)}, trovato ${f(e.trovato)}`);
}

/** Schermata (relativa a /m/:id) in cui si svolge il compito. */
export function percorsoCompito(tipo: string): string {
  switch (tipo) {
    case 'inventario': return 'inventario';
    case 'trasferimento': return 'articoli';
    case 'evadi_ordine': case 'riordino': case 'ordine_fornitore': return 'documenti/ordine_fornitore';
    case 'spedizione': return 'documenti/scarico';
    case 'carico': case 'scarico': case 'reso_cliente': case 'preventivo': case 'ordine_cliente': case 'fattura_vendita': case 'fattura_acquisto':
      return `documenti/${tipo}`;
    default: return 'documenti/carico';
  }
}

export const testoPulsanteCompito = (tipo: string) => (tipo === 'inventario' ? 'Vai all\'inventario' : tipo === 'trasferimento' ? 'Vai al magazzino' : 'Apri il documento');

/** Spiegazione del blocco: la causa tipica (scorta) richiede un riordino. */
export function spiegaBlocco(motivo: string | null | undefined): string {
  const m = (motivo ?? '').toLowerCase();
  if (m.includes('scorta')) return 'Non c\'è abbastanza merce in magazzino: serve un riordino. Quando l\'ordine al fornitore viene evaso, il compito si riapre da solo.';
  return motivo ? `Motivo: ${motivo}.` : 'Compito in attesa.';
}

/** Azione di permessi.ts che serve per svolgere il compito (null = nessuna, ad esempio tipi sconosciuti). */
export function azioneCompito(tipo: string): Azione | null {
  switch (tipo) {
    case 'reso_cliente': return 'reso';
    case 'riordino': return 'ordine_fornitore';
    case 'fattura_vendita': case 'fattura_acquisto': return 'fattura';
    case 'carico': case 'scarico': case 'trasferimento': case 'inventario': case 'ordine_fornitore': case 'evadi_ordine':
    case 'preventivo': case 'ordine_cliente': case 'spedizione':
      return tipo;
    default: return null;
  }
}
