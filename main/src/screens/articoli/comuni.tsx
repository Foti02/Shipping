import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { backend } from '../../backend';
import { Button, Dialog } from '../../ui';
import './articoli.css';

/** Scrittura per i dialoghi: invalida le letture ma NON mostra toast (un <dialog> modale copre i toast),
 *  l'errore lo scrive il chiamante dentro il dialogo con messaggioErrore. */
export function useScrivi<T = unknown>(nome: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Record<string, unknown>) => backend.rpc<T>(nome, args),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['api'] }),
  });
}

/** Stato di un modulo con messaggio d'errore in testa. */
export const useErrore = () => useState<string | null>(null);

export const ErroreForm = ({ testo }: { testo: string | null }) =>
  testo ? (
    <div className="form-errore" role="alert">
      {testo}
    </div>
  ) : null;

const STATI = {
  verde: { glifo: '✓', testo: 'Disponibile' },
  giallo: { glifo: '!', testo: 'Sotto il punto di riordino' },
  blu: { glifo: '→', testo: 'Merce ordinata in arrivo' },
} as const;

/** Pallino colorato con un glifo, cosi' lo stato si legge anche senza distinguere i colori. */
export function StatoIcona({ stato }: { stato?: string }) {
  const s = STATI[stato as keyof typeof STATI] ?? STATI.verde;
  return (
    <span className={`art-stato art-stato-${stato ?? 'verde'}`} role="img" aria-label={s.testo} title={s.testo}>
      {s.glifo}
    </span>
  );
}

export function Legenda() {
  return (
    <ul className="art-legenda" aria-label="Legenda dello stato">
      {(Object.keys(STATI) as (keyof typeof STATI)[]).map((k) => (
        <li key={k}>
          <StatoIcona stato={k} /> {STATI[k].testo}
        </li>
      ))}
    </ul>
  );
}

/** Conferma di eliminazione; `errore` resta visibile nel dialogo (es. articolo con movimenti). */
export function Conferma({ aperto, titolo, children, errore, occupato, onConferma, onChiudi }: {
  aperto: boolean;
  titolo: string;
  children: ReactNode;
  errore: string | null;
  occupato: boolean;
  onConferma: () => void;
  onChiudi: () => void;
}) {
  return (
    <Dialog aperto={aperto} titolo={titolo} onChiudi={onChiudi}>
      <ErroreForm testo={errore} />
      {!errore && <p>{children}</p>}
      <div className="dialog-azioni">
        <Button variante="tenue" onClick={onChiudi}>
          {errore ? 'Chiudi' : 'Annulla'}
        </Button>
        {!errore && (
          <Button variante="pericolo" disabled={occupato} onClick={onConferma}>
            Elimina
          </Button>
        )}
      </div>
    </Dialog>
  );
}
