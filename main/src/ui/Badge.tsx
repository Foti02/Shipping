import type { ReactNode } from 'react';

export type Tono = 'verde' | 'giallo' | 'blu' | 'rosso' | 'grigio';

export function Badge({ tono = 'grigio', children }: { tono?: Tono; children: ReactNode }) {
  return <span className={`badge badge-${tono}`}>{children}</span>;
}

// stato_riga degli articoli (verde/giallo/blu) e stato dei compiti.
const STATI: Record<string, { tono: Tono; testo: string }> = {
  verde: { tono: 'verde', testo: 'Disponibile' },
  giallo: { tono: 'giallo', testo: 'Sotto scorta' },
  blu: { tono: 'blu', testo: 'In arrivo' },
  da_fare: { tono: 'blu', testo: 'Da fare' },
  bloccato: { tono: 'giallo', testo: 'Bloccato' },
  completato: { tono: 'verde', testo: 'Completato' },
  errore: { tono: 'rosso', testo: 'Errore' },
};

/** `<BadgeStato stato="giallo" />` oppure `stato="completato"`; `testo` sostituisce l'etichetta predefinita. */
export function BadgeStato({ stato, testo }: { stato: string; testo?: string }) {
  const s = STATI[stato] ?? { tono: 'grigio' as Tono, testo: stato };
  return <Badge tono={s.tono}>{testo ?? s.testo}</Badge>;
}
