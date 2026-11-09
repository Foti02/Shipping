import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

interface Comune {
  label: string;
  errore?: string;
  aiuto?: string;
}

function Riga({ id, label, errore, aiuto, children }: Comune & { id: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {aiuto && !errore && <small id={`${id}-aiuto`}>{aiuto}</small>}
      {errore && (
        <small id={`${id}-errore`} className="errore" role="alert">
          {errore}
        </small>
      )}
    </div>
  );
}

const descrizione = (id: string, errore?: string, aiuto?: string) => (errore ? `${id}-errore` : aiuto ? `${id}-aiuto` : undefined);

/** Etichetta + input + messaggio d'errore. */
export function Field({ label, errore, aiuto, ...p }: Comune & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Riga id={id} label={label} errore={errore} aiuto={aiuto}>
      <input id={id} aria-invalid={!!errore} aria-describedby={descrizione(id, errore, aiuto)} {...p} />
    </Riga>
  );
}

export interface Opzione {
  value: string;
  label: string;
}

/** Etichetta + select + messaggio d'errore. */
export function Select({ label, errore, aiuto, opzioni, ...p }: Comune & { opzioni: Opzione[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Riga id={id} label={label} errore={errore} aiuto={aiuto}>
      <select id={id} aria-invalid={!!errore} aria-describedby={descrizione(id, errore, aiuto)} {...p}>
        {opzioni.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Riga>
  );
}
