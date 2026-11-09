import { useEffect, useRef, type KeyboardEvent } from 'react';
import { aggiungiGiorni, aggiungiMesi, chiave, grigliaMese, type Scadenza } from './griglia';

interface Props {
  giorno: Date;
  oggi: Date;
  voci: Map<string, Scadenza[]>;
  onGiorno: (d: Date) => void;
}

const INTESTAZIONI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const fEsteso = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Mese a griglia. Frecce = giorno/settimana, PagSu/PagGiu = mese, Home/Fine = inizio/fine settimana. Un solo tab-stop (il giorno scelto). */
export function CalendarioMese({ giorno, oggi, voci, onGiorno }: Props) {
  const celle = grigliaMese(giorno);
  const k = chiave(giorno);
  const ko = chiave(oggi);
  const ref = useRef<HTMLDivElement>(null);
  const sposta = useRef(false); // il focus segue solo i movimenti da tastiera

  useEffect(() => {
    if (!sposta.current) return;
    sposta.current = false;
    ref.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  }, [k]);

  const tasto = (e: KeyboardEvent) => {
    const lun = (giorno.getDay() + 6) % 7;
    const nuovo =
      e.key === 'ArrowLeft' ? aggiungiGiorni(giorno, -1)
      : e.key === 'ArrowRight' ? aggiungiGiorni(giorno, 1)
      : e.key === 'ArrowUp' ? aggiungiGiorni(giorno, -7)
      : e.key === 'ArrowDown' ? aggiungiGiorni(giorno, 7)
      : e.key === 'Home' ? aggiungiGiorni(giorno, -lun)
      : e.key === 'End' ? aggiungiGiorni(giorno, 6 - lun)
      : e.key === 'PageUp' ? aggiungiMesi(giorno, -1)
      : e.key === 'PageDown' ? aggiungiMesi(giorno, 1)
      : null;
    if (!nuovo) return;
    e.preventDefault();
    sposta.current = true;
    onGiorno(nuovo);
  };

  return (
    <div className="cal-mese" role="grid" aria-label="Calendario del mese" ref={ref} onKeyDown={tasto}>
      <div role="row" className="cal-riga cal-intest">
        {INTESTAZIONI.map((g) => (
          <span key={g} role="columnheader">
            {g}
          </span>
        ))}
      </div>
      {Array.from({ length: celle.length / 7 }, (_, r) => (
        <div role="row" className="cal-riga" key={r}>
          {celle.slice(r * 7, r * 7 + 7).map((c) => {
            const lista = voci.get(c.chiave) ?? [];
            const aperte = lista.filter((s) => s.stato === 'in_sospeso').length;
            return (
              <div role="gridcell" key={c.chiave} aria-selected={c.chiave === k}>
                <button
                  type="button"
                  tabIndex={c.chiave === k ? 0 : -1}
                  className={`cal-giorno${c.delMese ? '' : ' fuori'}${c.chiave === k ? ' sel' : ''}${c.chiave === ko ? ' oggi' : ''}`}
                  aria-label={`${fEsteso.format(c.data)}${lista.length ? `, ${lista.length === 1 ? '1 voce' : `${lista.length} voci`}${aperte ? `, ${aperte} in sospeso` : ', tutte completate'}` : ''}`}
                  aria-current={c.chiave === ko ? 'date' : undefined}
                  onClick={() => onGiorno(c.data)}
                >
                  <span className="cal-num">{c.data.getDate()}</span>
                  <span className="cal-puntini" aria-hidden="true">
                    {lista.slice(0, 4).map((s) => (
                      <i key={s.id} className={`${s.tipo}${s.stato === 'completato' ? ' fatto' : ''}`} />
                    ))}
                    {lista.length > 4 && <b>+</b>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
