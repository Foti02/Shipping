import type { SVGProps } from 'react';

// Icone a tratto uniforme (24x24, 1.75 px, nessun riempimento). Solo quelle che servono.
const PERCORSI = {
  cruscotto: 'M4 4h7v8H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 14h7v6H4z',
  magazzini: 'M3 9l9-5 9 5v11H3zM9 20v-6h6v6',
  articoli: 'M4 7.5L12 3l8 4.5v9L12 21l-8-4.5zM4 7.5l8 4.5 8-4.5M12 12v9',
  documenti: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  anagrafiche: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.3a3.5 3.5 0 010 6.4M18 14a6.5 6.5 0 013.5 6',
  agenda: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  inventario: 'M4 4h16v5H4zM6 9v11h12V9M10 13h4',
  classe: 'M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.4 2.7 3 6 3s6-1.600 6-3v-4.500',
  docente: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.500 0 0113 0M16 14l2 2 4-4',
  freccia: 'M9 6l6 6-6 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  campana: 'M6 16V11a6 6 0 1112 0v5l1.500 2h-15zM10 21h4',
  chiudi: 'M6 6l12 12M18 6L6 18',
  piu: 'M12 5v14M5 12h14',
  altro: 'M12 5.500v.01M12 12v.01M12 18.500v.01',
  su: 'M7 14l5-5 5 5',
  giu: 'M7 10l5 5 5-5',
  utente: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
} as const;

export type NomeIcona = keyof typeof PERCORSI;

export function Icona({ nome, dimensione = 18, ...p }: { nome: NomeIcona; dimensione?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      className="icona"
      viewBox="0 0 24 24"
      width={dimensione}
      height={dimensione}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      <path d={PERCORSI[nome]} />
    </svg>
  );
}
