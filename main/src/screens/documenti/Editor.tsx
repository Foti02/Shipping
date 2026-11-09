import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useMagazzino } from '../../context/magazzino';
import { useApi, useMutazione } from '../../lib/api';
import { messaggioErrore } from '../../lib/errori';
import { euro, qta as fQta } from '../../lib/formati';
import { Button, Field } from '../../ui';
import { calcolaTotali, centInEuro, euroInCent, numero, totaleRiga } from './calcolo';
import { TIPI, minuscolo, type DocumentoCompleto, type TipoDoc } from './tipi';

interface Articolo {
  id: string; matricola: string; descrizione: string; prezzo_acquisto_cent: number; ricarico_perc: number | string;
  iva_perc: number | string; giacenza: number | string; attivo: boolean;
}
interface Anagrafica { id: string; codice: string | null; ragione_sociale: string }

interface RigaForm {
  chiave: number; articoloTesto: string; articoloId: string | null; descrizione: string;
  qta: string; prezzo: string; sconto: string; iva: string; inps: string; ritenuta: string;
}

const etichettaArticolo = (a: Articolo) => `${a.matricola} - ${a.descrizione}`;
const etichettaAnagrafica = (a: Anagrafica) => (a.codice ? `${a.codice} - ${a.ragione_sociale}` : a.ragione_sociale);
const oggi = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface Props {
  tipo: TipoDoc;
  /** null = nuovo documento. */
  id: string | null;
  onChiudi: () => void;
  /** Dopo salvataggio o conferma: id del documento. */
  onFatto: (id: string) => void;
}

/** Contenuto del dialogo: carica la bozza (se c'e') e mostra il modulo. */
export function EditorDocumento({ tipo, id, onChiudi, onFatto }: Props) {
  const lettura = useApi<DocumentoCompleto>('api_documento_leggi', { p_id: id }, { enabled: !!id });
  // Il modulo parte dai dati freschi della prima lettura e non si rimonta piu': le riletture dopo il salvataggio non lo resettano.
  const [pronto, setPronto] = useState(!id);
  if (!pronto && lettura.data && !lettura.isFetching) setPronto(true);
  if (!pronto && lettura.isError) return <p className="form-errore" role="alert">{messaggioErrore(lettura.error)}</p>;
  if (!pronto) return <p className="muto">Caricamento...</p>;
  return <Modulo tipo={tipo} iniziale={lettura.data ?? null} onChiudi={onChiudi} onFatto={onFatto} />;
}

