const TESTI: Record<string, string> = {
  non_autenticato: 'Sessione scaduta: accedi di nuovo.',
  permesso_negato: 'Il tuo ruolo non ti permette questa operazione.',
  non_trovato: 'Elemento non trovato: potrebbe essere stato eliminato.',
  dato_non_valido: 'Alcuni dati non sono validi: controlla i campi.',
  giacenza_insufficiente: 'Giacenza insufficiente per questa operazione.',
  codice_non_valido: 'Codice non valido o non più attivo.',
  conferma_errata: 'Il testo di conferma non coincide: scrivi il nome esatto.',
  stato_non_valido: 'Operazione non possibile nello stato attuale.',
  gia_esiste: 'Esiste già un elemento con questi dati.',
  // `detail` di stato_non_valido: spiegano il perché.
  possiede_classi: 'L\'utente possiede ancora delle classi: vanno eliminate o trasferite a un altro docente prima di eliminare l\'account.',
  ultimo_admin: 'Questo è l\'ultimo amministratore: nominane un altro prima di toglierlo o eliminarlo.',
  // Aggiunti dal client (non vengono dal database).
  credenziali_errate: 'Nome utente o password errati.',
  db_non_configurato: 'Database non configurato.',
};

export const MESSAGGIO_GENERICO = 'Qualcosa è andato storto. Riprova.';

/** Errore del database con il `detail` di Postgres (es. 'possiede_classi') quando c'è. */
export type ErroreDb = Error & { dettaglio?: string };

export function erroreDb(codice: string, dettaglio?: string | null): ErroreDb {
  const e: ErroreDb = new Error(codice);
  if (dettaglio) e.dettaglio = dettaglio.trim();
  return e;
}

/** Testo italiano per un codice del contratto (stringa o Error con message = codice; il detail, se noto, precisa il motivo). */
export function messaggioErrore(codice: unknown): string {
  const c = (codice instanceof Error ? codice.message : typeof codice === 'string' ? codice : '').trim();
  const d = codice instanceof Error ? (codice as ErroreDb).dettaglio : undefined;
  return (d && TESTI[d]) || TESTI[c] || MESSAGGIO_GENERICO;
}
