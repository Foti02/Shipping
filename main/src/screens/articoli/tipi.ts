// Forme di ritorno di api_articoli_elenco / api_articolo_leggi / api_ubicazioni_elenco / api_lotti_elenco (0003_dati.sql).
export interface Articolo {
  id: string;
  matricola: string;
  descrizione: string;
  um: string;
  categoria: string;
  gruppo: string | null;
  prezzo_acquisto_cent: number;
  iva_perc: number;
  ricarico_perc: number;
  sconto_perc: number;
  scorta_minima: number;
  scorta_sicurezza: number;
  punto_riordino: number;
  lead_time_giorni: number;
  domanda_giornaliera: number | null;
  costo_ordine_cent: number;
  costo_mantenimento_perc: number;
  barcode: string | null;
  ubicazione_id: string | null;
  fornitore_abituale_id: string | null;
  codice_fornitore: string | null;
  gestione_lotti: boolean;
  note: string | null;
  ubicazione_codice?: string | null;
  fornitore_nome?: string | null;
  carichi?: number;
  scarichi?: number;
  resi?: number;
  giacenza?: number;
  ordinato?: number;
  stato_riga?: 'verde' | 'giallo' | 'blu';
}

export interface Movimento {
  id: number;
  causale: string;
  qta: number;
  costo_unit_cent: number | null;
  lotto_codice: string | null;
  ubicazione_codice: string | null;
  username: string | null;
  created_at: string;
}

export interface GiacenzaRiga {
  id: string;
  lotto_codice: string | null;
  scadenza: string | null;
  ubicazione_codice: string | null;
  qta: number;
}

export interface DettaglioArticolo {
  articolo: Articolo;
  giacenza: number;
  giacenze: GiacenzaRiga[];
  movimenti: Movimento[];
}

export interface Ubicazione {
  id: string;
  codice: string;
  zona: string | null;
  corridoio: string | null;
  scaffale: string | null;
  n_articoli: number;
  qta_totale: number;
}

export interface Lotto {
  id: string;
  codice: string;
  scadenza: string | null;
  qta: number;
}

export interface Fornitore {
  id: string;
  ragione_sociale: string;
}
