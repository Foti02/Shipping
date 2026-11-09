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
  // Aggiunti dal client (non vengono dal database).
  credenziali_errate: 'Nome utente o password errati.',
  db_non_configurato: 'Database non configurato.',
};

export const MESSAGGIO_GENERICO = 'Qualcosa è andato storto. Riprova.';

/** Testo italiano per un codice del contratto (stringa o Error con message = codice). */
export function messaggioErrore(codice: unknown): string {
  const c = codice instanceof Error ? codice.message : typeof codice === 'string' ? codice : '';
  return TESTI[c.trim()] ?? MESSAGGIO_GENERICO;
}
