import { useApi } from '../../lib/api';
import { data, euro } from '../../lib/formati';
import { messaggioErrore } from '../../lib/errori';
import { BadgeStato } from '../../ui';
import { TIPO_DOCUMENTO } from './logica';

export interface Movimento {
  id: string;
  tipo: string;
  anno: number;
  numero: number;
  data: string;
  stato: string;
  pagato: boolean;
  totale_cent: number;
}

const STATO: Record<string, { stato: string; testo: string }> = {
  bozza: { stato: 'bloccato', testo: 'Bozza' },
  confermato: { stato: 'da_fare', testo: 'Confermato' },
  evaso: { stato: 'completato', testo: 'Evaso' },
  annullato: { stato: 'errore', testo: 'Annullato' },
};

/** Documenti intestati al soggetto (cache condivisa con la conferma di eliminazione). */
export const useStorico = (id: string) => useApi<Movimento[]>('api_anagrafica_storico', { p_id: id, p_limite: 250 });

export function Storico({ id, nome }: { id: string; nome: string }) {
  const q = useStorico(id);
  return (
    <>
      <h3>Ultimi 250 movimenti di {nome}</h3>
      {q.isError ? (
        <p className="errore">{messaggioErrore(q.error)}</p>
      ) : !q.data ? (
        <p className="muto">Caricamento...</p>
      ) : q.data.length === 0 ? (
        <p className="muto">Nessun documento intestato a questo soggetto.</p>
      ) : (
        <div className="dt-scroll">
          <table className="tabella-storico">
            <thead>
              <tr>
                <th>Numero</th>
                <th>Data</th>
                <th>Tipo</th>
                <th>Stato</th>
                <th className="destra">Totale</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((r) => {
                const s = STATO[r.stato] ?? { stato: r.stato, testo: r.stato };
                return (
                  <tr key={r.id}>
                    <td>{r.numero}/{r.anno}</td>
                    <td>{data(r.data)}</td>
                    <td>{TIPO_DOCUMENTO[r.tipo] ?? r.tipo}</td>
                    <td>
                      <BadgeStato stato={s.stato} testo={s.testo} />
                    </td>
                    <td className="destra">{euro(r.totale_cent)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
