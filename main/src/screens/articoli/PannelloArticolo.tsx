import { useState, type FormEvent } from 'react';
import { useMagazzino } from '../../context/magazzino';
import { useApi } from '../../lib/api';
import { messaggioErrore } from '../../lib/errori';
import { data, dataOra, euro, qta } from '../../lib/formati';
import { Button, DataTable, Dialog, EmptyState, Field, Tabs, useToast } from '../../ui';
import { ErroreForm, useScrivi } from './comuni';
import type { Articolo, DettaglioArticolo, GiacenzaRiga, Lotto, Movimento } from './tipi';

const CAUSALI: Record<string, string> = {
  apertura: 'Apertura', carico: 'Carico', scarico: 'Scarico', reso_cliente: 'Reso del cliente', rettifica: 'Rettifica inventario',
  trasferimento_in: 'Trasferimento (entrata)', trasferimento_out: 'Trasferimento (uscita)', annullo: 'Annullo documento',
};
const segno = (n: number) => (Number(n) > 0 ? '+' : '') + qta(n);

const VOCI = [
  { id: 'pn-movimenti', etichetta: 'Movimenti' },
  { id: 'pn-lotti', etichetta: 'Lotti' },
  { id: 'pn-giacenze', etichetta: 'Giacenze' },
];

/** Pannello "Movimenti dell'articolo": ultimi movimenti, lotti e giacenze per lotto/ubicazione dell'articolo scelto. */
export function PannelloArticolo({ articolo }: { articolo: Articolo }) {
  const [scheda, setScheda] = useState('pn-movimenti');
  const dettaglio = useApi<DettaglioArticolo>('api_articolo_leggi', { p_id: articolo.id });
  const d = dettaglio.data;
  return (
    <section className="art-pannello no-stampa" aria-label="Movimenti dell'articolo">
      <h2>
        Movimenti dell&apos;articolo: {articolo.matricola} <span className="muto">{articolo.descrizione}</span>
      </h2>
      <Tabs voci={VOCI} attiva={scheda} onCambia={setScheda} />
      <div role="tabpanel" aria-labelledby={`tab-${scheda}`}>
        {scheda === 'pn-lotti' ? (
          <Lotti articolo={articolo} />
        ) : dettaglio.isError ? (
          <p className="errore" role="alert">{messaggioErrore(dettaglio.error)}</p>
        ) : !d ? (
          <p className="muto">Caricamento...</p>
        ) : scheda === 'pn-movimenti' ? (
          <Movimenti righe={d.movimenti} um={articolo.um} />
        ) : (
          <Giacenze righe={d.giacenze} totale={d.giacenza} um={articolo.um} />
        )}
      </div>
    </section>
  );
}

function Movimenti({ righe, um }: { righe: Movimento[]; um: string }) {
  return (
    <>
      <p className="muto">Gli ultimi 20, dal più recente.</p>
      <DataTable<Movimento>
        righe={righe}
        rigaId={(r) => String(r.id)}
        vuoto={<EmptyState titolo="Nessun movimento" testo="Carichi, scarichi e inventari compariranno qui." />}
        colonne={[
          { chiave: 'created_at', titolo: 'Data', render: (r) => dataOra(r.created_at), valore: (r) => r.created_at },
          { chiave: 'causale', titolo: 'Movimento', render: (r) => CAUSALI[r.causale] ?? r.causale },
          { chiave: 'qta', titolo: `Quantità (${um})`, allinea: 'destra', render: (r) => segno(r.qta), valore: (r) => Number(r.qta) },
          { chiave: 'lotto_codice', titolo: 'Lotto' },
          { chiave: 'ubicazione_codice', titolo: 'Ubicazione', aiuto: 'ubicazione' },
          { chiave: 'costo_unit_cent', titolo: 'Costo unitario', allinea: 'destra', render: (r) => (r.costo_unit_cent == null ? '' : euro(r.costo_unit_cent)), valore: (r) => r.costo_unit_cent },
          { chiave: 'username', titolo: 'Utente' },
        ]}
      />
    </>
  );
}

function Giacenze({ righe, totale, um }: { righe: GiacenzaRiga[]; totale: number; um: string }) {
  return (
    <>
      <p>
        Giacenza totale: <strong>{qta(totale)} {um}</strong>
      </p>
      <DataTable<GiacenzaRiga>
        righe={righe}
        rigaId={(r) => r.id}
        vuoto={<EmptyState titolo="Nessuna giacenza" testo="La merce comparirà dopo il primo carico." />}
        colonne={[
          { chiave: 'ubicazione_codice', titolo: 'Ubicazione', aiuto: 'ubicazione' },
          { chiave: 'lotto_codice', titolo: 'Lotto' },
          { chiave: 'scadenza', titolo: 'Scadenza', aiuto: 'scadenza_lotto', render: (r) => data(r.scadenza), valore: (r) => r.scadenza },
          { chiave: 'qta', titolo: 'Quantità', allinea: 'destra', render: (r) => qta(r.qta), valore: (r) => Number(r.qta) },
        ]}
      />
    </>
  );
}

