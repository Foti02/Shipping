import { useEffect, useRef } from 'react';
import { backend } from '../backend';

/** Nome leggibile della pagina dal percorso: '/m/<id>/articoli' -> 'articoli'. */
export function nomePagina(percorso: string): string {
  const s = percorso.split('/').filter(Boolean);
  if (s.length === 0) return 'scelta_magazzino';
  if (s[0] === 'm') return s.length === 2 ? 'cruscotto' : s.slice(2).join('/');
  return s[0];
}

/** Battito ogni 20 s (e subito al cambio pagina). Errori ignorati: la presenza non deve mai rompere l'app. */
export function useHeartbeat(magazzino: string | null, pagina: string) {
  const ultimo = useRef({ magazzino, pagina });
  ultimo.current = { magazzino, pagina };
  const invia = () => void backend.rpc('api_heartbeat', { p_magazzino: ultimo.current.magazzino, p_pagina: ultimo.current.pagina }).catch(() => {});
  useEffect(invia, [magazzino, pagina]);
  useEffect(() => {
    const t = setInterval(invia, 20_000);
    return () => clearInterval(t);
  }, []);
}