function Modulo({ tipo, iniziale, onChiudi, onFatto }: { tipo: TipoDoc; iniziale: DocumentoCompleto | null; onChiudi: () => void; onFatto: (id: string) => void }) {
  const m = useMagazzino();
  const cfg = TIPI[tipo];
  const qc = useQueryClient();
  const articoli = useApi<Articolo[]>('api_articoli_elenco', { p_magazzino: m.id });
  const anagrafiche = useApi<Anagrafica[]>('api_anagrafiche_elenco', { p_magazzino: m.id, p_tipo: cfg.controparte });
  const salva = useMutazione<DocumentoCompleto>('api_documento_salva');
  const conferma = useMutazione<DocumentoCompleto>('api_documento_conferma', { ok: 'Documento confermato' });

  const attivi = useMemo(() => (articoli.data ?? []).filter((a) => a.attivo), [articoli.data]);
  const perId = useMemo(() => new Map((articoli.data ?? []).map((a) => [a.id, a])), [articoli.data]);
  const doc = iniziale?.documento;

  const chiave = useRef(0);
  const nuovaRiga = (): RigaForm => ({ chiave: ++chiave.current, articoloTesto: '', articoloId: null, descrizione: '', qta: '1', prezzo: '', sconto: '0', iva: '22', inps: '0', ritenuta: '0' });

  const [idCorrente, setIdCorrente] = useState<string | null>(doc?.id ?? null);
  const [data, setData] = useState(doc?.data ?? oggi());
  const [controparteTesto, setControparteTesto] = useState(doc?.anagrafica ? etichettaAnagrafica(doc.anagrafica) : '');
  const [titolo, setTitolo] = useState(doc?.titolo ?? (cfg.fattura ? 'FATTURA' : ''));
  const [banca, setBanca] = useState(doc?.banca ?? '');
  const [iban, setIban] = useState(doc?.iban ?? '');
  const [condizioni, setCondizioni] = useState(doc?.condizioni_pagamento ?? '');
  const [note, setNote] = useState(doc?.note ?? '');
  const [righe, setRighe] = useState<RigaForm[]>(() =>
    iniziale?.righe.length
      ? iniziale.righe.map((r) => ({
          chiave: ++chiave.current,
          articoloTesto: r.articolo_id ? `${r.articolo_matricola ?? ''} - ${r.descrizione}` : '',
          articoloId: r.articolo_id,
          descrizione: r.descrizione,
          qta: String(r.qta).replace('.', ','),
          prezzo: centInEuro(Number(r.prezzo_cent)),
          sconto: String(r.sconto_perc).replace('.', ','),
          iva: String(r.iva_perc).replace('.', ','),
          inps: String(r.inps_perc).replace('.', ','),
          ritenuta: String(r.ritenuta_perc).replace('.', ','),
        }))
      : [nuovaRiga()],
  );
  const [errori, setErrori] = useState<Record<string, string>>({});
  const [erroreGenerale, setErroreGenerale] = useState('');
  const [giacenzaKo, setGiacenzaKo] = useState(false);

  const anagraficaScelta = (anagrafiche.data ?? []).find((a) => etichettaAnagrafica(a) === controparteTesto.trim());
  const calc = righe.map((r) => ({ qta: numero(r.qta), prezzo_cent: euroInCent(r.prezzo), sconto_perc: numero(r.sconto), iva_perc: numero(r.iva), inps_perc: numero(r.inps), ritenuta_perc: numero(r.ritenuta) }));
  const tot = calcolaTotali(calc);

  const aggiorna = (chiaveRiga: number, patch: Partial<RigaForm>) => setRighe((rs) => rs.map((r) => (r.chiave === chiaveRiga ? { ...r, ...patch } : r)));

  const scegliArticolo = (chiaveRiga: number, testo: string) => {
    const a = attivi.find((x) => etichettaArticolo(x) === testo);
    if (!a) return aggiorna(chiaveRiga, { articoloTesto: testo, articoloId: null });
    const acq = Number(a.prezzo_acquisto_cent);
    const prezzo = cfg.prezzoAcquisto ? acq : Math.round(acq * (1 + Number(a.ricarico_perc) / 100));
    aggiorna(chiaveRiga, { articoloTesto: testo, articoloId: a.id, descrizione: a.descrizione, prezzo: centInEuro(prezzo), iva: String(a.iva_perc).replace('.', ',') });
  };

  // Scarico: quantita' richiesta per articolo contro la giacenza attuale.
  const carenze = useMemo(() => {
    if (tipo !== 'scarico') return [];
    const richieste = new Map<string, number>();
    righe.forEach((r) => r.articoloId && richieste.set(r.articoloId, (richieste.get(r.articoloId) ?? 0) + numero(r.qta)));
    return [...richieste]
      .map(([aid, richiesta]) => ({ a: perId.get(aid), richiesta }))
      .filter((x): x is { a: Articolo; richiesta: number } => !!x.a && x.richiesta > Number(x.a.giacenza));
  }, [tipo, righe, perId]);

  /** Controlli sul modulo: ritorna true se si puo' mandare al database. */
  const valida = (perConferma: boolean) => {
    const e: Record<string, string> = {};
    if (controparteTesto.trim() && !anagraficaScelta) e.controparte = `Scegli un ${cfg.etichettaControparte.toLowerCase()} dall'elenco o svuota il campo.`;
    righe.forEach((r) => {
      const k = `riga${r.chiave}`;
      if (!cfg.fattura && !r.articoloId) e[`${k}-articolo`] = "Scegli un articolo dall'elenco.";
      else if (!r.articoloId && !r.descrizione.trim()) e[`${k}-descrizione`] = 'Scrivi una descrizione.';
      if (!(numero(r.qta) > 0)) e[`${k}-qta`] = 'Quantità maggiore di zero.';
      const s = numero(r.sconto);
      if (s < 0 || s > 100) e[`${k}-sconto`] = 'Da 0 a 100.';
    });
    setErrori(e);
    setErroreGenerale(perConferma && righe.length === 0 ? 'Aggiungi almeno una riga.' : Object.keys(e).length ? 'Controlla i campi segnalati.' : '');
    return Object.keys(e).length === 0 && (!perConferma || righe.length > 0);
  };

  const salvaBozza = async () => {
    const documento: Record<string, unknown> = { id: idCorrente ?? undefined, tipo, data, anagrafica_id: anagraficaScelta?.id ?? null, note };
    if (cfg.fattura) Object.assign(documento, { titolo, banca, iban, condizioni_pagamento: condizioni });
    const p_righe = righe.map((r, i) => ({
      articolo_id: r.articoloId,
      descrizione: r.descrizione.trim() || undefined,
      qta: numero(r.qta), prezzo_cent: calc[i].prezzo_cent, sconto_perc: calc[i].sconto_perc, iva_perc: calc[i].iva_perc,
      inps_perc: cfg.fattura ? calc[i].inps_perc : 0, ritenuta_perc: cfg.fattura ? calc[i].ritenuta_perc : 0,
    }));
    const res = await salva.mutateAsync({ p_magazzino: m.id, p_documento: documento, p_righe });
    setIdCorrente(res.documento.id);
    return res.documento.id;
  };

  const azioneSalva = async () => {
    if (!valida(false)) return;
    try {
      onFatto(await salvaBozza());
    } catch { /* il toast e' gia' stato mostrato */ }
  };

  const azioneConferma = async () => {
    if (!valida(true)) return;
    setGiacenzaKo(false);
    try {
      const id = await salvaBozza();
      await conferma.mutateAsync({ p_id: id });
      onFatto(id);
    } catch (e) {
      // La bozza e' gia' salvata: si resta nel modulo per correggere le quantita'.
      void qc.invalidateQueries({ queryKey: ['api', 'api_articoli_elenco'] });
      if (e instanceof Error && e.message === 'giacenza_insufficiente') setGiacenzaKo(true);
    }
  };

  const occupato = salva.isPending || conferma.isPending;
  const err = (k: string) => errori[k];

  return (
    <div className="doc-editor">
      <datalist id="doc-articoli">
        {attivi.map((a) => <option key={a.id} value={etichettaArticolo(a)} />)}
      </datalist>
      <datalist id="doc-controparti">
        {(anagrafiche.data ?? []).map((a) => <option key={a.id} value={etichettaAnagrafica(a)} />)}
      </datalist>

      <p className="muto">
        {doc ? `${cfg.singolare}, ${doc.numero == null ? 'bozza' : `n. ${doc.numero}/${doc.anno}`}` : `Nuovo documento: ${minuscolo(cfg.singolare)}`}
        {cfg.movimenta && '. Alla conferma muove il magazzino.'}
      </p>

      {erroreGenerale && <div className="form-errore" role="alert">{erroreGenerale}</div>}
      {giacenzaKo && (
        <div className="form-errore" role="alert">
          <p>Giacenza insufficiente: lo scarico non è stato confermato (la bozza è salvata).</p>
          {carenze.length > 0 && (
            <ul>
              {carenze.map(({ a, richiesta }) => (
                <li key={a.id}>{a.descrizione}: disponibili {fQta(a.giacenza)}, richiesti {fQta(richiesta)}</li>
              ))}
            </ul>
          )}
          <p>
            Riduci la quantità oppure riordina la merce: <Link to={`/m/${m.id}/documenti/ordine_fornitore`}>ordine fornitore</Link> o{' '}
            <Link to={`/m/${m.id}/analisi`}>suggerimenti di riordino</Link>.
          </p>
        </div>
      )}

      <div className="doc-intestazione">
        <Field label="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <Field
          label={cfg.etichettaControparte}
          list="doc-controparti"
          value={controparteTesto}
          onChange={(e) => setControparteTesto(e.target.value)}
          placeholder="Cerca per nome o codice"
          autoComplete="off"
          errore={err('controparte')}
        />
        {cfg.fattura && (
          <>
            <Field label="Titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)} />
            <Field label="Banca" value={banca} onChange={(e) => setBanca(e.target.value)} />
            <Field label="IBAN" value={iban} onChange={(e) => setIban(e.target.value)} />
            <Field label="Condizioni di pagamento" value={condizioni} onChange={(e) => setCondizioni(e.target.value)} placeholder="es. Bonifico 30 giorni" />
          </>
        )}
        <Field label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <h3>Righe</h3>
      {carenze.length > 0 && !giacenzaKo && (
        <p className="avviso-giacenza" role="status">
          Attenzione: {carenze.map(({ a, richiesta }) => `${a.descrizione} (richiesti ${fQta(richiesta)}, disponibili ${fQta(a.giacenza)})`).join('; ')}.
        </p>
      )}
      <div className="doc-righe">
        {righe.map((r, i) => {
          const k = `riga${r.chiave}`;
          const art = r.articoloId ? perId.get(r.articoloId) : undefined;
          return (
            <fieldset key={r.chiave} className="doc-riga">
              <legend>Riga {i + 1}</legend>
              <div className="doc-riga-larga">
                <Field
                  label={cfg.fattura ? 'Articolo (facoltativo)' : 'Articolo'}
                  list="doc-articoli"
                  value={r.articoloTesto}
                  onChange={(e) => scegliArticolo(r.chiave, e.target.value)}
                  placeholder="Cerca per matricola o nome"
                  autoComplete="off"
                  aria-label={`Articolo riga ${i + 1}`}
                  errore={err(`${k}-articolo`)}
                  aiuto={tipo === 'scarico' && art ? `Giacenza attuale: ${fQta(art.giacenza)}` : undefined}
                />
              </div>
              <div className="doc-riga-larga">
                <Field label="Descrizione" value={r.descrizione} onChange={(e) => aggiorna(r.chiave, { descrizione: e.target.value })} aria-label={`Descrizione riga ${i + 1}`} errore={err(`${k}-descrizione`)} />
              </div>
              <Field label="Quantità" inputMode="decimal" value={r.qta} onChange={(e) => aggiorna(r.chiave, { qta: e.target.value })} aria-label={`Quantità riga ${i + 1}`} errore={err(`${k}-qta`)} />
              <Field label="Prezzo €" inputMode="decimal" value={r.prezzo} onChange={(e) => aggiorna(r.chiave, { prezzo: e.target.value })} aria-label={`Prezzo riga ${i + 1}`} />
              <Field label="Sconto %" inputMode="decimal" value={r.sconto} onChange={(e) => aggiorna(r.chiave, { sconto: e.target.value })} aria-label={`Sconto riga ${i + 1}`} errore={err(`${k}-sconto`)} />
              <Field label="IVA %" inputMode="decimal" value={r.iva} onChange={(e) => aggiorna(r.chiave, { iva: e.target.value })} aria-label={`IVA riga ${i + 1}`} />
              {cfg.fattura && (
                <>
                  <Field label="INPS %" inputMode="decimal" value={r.inps} onChange={(e) => aggiorna(r.chiave, { inps: e.target.value })} aria-label={`INPS riga ${i + 1}`} />
                  <Field label="Ritenuta %" inputMode="decimal" value={r.ritenuta} onChange={(e) => aggiorna(r.chiave, { ritenuta: e.target.value })} aria-label={`Ritenuta riga ${i + 1}`} />
                </>
              )}
              <div className="doc-riga-fine">
                <strong>Totale riga: {euro(totaleRiga(calc[i]))}</strong>
                <Button variante="tenue" onClick={() => setRighe((rs) => rs.filter((x) => x.chiave !== r.chiave))} aria-label={`Rimuovi riga ${i + 1}`}>
                  Rimuovi
                </Button>
              </div>
            </fieldset>
          );
        })}
      </div>
      <Button variante="tenue" onClick={() => setRighe((rs) => [...rs, nuovaRiga()])}>
        Aggiungi riga
      </Button>

      <dl className="doc-totali" aria-label="Totali">
        <div><dt>Imponibile</dt><dd>{euro(tot.imponibile_cent)}</dd></div>
        <div><dt>Imposta</dt><dd>{euro(tot.imposta_cent)}</dd></div>
        {cfg.fattura && <div><dt>INPS</dt><dd>{euro(tot.inps_cent)}</dd></div>}
        {cfg.fattura && <div><dt>Ritenuta</dt><dd>-{euro(tot.ritenuta_cent)}</dd></div>}
        <div className="doc-totale"><dt>Totale</dt><dd>{euro(tot.totale_cent)}</dd></div>
      </dl>

      <div className="dialog-azioni">
        <Button variante="tenue" onClick={onChiudi} disabled={occupato}>
          Chiudi
        </Button>
        <Button variante="tenue" onClick={() => void azioneSalva()} disabled={occupato}>
          Salva bozza
        </Button>
        <Button variante="accento" onClick={() => void azioneConferma()} disabled={occupato}>
          Conferma
        </Button>
      </div>
    </div>
  );
}
