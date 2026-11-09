import { cmp } from '../semver';

export interface Piattaforma { versione: string; file: string; url: string }
export interface Latest { windows?: Piattaforma; mac?: Piattaforma }

/** Cartella pubblica dell'archivio Supabase con gli installer e latest.json (scritto dal workflow di rilascio). */
export const URL_LATEST = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/storage/v1/object/public/installer/latest.json`;

const valida = (p: unknown): p is Piattaforma =>
  !!p && typeof p === 'object' && ['versione', 'file', 'url'].every((k) => typeof (p as Record<string, unknown>)[k] === 'string');

/** Accetta solo le piattaforme ben formate: un latest.json strano non deve rompere la pagina. */
export function leggiLatest(json: unknown): Latest {
  const j = (json ?? {}) as Record<string, unknown>;
  return { windows: valida(j.windows) ? j.windows : undefined, mac: valida(j.mac) ? j.mac : undefined };
}

/** La piattaforma da offrire in "aggiornamento": quella dell'app in esecuzione (macOS o Windows). */
export const chiaveOs = (platform: string): 'mac' | 'windows' => (/Mac/.test(platform) ? 'mac' : 'windows');

/** Vero se la piattaforma ha una versione piu' nuova di quella in uso. */
export const haAggiornamento = (p: Piattaforma | undefined, corrente: string) => !!p && cmp(p.versione, corrente) > 0;
