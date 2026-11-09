import type { ButtonHTMLAttributes } from 'react';
import type { ChiaveAiuto } from '../lib/aiuti';
import { Suggerimento, testoAiuto } from './Suggerimento';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primario e accento = pieno, colore d'accento; tenue = bordo e fondo neutro; pericolo = rosso. */
  variante?: 'primario' | 'accento' | 'tenue' | 'pericolo';
  /** Chiave di src/lib/aiuti.ts: spiegazione che compare dopo 1,5 s di puntatore fermo. */
  aiuto?: ChiaveAiuto;
}

export function Button({ variante = 'primario', type = 'button', className = '', aiuto, ...p }: ButtonProps) {
  const b = <button type={type} className={`btn btn-${variante} ${className}`} {...p} />;
  return aiuto ? <Suggerimento testo={testoAiuto(aiuto)}>{b}</Suggerimento> : b;
}
