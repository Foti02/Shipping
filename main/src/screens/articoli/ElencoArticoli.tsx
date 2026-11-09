import { useEffect, useMemo, useState } from 'react';
import { useMagazzino } from '../../context/magazzino';
import { useApi } from '../../lib/api';
import { messaggioErrore } from '../../lib/errori';
import { qta } from '../../lib/formati';
import { scaricaCsv, stampa } from '../../lib/stampa';
import { Button, DataTable, EmptyState, Field, ordina, Select, useToast, type Colonna } from '../../ui';
import { Conferma, Legenda, StatoIcona, useScrivi } from './comuni';
import { FormArticolo } from './FormArticolo';
import { ImportaCsv } from './ImportaCsv';
import { centInEuro } from './logica';
import { PannelloArticolo } from './PannelloArticolo';
import type { Articolo } from './tipi';
import { Variazioni } from './Variazioni';

const TUTTE = '';
const ORDINE_STATO = { blu: 0, giallo: 1, verde: 2 } as const;

function useTelefono() {
  const q = '(max-width: 800px)';
  const [si, setSi] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setSi(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return si;
}

const testo = (a: Articolo) => [a.matricola, a.descrizione, a.barcode, a.codice_fornitore].join('\n').toLowerCase();

export function ElencoArticoli() {
  const m = useMagazzino();
  const toast = useToast();
  const scrivi = m.puo('articoli.scrivi');
  const telefono = useTelefono();
  const elenco = useApi<Articolo[]>('api_articoli_elenco', { p_magazzino: m.id });
  const [cerca, setCerca] = useState('');
  const [categoria, setCategoria] = useState(TUTTE);
  const [ordCarte, setOrdCarte] = useState('descrizione');
  const [selId, setSelId] = useState<string | null>(null);
  const [spunte, setSpunte] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{ articolo: Articolo | null } | null>(null);
  const [importa, setImporta] = useState(false);
  const [variazioni, setVariazioni] = useState(false);
  const [elimina, setElimina] = useState(false);
  const [errElimina, setErrElimina] = useState<string | null>(null);
  const eliminaArt = useScrivi('api_articolo_elimina');

  const tutti = elenco.data ?? [];
  const categorie = useMemo(() => [...new Set(tutti.map((a) => a.categoria))].sort((x, y) => x.localeCompare(y, 'it')), [tutti]);
  const righe = useMemo(() => {
    const c = cerca.trim().toLowerCase();
    return tutti.filter((a) => (categoria === TUTTE || a.categoria === categoria) && (!c || testo(a).includes(c)));
  }, [tutti, cerca, categoria]);
  const selezionato = righe.find((a) => a.id === selId) ?? null;
  const idsSpuntati = righe.filter((a) => spunte.has(a.id)).map((a) => a.id);
  const tuttiSpuntati = righe.length > 0 && idsSpuntati.length === righe.length;

  const alterna = (id: string) =>
    setSpunte((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const alternaTutti = () => setSpunte(tuttiSpuntati ? new Set() : new Set(righe.map((a) => a.id)));

  const colonne: Colonna<Articolo>[] = [
    ...(scrivi
      ? [{
          chiave: 'spunta', titolo: 'Sel.', ordinabile: false,
          render: (a: Articolo) => (
            <label className="art-spunta" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={spunte.has(a.id)} onChange={() => alterna(a.id)} aria-label={`Seleziona ${a.matricola} per le variazioni`} />
            </label>
          ),
        }]
      : []),
    { chiave: 'matricola', titolo: 'Matricola' },
    { chiave: 'descrizione', titolo: 'Descrizione' },
    { chiave: 'categoria', titolo: 'Categoria' },
    { chiave: 'carichi', titolo: 'Carichi', allinea: 'destra', render: (a) => qta(a.carichi), valore: (a) => Number(a.carichi) },
    { chiave: 'scarichi', titolo: 'Scarichi', allinea: 'destra', render: (a) => qta(a.scarichi), valore: (a) => Number(a.scarichi) },
    { chiave: 'resi', titolo: 'Resi', allinea: 'destra', render: (a) => qta(a.resi), valore: (a) => Number(a.resi) },
    { chiave: 'giacenza', titolo: 'Giacenza', aiuto: 'giacenza_ordinato', allinea: 'destra', render: (a) => `${qta(a.giacenza)} ${a.um}`, valore: (a) => Number(a.giacenza) },
    { chiave: 'ordinato', titolo: 'Ordinato', aiuto: 'giacenza_ordinato', allinea: 'destra', render: (a) => qta(a.ordinato), valore: (a) => Number(a.ordinato) },
    { chiave: 'stato_riga', titolo: 'Stato', aiuto: 'stato_riga', render: (a) => <StatoIcona stato={a.stato_riga} />, valore: (a) => ORDINE_STATO[a.stato_riga ?? 'verde'] },
  ];

  const esporta = () =>
    scaricaCsv('articoli', righe.map((a) => ({
      matricola: a.matricola, descrizione: a.descrizione, um: a.um, categoria: a.categoria,
      prezzo_acquisto: centInEuro(a.prezzo_acquisto_cent), iva: String(a.iva_perc).replace('.', ','),
      giacenza_iniziale: String(a.giacenza ?? 0).replace('.', ','),
      carichi: String(a.carichi ?? 0).replace('.', ','), scarichi: String(a.scarichi ?? 0).replace('.', ','),
      resi: String(a.resi ?? 0).replace('.', ','), ordinato: String(a.ordinato ?? 0).replace('.', ','),
    })));

  const conferma = () =>
    eliminaArt.mutate({ p_id: selezionato!.id }, {
      onSuccess: () => {
        toast('Articolo eliminato.', 'ok');
        setElimina(false);
        setSelId(null);
      },
      onError: (e) =>
        setErrElimina(
          e instanceof Error && e.message === 'stato_non_valido'
            ? `Non posso eliminare ${selezionato!.matricola}: ha già movimenti di magazzino o compare in qualche documento. Gli articoli usati restano nell'archivio per lo storico.`
            : messaggioErrore(e),
        ),
    });

  if (elenco.isError) return <p className="errore" role="alert">{messaggioErrore(elenco.error)}</p>;

  const valoreCarte = colonne.find((c) => c.chiave === ordCarte)?.valore ?? ((x: Articolo) => x[ordCarte as 'matricola']);
  const carte = ordina(righe, valoreCarte, 1);
  return (
    <>
      <div className="art-barra no-stampa">
        {scrivi && (
          <Button variante="accento" onClick={() => setForm({ articolo: null })}>
            Nuovo articolo
          </Button>
        )}
        {scrivi && (
          <Button variante="tenue" disabled={!selezionato} onClick={() => setForm({ articolo: selezionato })}>
            Modifica
          </Button>
        )}
        {scrivi && (
          <Button
            variante="pericolo"
            disabled={!selezionato}
            onClick={() => {
              setErrElimina(null);
              setElimina(true);
            }}
          >
            Elimina
          </Button>
        )}
        {scrivi && (
          <Button variante="tenue" onClick={() => setImporta(true)}>
            Importa CSV
          </Button>
        )}
        <Button variante="tenue" disabled={righe.length === 0} onClick={esporta}>
          Esporta CSV
        </Button>
        {scrivi && (
          <Button variante="tenue" disabled={idsSpuntati.length === 0} onClick={() => setVariazioni(true)}>
            Variazioni{idsSpuntati.length ? ` (${idsSpuntati.length})` : ''}
          </Button>
        )}
        <Button variante="tenue" disabled={righe.length === 0} onClick={stampa}>
          Stampa lista
        </Button>
      </div>

      <div className="art-filtri no-stampa">
        <Field label="Cerca" type="search" placeholder="Matricola, descrizione, codice a barre..." value={cerca} onChange={(e) => setCerca(e.target.value)} />
        <Select label="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} opzioni={[{ value: TUTTE, label: 'Tutte' }, ...categorie.map((c) => ({ value: c, label: c }))]} />
        {telefono && <Select label="Ordina per" value={ordCarte} onChange={(e) => setOrdCarte(e.target.value)} opzioni={colonne.filter((c) => c.ordinabile !== false).map((c) => ({ value: c.chiave, label: c.titolo }))} />}
      </div>

      <div className="art-riga">
        <p className="muto" role="status">
          Articoli nella lista: {righe.length}
          {scrivi && righe.length > 0 && (
            <>
              {' '}
              <label className="art-spunta-tutti no-stampa">
                <input type="checkbox" checked={tuttiSpuntati} onChange={alternaTutti} aria-label="Seleziona tutti gli articoli per le variazioni" /> Seleziona tutti per le variazioni
              </label>
            </>
          )}
        </p>
        <Legenda />
      </div>
      <p className="solo-stampa">Lista articoli di {m.nome}</p>

      {elenco.isPending ? (
        <p className="muto">Caricamento...</p>
      ) : telefono && righe.length > 0 ? (
        <ul className="art-carte">
          {carte.map((a) => (
            <li key={a.id} className={`art-carta${a.id === selId ? ' sel' : ''}`}>
              {scrivi && (
                <label className="art-spunta">
                  <input type="checkbox" checked={spunte.has(a.id)} onChange={() => alterna(a.id)} aria-label={`Seleziona ${a.matricola} per le variazioni`} />
                </label>
              )}
              <button type="button" className="art-carta-corpo" aria-pressed={a.id === selId} onClick={() => setSelId(a.id === selId ? null : a.id)}>
                <span className="art-carta-testa">
                  <strong>{a.matricola}</strong>
                  <StatoIcona stato={a.stato_riga} />
                </span>
                <span>{a.descrizione}</span>
                <span className="muto">{a.categoria}</span>
                <span className="art-carta-num">
                  <b><span>Giacenza</span>{qta(a.giacenza)} {a.um}</b>
                  <b><span>Ordinato</span>{qta(a.ordinato)}</b>
                  <b><span>Carichi / scarichi / resi</span>{qta(a.carichi)} / {qta(a.scarichi)} / {qta(a.resi)}</b>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <DataTable<Articolo>
          righe={righe}
          colonne={colonne}
          rigaId={(a) => a.id}
          onSeleziona={(a) => setSelId(a?.id ?? null)}
          vuoto={
            <EmptyState
              titolo={tutti.length ? 'Nessun articolo corrisponde alla ricerca' : 'Nessun articolo'}
              testo={tutti.length ? 'Cambia il testo o la categoria.' : scrivi ? 'Crea il primo con «Nuovo articolo» o importa un file CSV.' : 'Il magazzino è ancora vuoto.'}
            />
          }
        />
      )}
      {!selezionato && righe.length > 0 && <p className="muto no-stampa">Scegli un articolo per vederne i movimenti{scrivi ? ' e modificarlo' : ''}.</p>}
      {selezionato && <PannelloArticolo articolo={selezionato} />}

      <FormArticolo aperto={!!form} articolo={form?.articolo ?? null} categorie={categorie} onChiudi={() => setForm(null)} />
      <ImportaCsv aperto={importa} onChiudi={() => setImporta(false)} />
      <Variazioni aperto={variazioni} ids={idsSpuntati} onChiudi={() => setVariazioni(false)} />
      <Conferma aperto={elimina} titolo="Elimina articolo" errore={errElimina} occupato={eliminaArt.isPending} onConferma={conferma} onChiudi={() => setElimina(false)}>
        Eliminare l&apos;articolo <strong>{selezionato?.matricola}</strong> - {selezionato?.descrizione}? L&apos;operazione non si può annullare.
      </Conferma>
    </>
  );
}
