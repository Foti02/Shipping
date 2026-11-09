import type { KeyboardEvent } from 'react';

interface Props {
  voci: { id: string; etichetta: string }[];
  attiva: string;
  onCambia: (id: string) => void;
}

/** Solo la barra delle schede: il contenuto lo sceglie il genitore in base a `attiva`. */
export function Tabs({ voci, attiva, onCambia }: Props) {
  const tasto = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const v = voci[(i + d + voci.length) % voci.length];
    onCambia(v.id);
    document.getElementById(`tab-${v.id}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist">
      {voci.map((v, i) => (
        <button
          key={v.id}
          id={`tab-${v.id}`}
          role="tab"
          type="button"
          aria-selected={v.id === attiva}
          tabIndex={v.id === attiva ? 0 : -1}
          onClick={() => onCambia(v.id)}
          onKeyDown={(e) => tasto(e, i)}
        >
          {v.etichetta}
        </button>
      ))}
    </div>
  );
}
