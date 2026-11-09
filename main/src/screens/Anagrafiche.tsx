import { useMemo, useState } from 'react';
import { useMagazzino } from '../context/magazzino';
import { useApi, useMutazione } from '../lib/api';
import { messaggioErrore } from '../lib/errori';
import { scaricaCsv, stampa } from '../lib/stampa';
import { Badge, Button, DataTable, Dialog, EmptyState, Field, Tabs, type Colonna } from '../ui';
import { DialogoAnagrafica } from './anagrafiche/DialogoAnagrafica';
import { DialogoAzienda } from './anagrafiche/DialogoAzienda';
import { filtra, righeCsv, type Anagrafica, type Filtro, type Tipo } from './anagrafiche/logica';
import { Storico, useStorico } from './anagrafiche/Storico';
import './anagrafiche/anagrafiche.css';

const SCHEDE = [
  { id: 'cliente', etichetta: 'Clienti' },
  { id: 'fornitore', etichetta: 'Fornitori' },
  { id: 'tutti', etichetta: 'Tutti' },
];

const COLONNE: Colonna<Anagrafica>[] = [
  {
    chiave: 'ragione_sociale',
    titolo: 'Ragione sociale',
    render: (r) => (
      <>
        {r.ragione_sociale} <Badge tono={r.tipo === 'cliente' ? 'blu' : 'giallo'}>{r.tipo === 'cliente' ? 'Cliente' : 'Fornitore'}</Badge>
      </>
    ),
  },
  { chiave: 'indirizzo', titolo: 'Indirizzo' },
  { chiave: 'comune', titolo: 'Comune' },
  { chiave: 'telefono', titolo: 'Telefono' },
  { chiave: 'cellulare', titolo: 'Cellulare' },
  { chiave: 'email', titolo: 'E-mail' },
  { chiave: 'cod_fisc', titolo: 'Codice fiscale' },
];

type Modale = { tipo: 'nuovo'; nuovo: Tipo } | { tipo: 'modifica' } | { tipo: 'elimina' } | { tipo: 'azienda' } | null;

export default function Anagrafiche() {
  const m = useMagazzino();
  const scrive = m.puo('anagrafiche.scrivi');
  const [filtro, setFiltro] = useState<Filtro>('cliente');
  const [cerca, setCerca] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [modale, setModale] = useState<Modale>(null);

  const elenco = useApi<Anagrafica[]>('api_anagrafiche_elenco', { p_magazzino: m.id });
  const righe = useMemo(() => filtra(elenco.data ?? [], filtro, cerca), [elenco.data, filtro, cerca]);
  const sel = righe.find((r) => r.id === selId) ?? null;
  const chiudi = () => setModale(null);

  return (
    <div className="anagrafiche-pagina">
      <h1>
        Anagrafiche<span className="dot">.</span>
      </h1>

      <div className="barra-azioni no-stampa">
        {scrive && (
          <>
            <Button variante="accento" onClick={() => setModale({ tipo: 'nuovo', nuovo: 'cliente' })}>
              Nuovo cliente
            </Button>
            <Button variante="accento" onClick={() => setModale({ tipo: 'nuovo', nuovo: 'fornitore' })}>
              Nuovo fornitore
            </Button>
            <Button variante="tenue" disabled={!sel} onClick={() => setModale({ tipo: 'modifica' })}>
              Modifica
            </Button>
            <Button variante="tenue" disabled={!sel} onClick={() => setModale({ tipo: 'elimina' })}>
              Elimina
            </Button>
          </>
        )}
        <Button variante="tenue" disabled={!righe.length} onClick={() => scaricaCsv('anagrafiche', righeCsv(righe))}>
          Esporta CSV
        </Button>
        <Button variante="tenue" disabled={!righe.length} onClick={stampa}>
          Stampa
        </Button>
        <Button variante="tenue" onClick={() => setModale({ tipo: 'azienda' })}>
          Dati azienda
        </Button>
      </div>

      <div className="no-stampa">
        <Tabs voci={SCHEDE} attiva={filtro} onCambia={(id) => setFiltro(id as Filtro)} />
        <Field label="Cerca" type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Nome, comune, partita IVA, e-mail..." />
      </div>

      {elenco.isError ? (
        <p className="form-errore" role="alert">
          {messaggioErrore(elenco.error)}
        </p>
      ) : !elenco.data ? (
        <p className="muto">Caricamento...</p>
      ) : (
        <DataTable
          righe={righe}
          colonne={COLONNE}
          rigaId={(r) => r.id}
          onSeleziona={(r) => setSelId(r?.id ?? null)}
          dettaglio={(r) => <Storico id={r.id} nome={r.ragione_sociale} />}
          vuoto={
            <EmptyState
              titolo={cerca ? 'Nessun risultato' : 'Nessuna anagrafica'}
              testo={cerca ? 'Prova con un altro testo o con la scheda "Tutti".' : scrive ? 'Inserisci il primo cliente o fornitore.' : undefined}
            />
          }
        />
      )}
      <p className="muto">Numero di anagrafiche nella lista: {righe.length}</p>

      <DialogoAnagrafica
        aperto={modale?.tipo === 'nuovo' || modale?.tipo === 'modifica'}
        magazzino={m.id}
        tipo={modale?.tipo === 'nuovo' ? modale.nuovo : 'cliente'}
        anagrafica={modale?.tipo === 'modifica' ? (sel ?? undefined) : undefined}
        onChiudi={chiudi}
      />
      <DialogoAzienda aperto={modale?.tipo === 'azienda'} magazzino={m.id} puoScrivere={scrive} onChiudi={chiudi} />
      <Dialog aperto={modale?.tipo === 'elimina' && !!sel} titolo="Elimina anagrafica" onChiudi={chiudi}>
        {sel && <ConfermaElimina a={sel} onFatto={() => { setSelId(null); chiudi(); }} onChiudi={chiudi} />}
      </Dialog>
    </div>
  );
}

function ConfermaElimina({ a, onFatto, onChiudi }: { a: Anagrafica; onFatto: () => void; onChiudi: () => void }) {
  const storico = useStorico(a.id);
  const elimina = useMutazione('api_anagrafica_elimina', { ok: 'Anagrafica eliminata' });
  const ndoc = storico.data?.length ?? 0;
  return (
    <>
      {ndoc > 0 ? (
        <p className="form-errore" role="alert">
          {a.ragione_sociale} ha {ndoc === 1 ? '1 documento collegato' : `${ndoc} documenti collegati`}: non si può eliminare.
          Annulla o elimina prima i documenti.
        </p>
      ) : (
        <p>
          Eliminare <strong>{a.ragione_sociale}</strong>? L&apos;operazione non si può annullare.
        </p>
      )}
      <div className="dialog-azioni">
        <Button variante="tenue" onClick={onChiudi}>
          {ndoc > 0 ? 'Chiudi' : 'Annulla'}
        </Button>
        {ndoc === 0 && (
          <Button variante="pericolo" disabled={!storico.isSuccess || elimina.isPending} onClick={() => elimina.mutate({ p_id: a.id }, { onSuccess: onFatto })}>
            Elimina
          </Button>
        )}
      </div>
    </>
  );
}
