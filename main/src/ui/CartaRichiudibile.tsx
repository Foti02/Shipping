import { useId, type ReactNode } from 'react';
import { usePreferenza } from '../lib/preferenza';
import { Icona } from './icone';

/** Sezione con titolo che si apre e si chiude; la scelta resta ricordata per `id`. */
export function CartaRichiudibile({ id, titolo, children }: { id: string; titolo: string; children: ReactNode }) {
  const [chiusa, setChiusa] = usePreferenza(`shipping.carta.${id}.chiusa`, false);
  const corpo = useId();
  return (
    <section className={`carta${chiusa ? ' carta-chiusa' : ''}`}>
      <h2>
        <button type="button" className="carta-testa" aria-expanded={!chiusa} aria-controls={corpo} onClick={() => setChiusa(!chiusa)}>
          <span>{titolo}</span>
          <Icona nome="freccia" dimensione={16} className="icona carta-freccia" />
        </button>
      </h2>
      <div id={corpo} hidden={chiusa}>
        {children}
      </div>
    </section>
  );
}
