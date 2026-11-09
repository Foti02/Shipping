import { createContext, useContext, useMemo } from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useApi } from '../lib/api';
import { eAdminGlobale, puoAzione, type Azione } from '../lib/permessi';
import type { ClasseDocente } from '../screens/Docente';
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

/** Elemento della rotta `m/:id`: risolve il magazzino dall'URL e rimanda alla scelta se non e' tuo.
 *  L'admin puo' aprire anche le classi di cui non e' membro (le prende da api_docente_classi, che per lui le elenca tutte). */
export function MagazzinoRotta() {
  const { id } = useParams();
  const { magazzini, profilo } = useSessione();
  const admin = eAdminGlobale(profilo?.ruolo_globale);
  const proprio = magazzini.find((x) => x.id === id);
  const classi = useApi<ClasseDocente[]>('api_docente_classi', {}, { enabled: admin && !proprio });
  const altrui = !proprio && admin ? classi.data?.find((c) => c.id === id) : undefined;
  const valore = useMemo<MagazzinoAttivo | null>(() => {
    const m: MagazzinoInfo | undefined = proprio ?? (altrui ? { id: altrui.id, nome: altrui.nome, tipo: 'classe', ruolo: 'docente', ruolo_aziendale: null } : undefined);
    return m ? { ...m, puo: (a: Azione) => puoAzione({ ...m, admin }, a) } : null;
  }, [proprio, altrui, admin]);
  if (!valore) return admin && !proprio && classi.isLoading ? <p className="contenuto muto">Caricamento...</p> : <Navigate to="/" replace />;
  return (
    <Ctx.Provider value={valore}>
      <Outlet />
    </Ctx.Provider>
  );
}
