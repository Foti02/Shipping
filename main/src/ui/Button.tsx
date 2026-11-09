import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primario = blu, accento = arancione, tenue = pannello, pericolo = rosso. */
  variante?: 'primario' | 'accento' | 'tenue' | 'pericolo';
}

export function Button({ variante = 'primario', type = 'button', className = '', ...p }: ButtonProps) {
  return <button type={type} className={`btn btn-${variante} ${className}`} {...p} />;
}
