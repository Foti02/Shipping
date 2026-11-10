import { useState } from 'react';

/** Un interruttore ricordato in questo browser (localStorage). Senza salvataggio resta valido finché la pagina è aperta. */
export function usePreferenza(chiave: string, iniziale: boolean): [boolean, (v: boolean) => void] {
  const [valore, setValore] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(chiave);
      return s === null ? iniziale : s === '1';
    } catch {
      return iniziale;
    }
  });
  const imposta = (v: boolean) => {
    setValore(v);
    try {
      localStorage.setItem(chiave, v ? '1' : '0');
    } catch { /* niente salvataggio */ }
  };
  return [valore, imposta];
}
