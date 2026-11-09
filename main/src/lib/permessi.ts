export type Azione =
  | 'articoli.scrivi' | 'anagrafiche.scrivi' | 'lotti_ubicazioni' | 'carico' | 'scarico' | 'reso' | 'trasferimento'
  | 'inventario' | 'ordine_fornitore' | 'evadi_ordine' | 'preventivo' | 'ordine_cliente' | 'spedizione' | 'fattura' | 'scadenze';

export type RuoloAziendale = 'magazziniere' | 'acquisti' | 'commerciale' | 'amministrazione';

export type RuoloGlobale = 'studente' | 'docente' | 'admin';

export const ETICHETTA_RUOLO_GLOBALE: Record<RuoloGlobale, string> = { studente: 'Studente', docente: 'Docente', admin: 'Amministratore' };

/** Il docente globale e l'admin possono usare l'area docente (l'admin su qualsiasi classe). */
export const eDocenteGlobale = (r: RuoloGlobale | null | undefined) => r === 'docente' || r === 'admin';
export const eAdminGlobale = (r: RuoloGlobale | null | undefined) => r === 'admin';

export interface Ruolo {
  tipo: 'personale' | 'classe';
  ruolo: 'docente' | 'studente';
  ruolo_aziendale: RuoloAziendale | null;
  /** true se chi guarda e' admin globale: sulle classi fa tutto come un docente. */
  admin?: boolean;
}

// Matrice di architecture.md sezione 4. Serve solo a nascondere i pulsanti: la verita' e' nel database.
export const PERMESSI_RUOLO: Record<RuoloAziendale, readonly Azione[]> = {
  magazziniere: ['carico', 'scarico', 'reso', 'trasferimento', 'inventario', 'evadi_ordine', 'spedizione', 'lotti_ubicazioni', 'scadenze'],
  acquisti: ['ordine_fornitore', 'evadi_ordine', 'anagrafiche.scrivi', 'articoli.scrivi', 'scadenze'],
  commerciale: ['preventivo', 'ordine_cliente', 'anagrafiche.scrivi', 'scadenze'],
  amministrazione: ['fattura', 'anagrafiche.scrivi', 'scadenze'],
};

/** Replica di `_puo` del database: tutto nel magazzino personale, per i docenti, per l'admin e per gli studenti senza ruolo aziendale (jolly). */
export function puoAzione(m: Ruolo, azione: Azione): boolean {
  if (m.tipo === 'personale' || m.ruolo === 'docente' || m.admin || !m.ruolo_aziendale) return true;
  return PERMESSI_RUOLO[m.ruolo_aziendale].includes(azione);
}
