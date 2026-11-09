// Interfaccia unica verso il database. Supabase in main, PGlite in local-demo.
export interface Backend {
  /** Chiama una funzione SQL `api_*` passando gli argomenti per nome. Gli errori hanno `message` = codice (es. "giacenza_insufficiente") e, se Postgres ne da' uno, `dettaglio` (il DETAIL, es. "possiede_classi"). */
  rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T>;
  auth: {
    registra(username: string, password: string, nome: string): Promise<void>;
    accedi(username: string, password: string): Promise<void>;
    esci(): Promise<void>;
    sessione(): Promise<{ userId: string } | null>;
    /** Verifica la vecchia password e imposta la nuova (min 6). 'credenziali_errate' se la vecchia e' sbagliata. */
    cambiaPassword(vecchia: string, nuova: string): Promise<void>;
    /** Crea un account SENZA cambiare la sessione corrente (per l'admin). Il ruolo si imposta dopo con api_admin_imposta_ruolo. */
    creaUtente(username: string, password: string, nome: string): Promise<{ userId: string }>;
  };
  /** Solo supabase.ts: true se mancano URL e chiave del database (l'interfaccia mostra le istruzioni invece di crashare). */
  nonConfigurato?: boolean;
  /** Presente solo in local-demo: utenti pronti per "entra come" (un docente e degli studenti). */
  demo?: {
    utenti(): Promise<{ username: string; nome: string; ruolo: 'admin' | 'docente' | 'studente' }[]>;
    entraCome(username: string): Promise<void>;
    /** Cancella il database del browser e ricarica la pagina. */
    reimposta(): Promise<void>;
  };
}