function Lotti({ articolo }: { articolo: Articolo }) {
  const m = useMagazzino();
  const scrivi = m.puo('lotti_ubicazioni');
  const elenco = useApi<Lotto[]>('api_lotti_elenco', { p_articolo: articolo.id });
  const [sel, setSel] = useState<Lotto | null>(null);
  const [form, setForm] = useState<{ lotto: Lotto | null } | null>(null);
  const corrente = sel && elenco.data?.find((l) => l.id === sel.id);
  return (
    <>
      {!articolo.gestione_lotti && <p className="muto">Questo articolo non ha la gestione lotti attiva (si attiva dalla scheda Logistica).</p>}
      {scrivi && (
        <div className="art-barra">
          <Button variante="accento" onClick={() => setForm({ lotto: null })}>
            Nuovo lotto
          </Button>
          <Button variante="tenue" disabled={!corrente} onClick={() => setForm({ lotto: corrente! })}>
            Modifica lotto
          </Button>
        </div>
      )}
      {elenco.isError ? (
        <p className="errore" role="alert">{messaggioErrore(elenco.error)}</p>
      ) : (
        <DataTable<Lotto>
          righe={elenco.data ?? []}
          rigaId={(l) => l.id}
          onSeleziona={setSel}
          vuoto={<EmptyState titolo="Nessun lotto" testo={scrivi ? 'Aggiungine uno con «Nuovo lotto».' : 'Non ci sono lotti per questo articolo.'} />}
          colonne={[
            { chiave: 'codice', titolo: 'Codice lotto', aiuto: 'gestione_lotti' },
            { chiave: 'scadenza', titolo: 'Scadenza', aiuto: 'scadenza_lotto', render: (l) => data(l.scadenza) || 'Nessuna', valore: (l) => l.scadenza },
            { chiave: 'qta', titolo: `Giacenza (${articolo.um})`, allinea: 'destra', render: (l) => qta(l.qta), valore: (l) => Number(l.qta) },
          ]}
        />
      )}
      <FormLotto aperto={!!form} lotto={form?.lotto ?? null} articolo={articolo} onChiudi={() => setForm(null)} />
    </>
  );
}

function FormLotto({ aperto, lotto, articolo, onChiudi }: { aperto: boolean; lotto: Lotto | null; articolo: Articolo; onChiudi: () => void }) {
  return (
    <Dialog aperto={aperto} titolo={lotto ? 'Modifica lotto' : 'Nuovo lotto'} onChiudi={onChiudi}>
      <Corpo lotto={lotto} articolo={articolo} onChiudi={onChiudi} />
    </Dialog>
  );
}

function Corpo({ lotto, articolo, onChiudi }: { lotto: Lotto | null; articolo: Articolo; onChiudi: () => void }) {
  const m = useMagazzino();
  const toast = useToast();
  const [codice, setCodice] = useState(lotto?.codice ?? '');
  const [scadenza, setScadenza] = useState(lotto?.scadenza?.slice(0, 10) ?? '');
  const [errCodice, setErrCodice] = useState<string | undefined>();
  const [errore, setErrore] = useState<string | null>(null);
  const salva = useScrivi('api_lotto_salva');

  const invia = (e: FormEvent) => {
    e.preventDefault();
    if (!codice.trim()) return setErrCodice('Scrivi il codice del lotto.');
    setErrCodice(undefined);
    const dati = { codice: codice.trim(), scadenza: scadenza || null };
    salva.mutate({ p_magazzino: m.id, p_dati: lotto ? { ...dati, id: lotto.id } : { ...dati, articolo_id: articolo.id } }, {
      onSuccess: () => {
        toast('Lotto salvato.', 'ok');
        onChiudi();
      },
      onError: (err) => {
        if (err instanceof Error && err.message === 'gia_esiste') setErrCodice('Questo articolo ha già un lotto con questo codice.');
        else setErrore(messaggioErrore(err));
      },
    });
  };

  return (
    <form onSubmit={invia} noValidate>
      <p className="muto">
        Articolo: {articolo.matricola} - {articolo.descrizione}
      </p>
      <ErroreForm testo={errore} />
      <Field label="Codice lotto" value={codice} onChange={(e) => setCodice(e.target.value)} errore={errCodice} maxLength={40} />
      <Field label="Scadenza (facoltativa)" aiuto="scadenza_lotto" type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} />
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
