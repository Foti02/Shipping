import { createContext, useContext, useMemo } from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { puoAzione, type Azione } from '../lib/permessi';
import { useSessione, type MagazzinoInfo } from './sessione';

export interface MagazzinoAttivo extends MagazzinoInfo {
  /** Nasconde i pulsanti non permessi dal ruolo. La verita' resta nel database. */
  puo: (azione: Azione) => boolean;
}

const Ctx = createContext<MagazzinoAttivo | null>(null);

/** Magazzino della rotta `/m/:id`; lancia fuori da quella rotta. */
export function useMagazzino(): MagazzinoAttivo {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMagazzino fuori da /m/:id');
  return v;
}

/** Come useMagazzino ma null fuori da /m/:id (lo usa il layout, presente anche nelle rotte globali). */
export const useMagazzinoOpzionale = () => useContext(Ctx);

/** Elemento della rotta `m/:id`: risolve il magazzino dall'URL e rimanda alla scelta se non e' tuo. */
export function MagazzinoRotta() {
  const { id } = useParams();
  const { magazzini } = useSessione();
  const m = magazzini.find((x) => x.id === id);
  const valore = useMemo(() => (m ? { ...m, puo: (a: Azione) => puoAzione(m, a) } : null), [m]);
  if (!valore) return <Navigate to="/" replace />;
  return (
    <Ctx.Provider value={valore}>
      <Outlet />
    </Ctx.Provider>
  );
}
