import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMagazzino } from '../../context/magazzino';
import { useApi, useMutazione } from '../../lib/api';
import { messaggioErrore } from '../../lib/errori';
import { data as fData, euro, qta as fQta } from '../../lib/formati';
import { scaricaCsv, stampa } from '../../lib/stampa';
import { Badge, Button, Dialog, type Tono } from '../../ui';
import { Termine } from '../../ui/Suggerimento';
import { centInEuro } from './calcolo';
import { PASSI_SPEDIZIONE, TIPI, minuscolo, numeroDoc, type Collegato, type DocumentoCompleto, type TipoDoc } from './tipi';

export const TONO_STATO: Record<string, Tono> = { bozza: 'grigio', confermato: 'blu', evaso: 'verde', annullato: 'rosso' };
export const BadgeStatoDoc = ({ stato }: { stato: string }) => (
  <Badge tono={TONO_STATO[stato] ?? 'grigio'}>{stato.charAt(0).toUpperCase() + stato.slice(1)}</Badge>
);

interface Props {
  id: string;
  /** Apre l'editor sul documento (tipo del documento, non della schermata). */
  onModifica: (tipo: TipoDoc, id: string) => void;
  /** Mostra un altro documento (anche di altro tipo). */
  onMostra: (tipo: TipoDoc, id: string | null) => void;
}

const nomeCollegato = (c: Collegato) => `${TIPI[c.tipo].singolare} ${numeroDoc(c)}`;

