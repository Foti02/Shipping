import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { backend } from '../backend';
import type { RuoloAziendale, RuoloGlobale } from '../lib/permessi';

export interface Profilo {
  user_id: string;
  username: string;
  nome: string;
  ruolo_globale: RuoloGlobale;
}

export interface MagazzinoInfo {
  id: string;
  nome: string;
  tipo: 'personale' | 'classe';
  ruolo: 'docente' | 'studente';
  ruolo_aziendale: RuoloAziendale | null;
}

type Fase = 'carico' | 'fuori' | 'dentro' | 'errore';

interface Valore {
  fase: Fase;
  profilo: Profilo | null;
  magazzini: MagazzinoInfo[];
  errore: string | null;
  /** Rilegge sessione e api_inizializza (dopo accesso, o dopo aver aggiunto una classe). */
  ricarica: () => Promise<void>;
  accedi: (username: string, password: string) => Promise<void>;
  registra: (username: string, password: string, nome: string) => Promise<void>;
  entraCome: (username: string) => Promise<void>;
  esci: () => Promise<void>;
}

const Ctx = createContext<Valore | null>(null);

export function useSessione() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSessione fuori da SessioneProvider');
  return v;
}

export function SessioneProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [s, setS] = useState<Pick<Valore, 'fase' | 'profilo' | 'magazzini' | 'errore'>>({ fase: 'carico', profilo: null, magazzini: [], errore: null });

  const ricarica = useCallback(async () => {
    try {
      if (!(await backend.auth.sessione())) return setS({ fase: 'fuori', profilo: null, magazzini: [], errore: null });
      const r = await backend.rpc<{ profilo: Profilo; magazzini: MagazzinoInfo[] }>('api_inizializza');
      setS({ fase: 'dentro', profilo: r.profilo, magazzini: r.magazzini, errore: null });
    } catch (e) {
      const codice = e instanceof Error ? e.message : '';
      setS({ fase: codice === 'non_autenticato' ? 'fuori' : 'errore', profilo: null, magazzini: [], errore: codice });
    }
  }, []);

  useEffect(() => void ricarica(), [ricarica]);

  const valore = useMemo<Valore>(
    () => ({
      ...s,
      ricarica,
      accedi: async (u, p) => {
        await backend.auth.accedi(u, p);
        await ricarica();
      },
      registra: async (u, p, n) => {
        await backend.auth.registra(u, p, n);
        await ricarica();
      },
      entraCome: async (u) => {
        await backend.demo!.entraCome(u);
        qc.clear();
        await ricarica();
      },
      esci: async () => {
        await backend.auth.esci();
        qc.clear();
        setS({ fase: 'fuori', profilo: null, magazzini: [], errore: null });
      },
    }),
    [s, ricarica, qc],
  );
  return <Ctx.Provider value={valore}>{children}</Ctx.Provider>;
}
