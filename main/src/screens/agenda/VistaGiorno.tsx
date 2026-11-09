import { useEffect, useRef } from 'react';
import { fasceDelGiorno, inizioGiorno, type Scadenza } from './griglia';

interface Props {
  giorno: Date;
  voci: Scadenza[];
  puoScrivere: boolean;
  onApri: (s: Scadenza) => void;
  /** Click su una fascia vuota: ora intera (0-23). */
  onNuova: (ora: number) => void;
  onStato: (s: Scadenza) => void;
}

const PX_ORA = 48;
const fOra = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
const intervallo = (s: Scadenza) => `${fOra.format(new Date(s.inizio))} - ${fOra.format(new Date(s.fine))}`;

function Spunta({ s, onStato, puoScrivere }: { s: Scadenza; onStato: (s: Scadenza) => void; puoScrivere: boolean }) {
  const fatto = s.stato === 'completato';
  return (
    <button
      type="button"
      className="ag-spunta"
      aria-pressed={fatto}
      aria-label={`${fatto ? 'Riapri' : 'Segna come completato'}: ${s.oggetto}`}
      disabled={!puoScrivere}
      onClick={() => onStato(s)}
    >
      {fatto ? '✓' : ''}
    </button>
  );
}

/** Giorno a fasce orarie (da tablet in su) e, sotto i 700px, elenco ordinato per ora. */
export function VistaGiorno({ giorno, voci, puoScrivere, onApri, onNuova, onStato }: Props) {
  const scorri = useRef<HTMLDivElement>(null);
  const k = +inizioGiorno(giorno);
  useEffect(() => {
    if (scorri.current) scorri.current.scrollTop = 7 * PX_ORA; // si parte dalle 7
  }, [k]);
  const fasce = fasceDelGiorno(giorno, voci);

  return (
    <>
      <div className="ag-fasce" ref={scorri} tabIndex={0} aria-label="Fasce orarie del giorno">
        <div className="ag-corpo" style={{ height: 24 * PX_ORA }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="ag-ora"
              style={{ top: h * PX_ORA, height: PX_ORA }}
              onClick={puoScrivere ? () => onNuova(h) : undefined}
              title={puoScrivere ? `Nuova voce alle ${String(h).padStart(2, '0')}:00` : undefined}
            >
              <span>{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
          {fasce.map((f) => (
            <div
              key={f.scadenza.id}
              className={`ag-voce ${f.scadenza.tipo}${f.scadenza.stato === 'completato' ? ' fatto' : ''}`}
              style={{
                top: (f.da / 60) * PX_ORA,
                height: Math.max(((f.a - f.da) / 60) * PX_ORA, 44),
                left: `calc(64px + (100% - 72px) * ${f.col / f.colonne})`,
                width: `calc((100% - 72px) / ${f.colonne} - 4px)`,
              }}
            >
              <Spunta s={f.scadenza} onStato={onStato} puoScrivere={puoScrivere} />
              <button type="button" className="ag-testo" onClick={() => onApri(f.scadenza)}>
                <strong>{f.scadenza.oggetto}</strong>
                <small>
                  {intervallo(f.scadenza)}
                  {f.scadenza.ragione_sociale ? ` · ${f.scadenza.ragione_sociale}` : ''}
                </small>
              </button>
            </div>
          ))}
        </div>
      </div>

      <ul className="ag-lista">
        {voci.length === 0 && <li className="muto">Nessuna voce in questo giorno.</li>}
        {[...voci].sort((a, b) => +new Date(a.inizio) - +new Date(b.inizio)).map((s) => (
          <li key={s.id} className={`ag-voce ${s.tipo}${s.stato === 'completato' ? ' fatto' : ''}`}>
            <Spunta s={s} onStato={onStato} puoScrivere={puoScrivere} />
            <button type="button" className="ag-testo" onClick={() => onApri(s)}>
              <strong>{s.oggetto}</strong>
              <small>
                {intervallo(s)}
                {s.ragione_sociale ? ` · ${s.ragione_sociale}` : ''}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

