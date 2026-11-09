// Logica pura delle schermate classe/docente (testata in logica.test.ts).
import { data } from '../../lib/formati';

/** "adesso", "3 minuti fa", "2 ore fa", "ieri"... Date future (orologi sfasati) valgono "adesso". */
export function tempoRelativo(iso: string | null | undefined, adesso: number = Date.now()): string {
  if (!iso) return 'mai';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 'mai';
  const s = Math.max(0, Math.floor((adesso - t) / 1000));
  const unita = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti} fa`;
  if (s < 10) return 'adesso';
  if (s < 60) return `${s} secondi fa`;
  const min = Math.floor(s / 60);
  if (min < 60) return unita(min, 'minuto', 'minuti');
  const ore = Math.floor(min / 60);
  if (ore < 24) return unita(ore, 'ora', 'ore');
  const giorni = Math.floor(ore / 24);
  if (giorni === 1) return 'ieri';
  if (giorni <= 30) return `${giorni} giorni fa`;
  return data(iso);
}

const AZIONI: Record<string, string> = {
  documento_conferma: 'ha confermato un documento',
  documento_salva: 'ha salvato una bozza',
  documento_annulla: 'ha annullato un documento',
  documento_elimina: 'ha eliminato una bozza',
  documento_genera: 'ha generato un documento',
  documento_pagato: 'ha cambiato lo stato di pagamento',
  spedizione_stato: 'ha aggiornato una spedizione',
  inventario_apri: 'ha aperto un inventario',
  inventario_conta: 'ha contato una riga di inventario',
  inventario_rettifica: 'ha rettificato una giacenza',
  inventario_chiudi: 'ha chiuso un inventario',
  trasferimento: 'ha trasferito merce',
  compito_completato: 'ha completato un compito',
  compito_errore: 'ha un compito con errori',
  compito_riassegna: 'compito riassegnato',
  scenario_genera: 'scenario generato',
  scenario_attivo: 'scenario attivato',
  scenario_chiuso: 'scenario chiuso',
  classe_crea: 'classe creata',
  classe_entra: 'è entrato in classe',
  classe_ruolo: 'ruolo aziendale cambiato',
  classe_rimuovi: 'membro rimosso',
  classe_azzera: 'dati della classe azzerati',
  classe_codice_rigenera: 'codice di ingresso rigenerato',
  classe_codice_attiva: 'codice di ingresso attivato',
  classe_codice_disattiva: 'codice di ingresso disattivato',
  'magazzino.impostazioni': 'impostazioni del magazzino cambiate',
  'articolo.crea': 'ha creato un articolo',
  'articolo.modifica': 'ha modificato un articolo',
  'articolo.elimina': 'ha eliminato un articolo',
  'articoli.importa': 'ha importato articoli',
  'articoli.variazione': 'ha variato i prezzi',
  'anagrafica.crea': "ha creato un'anagrafica",
  'anagrafica.modifica': "ha modificato un'anagrafica",
  'anagrafica.elimina': "ha eliminato un'anagrafica",
  'azienda.salva': 'ha salvato i dati azienda',
  'ubicazione.crea': "ha creato un'ubicazione",
  'ubicazione.modifica': "ha modificato un'ubicazione",
  'ubicazione.elimina': "ha eliminato un'ubicazione",
  'lotto.crea': 'ha creato un lotto',
  'lotto.modifica': 'ha modificato un lotto',
  scadenza_crea: 'ha creato una scadenza',
  scadenza_modifica: 'ha modificato una scadenza',
  scadenza_elimina: 'ha eliminato una scadenza',
};

/** Frase leggibile per l'azione del registro; i codici sconosciuti diventano testo ("foo_bar.baz" -> "foo bar baz"). */
export function etichettaAzione(azione: string | null | undefined): string {
  if (!azione) return '';
  return AZIONI[azione] ?? azione.replace(/[._]/g, ' ');
}

const TIPI_DOC: Record<string, string> = {
  preventivo: 'preventivo', ordine_cliente: 'ordine cliente', ordine_fornitore: 'ordine fornitore', carico: 'carico',
  scarico: 'scarico (DDT)', reso_cliente: 'reso cliente', fattura_vendita: 'fattura di vendita', fattura_acquisto: 'fattura di acquisto',
};
export const nomeTipoDocumento = (t: string) => TIPI_DOC[t] ?? t.replace(/_/g, ' ');

/** Dettaglio breve da `dettagli` del registro (tipo documento e numero, matricola, nome...). Vuoto se non c'e' niente di utile. */
export function dettaglioAttivita(dettagli: unknown): string {
  if (!dettagli || typeof dettagli !== 'object') return '';
  const d = dettagli as Record<string, unknown>;
  const pezzi: string[] = [];
  if (typeof d.tipo === 'string') pezzi.push(nomeTipoDocumento(d.tipo));
  if (d.numero != null) pezzi.push(`n. ${d.numero}${d.anno != null ? `/${d.anno}` : ''}`);
  if (typeof d.matricola === 'string') pezzi.push(d.matricola);
  if (typeof d.nome === 'string') pezzi.push(`"${d.nome}"`);
  if (typeof d.causale === 'string') pezzi.push(d.causale.replace(/_/g, ' '));
  return pezzi.join(' ');
}

const PAGINE: Record<string, string> = {
  scelta_magazzino: 'Scelta magazzino', cruscotto: 'Cruscotto', articoli: 'Magazzino', anagrafiche: 'Anagrafiche', agenda: 'Agenda',
  inventario: 'Inventario', analisi: 'Analisi', compiti: 'Compiti', attivita: 'Attività', classe: 'Classe', docente: 'Area docente',
  accedi: 'Accesso',
};

/** 'documenti/ordine_fornitore' -> 'Documenti: ordine fornitore'; null (magazzino personale) -> ''. */
export function etichettaPagina(pagina: string | null | undefined): string {
  if (!pagina) return '';
  if (pagina.startsWith('documenti/')) return `Documenti: ${nomeTipoDocumento(pagina.slice(10))}`;
  return PAGINE[pagina] ?? pagina.replace(/[/_]/g, ' ');
}

export interface ScenarioNoto { id: string; nome: string; stato: 'bozza' | 'attivo' | 'chiuso'; creato_il: string }

/** Percentuale intera 0-100 (0 se non ci sono compiti). */
export const percentuale = (parte: number, totale: number) => (totale > 0 ? Math.round((100 * parte) / totale) : 0);
