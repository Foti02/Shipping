import { useEffect, useRef, type ReactNode } from 'react';

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
          <h2 id="dialog-titolo">
            {titolo}
            <span className="dot">.</span>
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
