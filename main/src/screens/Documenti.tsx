import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMagazzino } from '../context/magazzino';
import { useApi } from '../lib/api';
import { data as fData, euro } from '../lib/formati';
import { scaricaCsv } from '../lib/stampa';
import { Badge, Button, DataTable, Dialog, EmptyState, Field, Select, Tabs, type Colonna } from '../ui';
import '../ui/print.css';
import './documenti/documenti.css';
import { centInEuro } from './documenti/calcolo';
import { BadgeStatoDoc, Dettaglio } from './documenti/Dettaglio';
import { EditorDocumento } from './documenti/Editor';
import { GRUPPI, PASSI_SPEDIZIONE, STATI_DOC, TIPI, eTipoDoc, minuscolo, numeroDoc, type RigaElenco, type TipoDoc } from './documenti/tipi';

/** Rotta `/m/:id/documenti/:tipo`: una sola schermata configurata dal tipo (vedi documenti/tipi.ts). */
export default function Documenti() {
  const { tipo } = useParams();
  if (!eTipoDoc(tipo)) return <EmptyState titolo="Tipo di documento sconosciuto" testo="Scegli una voce dal menu." />;
  return <Schermata key={tipo} tipo={tipo} />;
}

function useRitardo<T>(valore: T, ms: number) {
  const [v, setV] = useState(valore);
  useEffect(() => {
    const t = setTimeout(() => setV(valore), ms);
    return () => clearTimeout(t);
  }, [valore, ms]);
  return v;
}

function Schermata({ tipo }: { tipo: TipoDoc }) {
  const m = useMagazzino();
  const cfg = TIPI[tipo];
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selezionato = params.get('doc');
  const [dal, setDal] = useState('');
  const [al, setAl] = useState('');
  const [stato, setStato] = useState('');
  const [cerca, setCerca] = useState('');
  const [editor, setEditor] = useState<{ tipo: TipoDoc; id: string | null } | null>(null);
  const cercaRitardata = useRitardo(cerca.trim(), 300);

  const elenco = useApi<RigaElenco[]>('api_documenti_elenco', {
    p_magazzino: m.id, p_tipo: tipo, p_dal: dal || null, p_al: al || null, p_stato: stato || null, p_cerca: cercaRitardata || null,
  });

  /** Seleziona un documento: nella stessa schermata se del tipo corrente, altrimenti passa alla sua. */
  const mostra = (t: TipoDoc, id: string | null) => {
    if (t === tipo) setParams(id ? { doc: id } : {}, { replace: true });
    else navigate(`/m/${m.id}/documenti/${t}${id ? `?doc=${id}` : ''}`);
  };

  const colonne: Colonna<RigaElenco>[] = [
    { chiave: 'data', titolo: 'Data', render: (r) => fData(r.data) },
    { chiave: 'numero', titolo: 'Numero', render: (r) => (r.numero == null ? <em>Bozza</em> : numeroDoc(r)), valore: (r) => r.numero },
    { chiave: 'anagrafica', titolo: cfg.etichettaControparte, render: (r) => r.anagrafica ?? '-' },
    { chiave: 'totale_cent', titolo: 'Totale', allinea: 'destra', render: (r) => euro(r.totale_cent), valore: (r) => Number(r.totale_cent) },
    {
      chiave: 'stato', titolo: 'Stato', aiuto: 'stato_documento',
      render: (r) => (
        <>
          <BadgeStatoDoc stato={r.stato} />
          {cfg.fattura && r.stato !== 'bozza' && r.stato !== 'annullato' && <> <Badge tono={r.pagato ? 'verde' : 'giallo'}>{r.pagato ? 'Pagato' : 'Da pagare'}</Badge></>}
        </>
      ),
    },
    ...(cfg.spedizione
      ? [{
          chiave: 'stato_spedizione', titolo: 'Spedizione', aiuto: 'stato_spedizione' as const,
          render: (r: RigaElenco) => (r.stato_spedizione ? PASSI_SPEDIZIONE.find((p) => p.id === r.stato_spedizione)?.testo ?? r.stato_spedizione : '-'),
        }]
      : []),
  ];

  const esporta = () =>
    scaricaCsv(
      `${tipo}-elenco`,
      (elenco.data ?? []).map((r) => ({
        Data: fData(r.data), Numero: numeroDoc(r), [cfg.etichettaControparte]: r.anagrafica ?? '', Totale: centInEuro(Number(r.totale_cent)), Stato: r.stato,
        ...(cfg.spedizione ? { Spedizione: r.stato_spedizione ?? '' } : {}),
      })),
    );

  return (
    <div className="doc-schermata">
      <h1 className="no-stampa">
        {cfg.titolo}
      </h1>
      <div className="no-stampa">
        <div className="solo-piccolo">
          <Tabs
            voci={GRUPPI[cfg.gruppo].map((t) => ({ id: t, etichetta: TIPI[t].titolo }))}
            attiva={tipo}
            onCambia={(t) => navigate(`/m/${m.id}/documenti/${t}`)}
          />
        </div>

        <div className="doc-filtri">
          <Field label="Dal" type="date" value={dal} onChange={(e) => setDal(e.target.value)} />
          <Field label="Al" type="date" value={al} onChange={(e) => setAl(e.target.value)} />
          <Select label="Stato" opzioni={STATI_DOC} value={stato} onChange={(e) => setStato(e.target.value)} />
          <Field label="Cerca" type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Nome, numero, articolo" />
        </div>
        <div className="buttons">
          {m.puo(cfg.azione) && <Button variante="accento" onClick={() => setEditor({ tipo, id: null })}>Nuovo: {minuscolo(cfg.singolare)}</Button>}
          <Button variante="tenue" onClick={esporta} disabled={!elenco.data?.length}>Esporta CSV</Button>
        </div>
      </div>

      {elenco.isError ? (
        <p className="form-errore" role="alert">Non riesco a leggere i documenti. Riprova tra poco.</p>
      ) : elenco.isLoading ? (
        <p className="muto">Caricamento...</p>
      ) : (
        <div className="no-stampa-lista">
          <DataTable
            key={tipo}
            righe={elenco.data ?? []}
            colonne={colonne}
            rigaId={(r) => r.id}
            onSeleziona={(r) => mostra(tipo, r?.id ?? null)}
            vuoto={<EmptyState titolo="Nessun documento" testo="Cambia i filtri oppure creane uno nuovo." />}
          />
        </div>
      )}

      {selezionato && <Dettaglio key={selezionato} id={selezionato} onModifica={(t, id) => setEditor({ tipo: t, id })} onMostra={mostra} />}

      <Dialog aperto={!!editor} titolo={editor ? `${editor.id ? 'Modifica' : 'Nuovo'}: ${minuscolo(TIPI[editor.tipo].singolare)}` : ''} onChiudi={() => setEditor(null)}>
        {editor && (
          <EditorDocumento
            tipo={editor.tipo}
            id={editor.id}
            onChiudi={() => setEditor(null)}
            onFatto={(id) => {
              const t = editor.tipo;
              setEditor(null);
              mostra(t, id);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