/** Pannello "Righe" del documento selezionato: testata, righe, totali, catena, spedizione e azioni. */
export function Dettaglio({ id, onModifica, onMostra }: Props) {
  const m = useMagazzino();
  const lettura = useApi<DocumentoCompleto>('api_documento_leggi', { p_id: id });
  const conferma = useMutazione<DocumentoCompleto>('api_documento_conferma', { ok: 'Documento confermato' });
  const annulla = useMutazione<DocumentoCompleto>('api_documento_annulla', { ok: 'Documento annullato' });
  const elimina = useMutazione('api_documento_elimina', { ok: 'Bozza eliminata' });
  const pagato = useMutazione<DocumentoCompleto>('api_documento_pagato', { ok: 'Pagamento aggiornato' });
  const genera = useMutazione<DocumentoCompleto>('api_documento_genera', { ok: 'Documento generato in bozza' });
  const evadi = useMutazione<DocumentoCompleto>('api_ordine_evadi', { ok: 'Ordine evaso: carico creato' });
  const spedizione = useMutazione<DocumentoCompleto>('api_spedizione_stato', { ok: 'Spedizione aggiornata' });
  const [chiede, setChiede] = useState<'annulla' | 'elimina' | null>(null);
  const [giacenzaKo, setGiacenzaKo] = useState(false);

  if (lettura.isError) return <section className="dt-dettaglio"><p className="form-errore" role="alert">{messaggioErrore(lettura.error)}</p></section>;
  if (!lettura.data) return <section className="dt-dettaglio"><p className="muto">Caricamento...</p></section>;

  const { documento: d, righe, origine, derivati } = lettura.data;
  const cfg = TIPI[d.tipo];
  const puoScrivere = m.puo(cfg.azione);
  const bozza = d.stato === 'bozza';
  const attivo = d.stato === 'confermato' || d.stato === 'evaso';
  const succ = cfg.successivo;
  const passo = PASSI_SPEDIZIONE.findIndex((p) => p.id === (d.stato_spedizione ?? 'da_preparare'));

  // Quantita' richieste per articolo contro la giacenza (le righe portano la giacenza attuale).
  const carenze = (() => {
    if (d.tipo !== 'scarico') return [];
    const per = new Map<string, { nome: string; richiesta: number; disponibile: number }>();
    righe.forEach((r) => {
      if (!r.articolo_id) return;
      const x = per.get(r.articolo_id) ?? { nome: r.descrizione, richiesta: 0, disponibile: Number(r.giacenza ?? 0) };
      x.richiesta += Number(r.qta);
      per.set(r.articolo_id, x);
    });
    return [...per.values()].filter((x) => x.richiesta > x.disponibile);
  })();

  const vai = (nuovo: DocumentoCompleto) => onMostra(nuovo.documento.tipo, nuovo.documento.id);
  const confermaDoc = () => {
    setGiacenzaKo(false);
    conferma.mutate({ p_id: id }, { onError: (e) => setGiacenzaKo(e.message === 'giacenza_insufficiente') });
  };
  const csvRighe = () =>
    scaricaCsv(`${d.tipo}-${numeroDoc(d).replace('/', '-')}`, righe.map((r) => ({
      Posizione: r.posizione, Articolo: r.articolo_matricola ?? '', Descrizione: r.descrizione, Quantita: String(r.qta).replace('.', ','),
      Prezzo: centInEuro(Number(r.prezzo_cent)), 'Sconto %': String(r.sconto_perc).replace('.', ','), 'IVA %': String(r.iva_perc).replace('.', ','),
      Totale: centInEuro(Number(r.totale_cent)),
    })));

  return (
    <section className="dt-dettaglio doc-dettaglio" aria-label="Documento selezionato">
      <div className="doc-testata">
        <h2>
          {cfg.singolare} {numeroDoc(d)}
        </h2>
        <p>
          <BadgeStatoDoc stato={d.stato} /> {cfg.fattura && d.stato !== 'annullato' && <Badge tono={d.pagato ? 'verde' : 'giallo'}>{d.pagato ? 'Pagato' : 'Da pagare'}</Badge>}
        </p>
        <dl className="doc-dati">
          <div><dt>Data</dt><dd>{fData(d.data)}</dd></div>
          <div><dt>{cfg.etichettaControparte}</dt><dd>{d.anagrafica?.ragione_sociale ?? '-'}</dd></div>
          {d.titolo && <div><dt>Titolo</dt><dd>{d.titolo}</dd></div>}
          {d.banca && <div><dt>Banca</dt><dd>{d.banca}</dd></div>}
          {d.iban && <div><dt>IBAN</dt><dd>{d.iban}</dd></div>}
          {d.condizioni_pagamento && <div><dt>Pagamento</dt><dd>{d.condizioni_pagamento}</dd></div>}
          {d.note && <div><dt>Note</dt><dd>{d.note}</dd></div>}
        </dl>
      </div>

      <h3>Righe</h3>
      {righe.length === 0 ? (
        <p className="muto">Il documento non ha righe.</p>
      ) : (
        <div className="dt-scroll">
          <table className="doc-tab">
            <thead>
              <tr>
                <th>Articolo</th>
                <th className="destra">Quantità</th>
                <th className="destra">Prezzo</th>
                <th className="destra">Sconto</th>
                <th className="destra">IVA</th>
                {cfg.fattura && <th className="destra"><Termine aiuto="inps">INPS</Termine></th>}
                {cfg.fattura && <th className="destra"><Termine aiuto="ritenuta_acconto">Rit.</Termine></th>}
                {bozza && d.tipo === 'scarico' && <th className="destra">Giacenza</th>}
                <th className="destra">Totale</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id}>
                  <td>{r.articolo_matricola ? `${r.articolo_matricola} - ` : ''}{r.descrizione}</td>
                  <td className="destra">{fQta(r.qta)} {r.um ?? ''}</td>
                  <td className="destra">{euro(r.prezzo_cent)}</td>
                  <td className="destra">{fQta(r.sconto_perc)}%</td>
                  <td className="destra">{fQta(r.iva_perc)}%</td>
                  {cfg.fattura && <td className="destra">{fQta(r.inps_perc)}%</td>}
                  {cfg.fattura && <td className="destra">{fQta(r.ritenuta_perc)}%</td>}
                  {bozza && d.tipo === 'scarico' && <td className="destra">{r.giacenza == null ? '-' : fQta(r.giacenza)}</td>}
                  <td className="destra">{euro(r.totale_cent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <dl className="doc-totali" aria-label="Totali">
        <div><dt>Imponibile</dt><dd>{euro(d.imponibile_cent)}</dd></div>
        <div><dt>Imposta</dt><dd>{euro(d.imposta_cent)}</dd></div>
        {cfg.fattura && <div><dt><Termine aiuto="inps">INPS</Termine></dt><dd>{euro(d.inps_cent)}</dd></div>}
        {cfg.fattura && <div><dt><Termine aiuto="ritenuta_acconto">Ritenuta</Termine></dt><dd>-{euro(d.ritenuta_cent)}</dd></div>}
        <div className="doc-totale"><dt>Totale</dt><dd>{euro(d.totale_cent)}</dd></div>
      </dl>

      {cfg.spedizione && attivo && (
        <div className="doc-spedizione">
          <h3>Spedizione</h3>
          <ol className="doc-passi" aria-label="Stato della spedizione">
            {PASSI_SPEDIZIONE.map((p, i) => (
              <li key={p.id} className={i <= passo ? 'fatto' : undefined} aria-current={i === passo ? 'step' : undefined}>
                <span aria-hidden="true">{i < passo ? '✓' : i + 1}</span> {p.testo}
              </li>
            ))}
          </ol>
          {m.puo('spedizione') && passo < PASSI_SPEDIZIONE.length - 1 && (
            <div className="no-stampa">
              <Button variante="tenue" disabled={spedizione.isPending} onClick={() => spedizione.mutate({ p_documento: id, p_stato: PASSI_SPEDIZIONE[passo + 1].id })}>
                Segna come: {PASSI_SPEDIZIONE[passo + 1].testo.toLowerCase()}
              </Button>
            </div>
          )}
        </div>
      )}

      {(origine || derivati.length > 0) && (
        <div className="doc-catena">
          <h3>Documenti collegati</h3>
          <ul>
            {origine && (
              <li>
                Origine:{' '}
                <Link to={`/m/${m.id}/documenti/${origine.tipo}?doc=${origine.id}`}>{nomeCollegato(origine)}</Link> <BadgeStatoDoc stato={origine.stato} />
              </li>
            )}
            {derivati.map((c) => (
              <li key={c.id}>
                Derivato:{' '}
                <Link to={`/m/${m.id}/documenti/${c.tipo}?doc=${c.id}`}>{nomeCollegato(c)}</Link> <BadgeStatoDoc stato={c.stato} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {giacenzaKo && (
        <div className="form-errore" role="alert">
          <p>Giacenza insufficiente: lo scarico non è stato confermato.</p>
          {carenze.length > 0 && (
            <ul>
              {carenze.map((x) => <li key={x.nome}>{x.nome}: disponibili {fQta(x.disponibile)}, richiesti {fQta(x.richiesta)}</li>)}
            </ul>
          )}
          <p>
            Modifica la bozza oppure riordina: <Link to={`/m/${m.id}/documenti/ordine_fornitore`}>ordine fornitore</Link> o{' '}
            <Link to={`/m/${m.id}/analisi`}>suggerimenti di riordino</Link>.
          </p>
        </div>
      )}

      <div className="buttons no-stampa">
        {bozza && puoScrivere && (
          <>
            <Button variante="tenue" onClick={() => onModifica(d.tipo, id)}>Modifica</Button>
            <Button variante="accento" disabled={conferma.isPending || righe.length === 0} onClick={confermaDoc}>Conferma</Button>
            <Button variante="pericolo" aiuto="annulla_elimina" onClick={() => setChiede('elimina')}>Elimina bozza</Button>
          </>
        )}
        {d.stato === 'confermato' && d.tipo === 'ordine_fornitore' && m.puo('evadi_ordine') && (
          <Button variante="accento" aiuto="evadi_ordine" disabled={evadi.isPending} onClick={() => evadi.mutate({ p_id: id }, { onSuccess: vai })}>Evadi ordine</Button>
        )}
        {d.stato === 'confermato' && succ && m.puo(TIPI[succ].azione) && (
          <Button variante="primario" aiuto="genera_successivo" disabled={genera.isPending} onClick={() => genera.mutate({ p_origine: id, p_tipo: succ }, { onSuccess: (n) => onModifica(n.documento.tipo, n.documento.id) })}>
            Genera {minuscolo(TIPI[succ].singolare)}
          </Button>
        )}
        {cfg.fattura && d.stato !== 'annullato' && !bozza && puoScrivere && (
          <Button variante="tenue" disabled={pagato.isPending} onClick={() => pagato.mutate({ p_id: id, p_pagato: !d.pagato })}>
            {d.pagato ? 'Segna non pagato' : 'Segna pagato'}
          </Button>
        )}
        {attivo && puoScrivere && <Button variante="pericolo" aiuto="annulla_elimina" onClick={() => setChiede('annulla')}>Annulla documento</Button>}
        <Button variante="tenue" onClick={stampa}>Stampa</Button>
        <Button variante="tenue" onClick={csvRighe} disabled={righe.length === 0}>Esporta righe CSV</Button>
      </div>

      <Dialog aperto={chiede !== null} titolo={chiede === 'annulla' ? 'Annullare il documento?' : 'Eliminare la bozza?'} onChiudi={() => setChiede(null)}>
        <p>
          {chiede === 'annulla'
            ? `${cfg.singolare} ${numeroDoc(d)} passa ad annullato.${cfg.movimenta ? ' I movimenti di magazzino vengono stornati.' : ''} Non si può tornare indietro.`
            : 'La bozza viene cancellata e non si può recuperare.'}
        </p>
        <div className="dialog-azioni">
          <Button variante="tenue" onClick={() => setChiede(null)}>Indietro</Button>
          <Button
            variante="pericolo"
            onClick={() => {
              const azione = chiede;
              setChiede(null);
              if (azione === 'annulla') annulla.mutate({ p_id: id });
              else elimina.mutate({ p_id: id }, { onSuccess: () => onMostra(d.tipo, null) });
            }}
          >
            {chiede === 'annulla' ? 'Annulla documento' : 'Elimina bozza'}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
