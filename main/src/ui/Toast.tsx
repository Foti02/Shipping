import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Tono = 'ok' | 'errore' | 'info';
interface Voce { id: number; testo: string; tono: Tono }
type Mostra = (testo: string, tono?: Tono) => void;

const Ctx = createContext<Mostra>(() => {});

/** `const toast = useToast(); toast('Salvato'); toast('Errore', 'errore')`. */
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [voci, setVoci] = useState<Voce[]>([]);
  const n = useRef(0);
  const mostra = useCallback<Mostra>((testo, tono = 'info') => {
    const id = ++n.current;
    setVoci((v) => [...v, { id, testo, tono }]);
    setTimeout(() => setVoci((v) => v.filter((x) => x.id !== id)), 4500);
  }, []);
  const valore = useMemo(() => mostra, [mostra]);
  return (
    <Ctx.Provider value={valore}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {voci.map((v) => (
          <div key={v.id} className={`toast toast-${v.tono}`}>
            {v.testo}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
