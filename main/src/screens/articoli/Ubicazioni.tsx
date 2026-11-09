import { useState, type FormEvent } from 'react';
import { useMagazzino } from '../../context/magazzino';
import { useApi } from '../../lib/api';
import { messaggioErrore } from '../../lib/errori';
import { qta } from '../../lib/formati';
import { Button, DataTable, Dialog, EmptyState, Field, useToast } from '../../ui';
import { Conferma, ErroreForm, useScrivi } from './comuni';
import type { Ubicazione } from './tipi';

export function Ubicazioni() {
  const m = useMagazzino();
  const toast = useToast();
  const scrivi = m.puo('lotti_ubicazioni');
  const elenco = useApi<Ubicazione[]>('api_ubicazioni_elenco', { p_magazzino: m.id });
  const [sel, setSel] = useState<Ubicazione | null>(null);
  const [form, setForm] = useState<{ ubicazione: Ubicazione | null } | null>(null);
  const [elimina, setElimina] = useState(false);
  const [errElimina, setErrElimina] = useState<string | null>(null);
  const eliminaUb = useScrivi('api_ubicazione_elimina');

  // Dopo una modifica la riga selezionata va riletta dall'elenco aggiornato.
  const corrente = sel && elenco.data?.find((u) => u.id === sel.id);

  const conferma = () =>
    eliminaUb.mutate({ p_id: corrente!.id }, {
      onSuccess: () => {
        toast('Ubicazione eliminata.', 'ok');
        setElimina(false);
        setSel(null);
      },
      onError: (e) =>
        setErrElimina(
          e instanceof Error && e.message === 'stato_non_valido'
            ? `Non posso eliminare ${corrente!.codice}: contiene ancora merce. Sposta prima le giacenze con un trasferimento.`
            : messaggioErrore(e),
        ),
    });

  return (
    <section aria-label="Ubicazioni">
      <p className="muto">Le ubicazioni dicono dove sta la merce nel magazzino (zona, corridoio, scaffale). Si assegnano ai singoli articoli dalla scheda Logistica.</p>
      {scrivi && (
        <div className="art-barra no-stampa">
          <Button variante="accento" onClick={() => setForm({ ubicazione: null })}>
            Nuova ubicazione
          </Button>
          <Button variante="tenue" disabled={!corrente} onClick={() => setForm({ ubicazione: corrente! })}>
            Modifica
          </Button>
          <Button
            variante="pericolo"
            disabled={!corrente}
            onClick={() => {
              setErrElimina(null);
              setElimina(true);
            }}
          >
            Elimina
          </Button>
        </div>
      )}
      {elenco.isError ? (
        <p className="errore" role="alert">{messaggioErrore(elenco.error)}</p>
      ) : (
        <DataTable<Ubicazione>
          righe={elenco.data ?? []}
          rigaId={(u) => u.id}
          onSeleziona={setSel}
          vuoto={<EmptyState titolo="Nessuna ubicazione" testo={scrivi ? 'Creane una con «Nuova ubicazione».' : 'Non ce ne sono ancora.'} />}
          colonne={[
            { chiave: 'codice', titolo: 'Codice' },
            { chiave: 'zona', titolo: 'Zona' },
            { chiave: 'corridoio', titolo: 'Corridoio' },
            { chiave: 'scaffale', titolo: 'Scaffale' },
            { chiave: 'n_articoli', titolo: 'Articoli', allinea: 'destra' },
            { chiave: 'qta_totale', titolo: 'Merce presente', allinea: 'destra', render: (u) => qta(u.qta_totale), valore: (u) => Number(u.qta_totale) },
          ]}
        />
      )}

      <FormUbicazione aperto={!!form} ubicazione={form?.ubicazione ?? null} onChiudi={() => setForm(null)} />
      <Conferma aperto={elimina} titolo="Elimina ubicazione" errore={errElimina} occupato={eliminaUb.isPending} onConferma={conferma} onChiudi={() => setElimina(false)}>
        Eliminare l&apos;ubicazione <strong>{corrente?.codice}</strong>? Gli articoli che la usano resteranno senza ubicazione.
      </Conferma>
    </section>
  );
}

function FormUbicazione({ aperto, ubicazione, onChiudi }: { aperto: boolean; ubicazione: Ubicazione | null; onChiudi: () => void }) {
  return (
    <Dialog aperto={aperto} titolo={ubicazione ? 'Modifica ubicazione' : 'Nuova ubicazione'} onChiudi={onChiudi}>
      <Corpo ubicazione={ubicazione} onChiudi={onChiudi} />
    </Dialog>
  );
}

function Corpo({ ubicazione, onChiudi }: { ubicazione: Ubicazione | null; onChiudi: () => void }) {
  const m = useMagazzino();
  const toast = useToast();
  const [f, setF] = useState({ codice: ubicazione?.codice ?? '', zona: ubicazione?.zona ?? '', corridoio: ubicazione?.corridoio ?? '', scaffale: ubicazione?.scaffale ?? '' });
  const [errCodice, setErrCodice] = useState<string | undefined>();
  const [errore, setErrore] = useState<string | null>(null);
  const salva = useScrivi('api_ubicazione_salva');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((v) => ({ ...v, [k]: e.target.value }));

  const invia = (e: FormEvent) => {
    e.preventDefault();
    if (!f.codice.trim()) return setErrCodice('Scrivi il codice dell\'ubicazione.');
    setErrCodice(undefined);
    const dati = { codice: f.codice.trim(), zona: f.zona.trim() || null, corridoio: f.corridoio.trim() || null, scaffale: f.scaffale.trim() || null };
    salva.mutate({ p_magazzino: m.id, p_dati: ubicazione ? { ...dati, id: ubicazione.id } : dati }, {
      onSuccess: () => {
        toast('Ubicazione salvata.', 'ok');
        onChiudi();
      },
      onError: (err) => {
        if (err instanceof Error && err.message === 'gia_esiste') setErrCodice('Esiste già un\'ubicazione con questo codice.');
        else setErrore(messaggioErrore(err));
      },
    });
  };

  return (
    <form onSubmit={invia} noValidate>
      <ErroreForm testo={errore} />
      <Field label="Codice" value={f.codice} onChange={set('codice')} errore={errCodice} nota="Per esempio A-01-03." maxLength={30} />
      <Field label="Zona" value={f.zona} onChange={set('zona')} />
      <Field label="Corridoio" value={f.corridoio} onChange={set('corridoio')} />
      <Field label="Scaffale" value={f.scaffale} onChange={set('scaffale')} />
      <div className="dialog-azioni">
        <Button variante="tenue" onClick={onChiudi}>
          Annulla
        </Button>
        <Button type="submit" variante="accento" disabled={salva.isPending}>
          Salva
        </Button>
      </div>
    </form>
  );
}
