// Logica pura delle schermate di amministrazione (testata in logica.test.ts).
import { ETICHETTA_RUOLO_GLOBALE, type RuoloGlobale } from '../../lib/permessi';

export interface UtenteAdmin {
  user_id: string;
  username: string;
  nome: string;
  ruolo_globale: RuoloGlobale;
  creato_il: string;
  ultimo_accesso: string | null;
  n_classi_possedute: number;
  n_classi_iscritto: number;
}

export interface ClasseAdmin {
  id: string;
  nome: string;
  created_at: string;
  proprietario: { user_id: string; username: string };
  n_iscritti: number;
  n_online: number;
}

export interface RigaRegistro {
  id: number;
  username: string | null;
  azione: string;
  bersaglio: string | null;
  dettagli: Record<string, unknown> | null;
  created_at: string;
}

export interface Statistiche {
  utenti: { studenti: number; docenti: number; admin: number };
  classi: number;
  magazzini_personali: number;
  online_ora: number;
}

const ruolo = (r: unknown) => (typeof r === 'string' && r in ETICHETTA_RUOLO_GLOBALE ? ETICHETTA_RUOLO_GLOBALE[r as RuoloGlobale].toLowerCase() : String(r ?? '?'));

/** Frase leggibile per una riga del registro admin ("ha reimpostato la password di anna"). */
export function fraseRegistro(r: Pick<RigaRegistro, 'azione' | 'bersaglio' | 'dettagli'>): string {
  const d = r.dettagli ?? {};
  const chi = r.bersaglio ?? 'un utente';
  const nome = typeof d.nome === 'string' ? ` "${d.nome}"` : '';
  switch (r.azione) {
    case 'ruolo': return `ha cambiato il ruolo di ${chi} da ${ruolo(d.da)} a ${ruolo(d.a)}`;
    case 'password_reimposta': return `ha reimpostato la password di ${chi}`;
    case 'utente_elimina': return `ha eliminato l'utente ${chi}`;
    case 'account_elimina': return 'ha eliminato il proprio account';
    case 'classe_crea': return `ha creato la classe${nome}`;
    case 'classe_trasferisci': return `ha trasferito la classe${nome} a ${chi}`;
    default: return r.azione.replace(/[._]/g, ' ');
  }
}

/** Testo di ricerca pronto per il database: minuscolo, senza spazi ai bordi, massimo 100 caratteri. */
export const cercaPulita = (t: string) => t.trim().toLowerCase().slice(0, 100);
