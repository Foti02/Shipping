import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import type { ChiaveAiuto } from '../lib/aiuti';
import { PuntoAiuto, Suggerimento, testoAiuto } from './Suggerimento';

interface Comune {
  label: string;
  errore?: string;
  /** Nota fissa sotto il campo (formato, esempio). */
  nota?: string;
  /** Chiave di src/lib/aiuti.ts: spiegazione per i concetti non intuitivi (compare dopo 1,5 s sopra il campo, o col "?" al tocco). */
  aiuto?: ChiaveAiuto;
}

function Riga({ id, label, errore, nota, aiuto, children }: Comune & { id: string; children: (descrittoDa?: string) => ReactNode }) {
  const corpo = (attacchi: object = {}, extra?: string) => (
    <div className="field" {...attacchi}>
      <div className="field-et">
        <label htmlFor={id}>{label}</label>
        {aiuto && <PuntoAiuto testo={testoAiuto(aiuto)} etichetta={`Spiegazione: ${label}`} />}
      </div>
      {children(extra)}
      {nota && !errore && <small id={`${id}-nota`}>{nota}</small>}
      {errore && (
        <small id={`${id}-errore`} className="errore" role="alert">
          {errore}
        </small>
      )}
    </div>
  );
  if (!aiuto) return corpo();
  return <Suggerimento testo={testoAiuto(aiuto)}>{({ attacchi, descrittoDa }) => corpo(attacchi, descrittoDa)}</Suggerimento>;
}

const descrizione = (id: string, errore?: string, nota?: string, extra?: string) =>
  [errore ? `${id}-errore` : nota ? `${id}-nota` : undefined, extra].filter(Boolean).join(' ') || undefined;

/** Etichetta + input + messaggio d'errore. */
export function Field({ label, errore, nota, aiuto, ...p }: Comune & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Riga id={id} label={label} errore={errore} nota={nota} aiuto={aiuto}>
      {(extra) => <input id={id} aria-invalid={!!errore} aria-describedby={descrizione(id, errore, nota, extra)} {...p} />}
    </Riga>
  );
}

export interface Opzione {
  value: string;
  label: string;
}

/** Etichetta + select + messaggio d'errore. */
export function Select({ label, errore, nota, aiuto, opzioni, ...p }: Comune & { opzioni: Opzione[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Riga id={id} label={label} errore={errore} nota={nota} aiuto={aiuto}>
      {(extra) => (
        <select id={id} aria-invalid={!!errore} aria-describedby={descrizione(id, errore, nota, extra)} {...p}>
          {opzioni.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Riga>
  );
}
