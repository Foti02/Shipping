import { useState, type ChangeEvent } from 'react';
import { useMagazzino } from '../../context/magazzino';
import { messaggioErrore } from '../../lib/errori';
import { euro } from '../../lib/formati';
import { Button, Dialog, Field } from '../../ui';
import { ErroreForm, useScrivi } from './comuni';
import { analizzaCsv, COLONNE_CSV, type RigaCsv } from './logica';

interface Esito {
  creati: number;
  aggiornati: number;
  errori: { riga: number; matricola: string; errore: string }[];
}

/** Il file puo' arrivare da Excel in Windows-1252: se non e' UTF-8 valido si rilegge cosi'. */
async function leggiTesto(f: File) {
  const buf = await f.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export function ImportaCsv({ aperto, onChiudi }: { aperto: boolean; onChiudi: () => void }) {
  return (
    <Dialog aperto={aperto} titolo="Importa articoli da CSV" onChiudi={onChiudi}>
      <Corpo onChiudi={onChiudi} />
    </Dialog>
  );
}

function Corpo({ onChiudi }: { onChiudi: () => void }) {
  const m = useMagazzino();
  const [righe, setRighe] = useState<RigaCsv[] | null>(null);
  const [esito, setEsito] = useState<Esito | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const importa = useScrivi<Esito>('api_articoli_importa');

  const scegli = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setEsito(null);
    setErrore(null);
    if (!f) return setRighe(null);
    const r = analizzaCsv(await leggiTesto(f));
    setRighe(r);
    if (r.length === 0) setErrore('Il file non contiene righe.');
  };

  const valide = righe?.filter((r) => !r.errore) ?? [];
  const invia = () =>
    importa.mutate({ p_magazzino: m.id, p_righe: valide.map((r) => r.dati) }, {
      onSuccess: setEsito,
      onError: (e) => setErrore(messaggioErrore(e)),
    });

  if (esito) {
    // Gli errori del database indicano la posizione tra le righe inviate: la riportiamo alla riga del file.
    const errori = esito.errori.map((x) => ({ ...x, rigaFile: valide[x.riga - 1]?.riga ?? x.riga }));
    return (
      <>
        <div className="art-riepilogo" role="status">
          <strong>Importazione terminata.</strong>
          <p>
            Creati: {esito.creati}. Aggiornati: {esito.aggiornati}. Con errori: {errori.length + (righe!.length - valide.length)}.
          </p>
          {errori.length > 0 && (
            <ul>
              {errori.map((x) => (
                <li key={x.riga}>
                  Riga {x.rigaFile} ({x.matricola || 'senza matricola'}): {x.errore === 'gia_esiste' ? 'matricola già presente' : messaggioErrore(x.errore)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="dialog-azioni">
          <Button variante="accento" onClick={onChiudi}>
            Chiudi
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="muto">
        File CSV con separatore «;» e colonne: <code>{COLONNE_CSV.join(';')}</code>. Prezzi in euro (12,50). Se la matricola esiste già l&apos;articolo viene aggiornato; la giacenza iniziale vale solo per i nuovi.
      </p>
      <Field label="File CSV" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void scegli(e)} />
      <ErroreForm testo={errore} />
      {righe && righe.length > 0 && (
        <>
          <p>
            <strong>{valide.length}</strong> righe valide, <strong>{righe.length - valide.length}</strong> con errori (saranno saltate).
          </p>
          <div className="dt art-anteprima">
            <div className="dt-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Riga</th>
                    <th>Matricola</th>
                    <th>Descrizione</th>
                    <th className="destra">Prezzo</th>
                    <th>Esito</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r) => (
                    <tr key={r.riga}>
                      <td>{r.riga}</td>
                      <td>{r.dati.matricola}</td>
                      <td>{r.dati.descrizione}</td>
                      <td className="destra">{r.dati.prezzo_acquisto_cent != null ? euro(r.dati.prezzo_acquisto_cent as number) : ''}</td>
                      <td>{r.errore ? <span className="errore">{r.errore}</span> : <span className="art-esito-ok">ok</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <div className="dialog-azioni">
        <Button variante="tenue" onClick={onChiudi}>
          Annulla
        </Button>
        <Button variante="accento" disabled={valide.length === 0 || importa.isPending} onClick={invia}>
          {valide.length ? `Importa ${valide.length} righe` : 'Importa'}
        </Button>
      </div>
    </>
  );
}
