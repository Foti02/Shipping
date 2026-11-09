import { useMemo, useState } from 'react';
import { useMagazzino } from '../context/magazzino';
import { useApi, useMutazione } from '../lib/api';
import { messaggioErrore } from '../lib/errori';
import { Button } from '../ui';
import { CalendarioMese } from './agenda/CalendarioMese';
import { DialogoScadenza } from './agenda/DialogoScadenza';
import { aggiungiGiorni, aggiungiMesi, grigliaMese, inizioGiorno, perGiorno, chiave, type Scadenza } from './agenda/griglia';
import { VistaGiorno } from './agenda/VistaGiorno';
import './agenda/agenda.css';

const fMese = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
const fGiorno = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

type Bozza = Pick<Scadenza, 'inizio' | 'fine'> & Partial<Scadenza>;

export default function Agenda() {
  const m = useMagazzino();
  const scrive = m.puo('scadenze');
  const [giorno, setGiorno] = useState(() => inizioGiorno(new Date()));
  const [aperta, setAperta] = useState<Bozza | null>(null);
  const oggi = inizioGiorno(new Date());

  // La lettura filtra per data di inizio: si parte un mese prima della griglia per non perdere le voci su piu' giorni.
  const celle = grigliaMese(giorno);
  const dal = aggiungiGiorni(celle[0].data, -31).toISOString();
  const al = aggiungiGiorni(celle[celle.length - 1].data, 1).toISOString();
  const q = useApi<Scadenza[]>('api_scadenze_elenco', { p_magazzino: m.id, p_dal: dal, p_al: al });
  const voci = useMemo(() => perGiorno(q.data ?? []), [q.data]);
  const delGiorno = voci.get(chiave(giorno)) ?? [];

  const salva = useMutazione('api_scadenza_salva');
  const cambiaStato = (s: Scadenza) =>
    salva.mutate({
      p_magazzino: m.id,
      // Il database sovrascrive i campi assenti: si rimanda la riga intera.
      p_dati: { id: s.id, oggetto: s.oggetto, descrizione: s.descrizione, inizio: s.inizio, fine: s.fine, tipo: s.tipo, anagrafica_id: s.anagrafica_id, stato: s.stato === 'completato' ? 'in_sospeso' : 'completato' },
    });

  const nuova = (ora?: number) => {
    const ini = new Date(giorno);
    ini.setHours(ora ?? (+giorno === +oggi ? Math.min(new Date().getHours() + 1, 23) : 9), 0, 0, 0);
    setAperta({ inizio: ini.toISOString(), fine: new Date(+ini + 3600000).toISOString() });
  };

  return (
    <div className="agenda-pagina">
      <h1>
        Agenda<span className="dot">.</span>
      </h1>
      <p className="muto">Agenda personale: in questo magazzino le voci le vedi solo tu.</p>

      <div className="barra-azioni">
        {scrive && (
          <Button variante="accento" onClick={() => nuova()}>
            Nuova scadenza/appuntamento
          </Button>
        )}
        <Button variante="tenue" onClick={() => setGiorno(oggi)}>
          Oggi
        </Button>
      </div>

      {q.isError && (
        <p className="form-errore" role="alert">
          {messaggioErrore(q.error)}
        </p>
      )}

      <div className="ag-layout">
        <section className="carta" aria-label="Mese">
          <div className="ag-nav">
            <Button variante="tenue" aria-label="Mese precedente" onClick={() => setGiorno(aggiungiMesi(giorno, -1))}>
              ‹
            </Button>
            <h2 aria-live="polite">{fMese.format(giorno)}</h2>
            <Button variante="tenue" aria-label="Mese successivo" onClick={() => setGiorno(aggiungiMesi(giorno, 1))}>
              ›
            </Button>
          </div>
          <CalendarioMese giorno={giorno} oggi={oggi} voci={voci} onGiorno={setGiorno} />
          <p className="ag-legenda muto">
            <span className="appuntamento" /> Appuntamento <span className="scadenza" /> Scadenza
          </p>
        </section>

        <section className="carta" aria-label="Giorno">
          <div className="ag-nav">
            <Button variante="tenue" aria-label="Giorno precedente" onClick={() => setGiorno(aggiungiGiorni(giorno, -1))}>
              ‹
            </Button>
            <h2 aria-live="polite">{fGiorno.format(giorno)}</h2>
            <Button variante="tenue" aria-label="Giorno successivo" onClick={() => setGiorno(aggiungiGiorni(giorno, 1))}>
              ›
            </Button>
          </div>
          <VistaGiorno
            giorno={giorno}
            voci={delGiorno}
            puoScrivere={scrive}
            onApri={(s) => setAperta(s)}
            onNuova={nuova}
            onStato={cambiaStato}
          />
        </section>
      </div>

      <DialogoScadenza aperto={!!aperta} magazzino={m.id} scadenza={aperta ?? { inizio: '', fine: '' }} puoScrivere={scrive} onChiudi={() => setAperta(null)} />
    </div>
  );
}
