import { useState } from 'react';
import { useApi, useMutazione } from '../../lib/api';
import { Button, Dialog, Field, Select } from '../../ui';
import '../anagrafiche/anagrafiche.css'; // .form-griglia e .senza-cornice
import { aInputLocale, daInputLocale, type Scadenza } from './griglia';

interface Props {
  aperto: boolean;
  magazzino: string;
  /** Con `id` = modifica; senza = nuova con questi valori iniziali. */
  scadenza: Pick<Scadenza, 'inizio' | 'fine'> & Partial<Scadenza>;
  puoScrivere: boolean;
  onChiudi: () => void;
}

interface Anagrafica { id: string; ragione_sociale: string; tipo: string }

export function DialogoScadenza({ aperto, ...p }: Props) {
  return (
    <Dialog aperto={aperto} titolo="Scadenza o appuntamento" onChiudi={p.onChiudi}>
      <Form {...p} />
    </Dialog>
  );
}

function Form({ magazzino, scadenza, puoScrivere, onChiudi }: Omit<Props, 'aperto'>) {
  const [v, setV] = useState({
    oggetto: scadenza.oggetto ?? '',
    descrizione: scadenza.descrizione ?? '',
    inizio: aInputLocale(scadenza.inizio),
    fine: aInputLocale(scadenza.fine),
    tipo: scadenza.tipo ?? 'appuntamento',
    anagrafica_id: scadenza.anagrafica_id ?? '',
  });
  const [provato, setProvato] = useState(false);
  const [conferma, setConferma] = useState(false);
  const anagrafiche = useApi<Anagrafica[]>('api_anagrafiche_elenco', { p_magazzino: magazzino });
  const salva = useMutazione('api_scadenza_salva', { ok: 'Scadenza salvata' });
  const elimina = useMutazione('api_scadenza_elimina', { ok: 'Scadenza eliminata' });

  const ini = daInputLocale(v.inizio);
  const fine = daInputLocale(v.fine);
  const err = {
    oggetto: !v.oggetto.trim() ? "L'oggetto è obbligatorio." : undefined,
    inizio: !ini ? "Scegli data e ora di inizio." : undefined,
    fine: !fine ? 'Scegli data e ora di fine.' : ini && fine < ini ? "La fine non può essere prima dell'inizio." : undefined,
  };

  // Spostando l'inizio la fine lo segue, cosi' la durata resta quella.
  const cambiaInizio = (nuovo: string) => {
    const vecchio = new Date(v.inizio);
    const n = new Date(nuovo);
    const f = new Date(v.fine);
    const spostata = !isNaN(+vecchio) && !isNaN(+n) && !isNaN(+f) ? aInputLocale(new Date(+f + (+n - +vecchio))) : v.fine;
    setV({ ...v, inizio: nuovo, fine: spostata });
  };

  const opzioniAna = [
    { value: '', label: 'Nessuna' },
    ...(anagrafiche.data ?? []).map((a) => ({ value: a.id, label: `${a.ragione_sociale} (${a.tipo === 'cliente' ? 'cliente' : 'fornitore'})` })),
  ];

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setProvato(true);
        if (err.oggetto || err.inizio || err.fine) return;
        salva.mutate(
          {
            p_magazzino: magazzino,
            // Il database sovrascrive anche i campi assenti: li rimandiamo tutti (stato compreso).
            p_dati: {
              id: scadenza.id,
              oggetto: v.oggetto.trim(),
              descrizione: v.descrizione.trim() || null,
              inizio: ini,
              fine,
              tipo: v.tipo,
              stato: scadenza.stato ?? 'in_sospeso',
              anagrafica_id: v.anagrafica_id || null,
            },
          },
          { onSuccess: onChiudi },
        );
      }}
    >
      <fieldset disabled={!puoScrivere} className="senza-cornice">
        <Field label="Oggetto *" value={v.oggetto} onChange={(e) => setV({ ...v, oggetto: e.target.value })} errore={provato ? err.oggetto : undefined} autoFocus />
        <Field label="Descrizione" value={v.descrizione} onChange={(e) => setV({ ...v, descrizione: e.target.value })} />
        <div className="form-griglia">
          <Field label="Inizio" type="datetime-local" value={v.inizio} onChange={(e) => cambiaInizio(e.target.value)} errore={provato ? err.inizio : undefined} />
          <Field label="Fine" type="datetime-local" value={v.fine} onChange={(e) => setV({ ...v, fine: e.target.value })} errore={provato || err.fine ? err.fine : undefined} />
          <Select
            label="Tipo"
            value={v.tipo}
            onChange={(e) => setV({ ...v, tipo: e.target.value as Scadenza['tipo'] })}
            opzioni={[{ value: 'appuntamento', label: 'Appuntamento' }, { value: 'scadenza', label: 'Scadenza' }]}
          />
          <Select label="Anagrafica (facoltativa)" value={v.anagrafica_id} onChange={(e) => setV({ ...v, anagrafica_id: e.target.value })} opzioni={opzioniAna} />
        </div>
      </fieldset>
      {!puoScrivere && <p className="muto">Il tuo ruolo può solo consultare l&apos;agenda.</p>}
      <div className="dialog-azioni">
        {puoScrivere && scadenza.id && (
          <Button
            variante="pericolo"
            disabled={elimina.isPending}
            onClick={() => (conferma ? elimina.mutate({ p_id: scadenza.id }, { onSuccess: onChiudi }) : setConferma(true))}
          >
            {conferma ? 'Conferma eliminazione' : 'Elimina'}
          </Button>
        )}
        <Button variante="tenue" onClick={onChiudi}>
          {puoScrivere ? 'Annulla' : 'Chiudi'}
        </Button>
        {puoScrivere && (
          <Button type="submit" variante="accento" disabled={salva.isPending}>
            Salva
          </Button>
        )}
      </div>
    </form>
  );
}
