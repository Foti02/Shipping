// Validazioni dei form di account e amministrazione (logica pura, testata in account.test.ts).

export const USERNAME = /^[a-z0-9._-]{3,20}$/;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX_BYTE = 72; // bcrypt ignora tutto dopo i primi 72 byte: il database le rifiuta oltre

export const MSG_USERNAME = 'Da 3 a 20 caratteri: lettere minuscole, numeri, punto, trattino e trattino basso.';
export const MSG_PASSWORD = `Da ${PASSWORD_MIN} caratteri a ${PASSWORD_MAX_BYTE} byte (le lettere accentate ne occupano due).`;

/** Password accettabile per una registrazione o un cambio: almeno 6 caratteri e al massimo 72 byte. */
export const passwordOk = (p: string) => p.length >= PASSWORD_MIN && new TextEncoder().encode(p).length <= PASSWORD_MAX_BYTE;

export const validaUsername = (u: string) => (USERNAME.test(u) ? undefined : MSG_USERNAME);
export const validaNome = (n: string) => (n.trim() ? undefined : 'Scrivi un nominativo.');

/** Nuova password (con conferma): errori per campo, vuoto se tutto ok. `vecchia` serve solo al cambio password. */
export function validaPassword(nuova: string, conferma: string, vecchia?: string): { vecchia?: string; nuova?: string; conferma?: string } {
  const e: { vecchia?: string; nuova?: string; conferma?: string } = {};
  if (vecchia !== undefined && !vecchia) e.vecchia = 'Scrivi la password attuale.';
  if (!passwordOk(nuova)) e.nuova = MSG_PASSWORD;
  else if (vecchia !== undefined && nuova === vecchia) e.nuova = 'La nuova password deve essere diversa da quella attuale.';
  if (conferma !== nuova) e.conferma = 'Le due password non coincidono.';
  return e;
}

/** Conferma scritta: il testo deve essere esattamente lo username (senza spazi attorno). */
export const confermaScritta = (scritto: string, atteso: string) => scritto.trim() === atteso && atteso !== '';

export const haErrori = (e: object) => Object.values(e).some(Boolean);
