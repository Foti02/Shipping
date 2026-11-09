import { useEffect, useRef, type ReactNode } from 'react';
import { Icona } from './icone';

interface Props {
  aperto: boolean;
  titolo: string;
  onChiudi: () => void;
  children: ReactNode;
}

/** Modale accessibile su <dialog>: focus intrappolato e restituito, Esc chiude, clic sullo sfondo chiude.
 *  Il contenuto si monta solo da aperto, quindi i form ripartono puliti. */
export function Dialog({ aperto, titolo, onChiudi, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aperto && !d.open) d.showModal();
    if (!aperto && d.open) d.close();
  }, [aperto]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-titolo"
      onCancel={(e) => {
        e.preventDefault(); // niente chiusura "da sola": decide il genitore
        onChiudi();
      }}
      onClick={(e) => e.target === ref.current && onChiudi()}
    >
      {aperto && (
        <div className="dialog-corpo">
          <div className="dialog-testa">
            <h2 id="dialog-titolo">{titolo}</h2>
            <button type="button" className="dialog-chiudi" aria-label="Chiudi" onClick={onChiudi}>
              <Icona nome="chiudi" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
