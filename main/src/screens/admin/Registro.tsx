import { useApi } from '../../lib/api';
import { messaggioErrore } from '../../lib/errori';
import { dataOra } from '../../lib/formati';
import { Termine } from '../../ui/Suggerimento';
import { tempoRelativo } from '../classe/logica';
import { useAdesso } from '../classe/componenti';
import { fraseRegistro, type RigaRegistro } from './logica';
import '../classe/classe.css';
import './admin.css';

/** Operazioni di amministrazione, dalla più recente. Si aggiorna ogni 10 secondi. */
export default function Registro() {
  const registro = useApi<RigaRegistro[]>('api_admin_registro', { p_limite: 100 }, { poll: 10000 });
  const adesso = useAdesso(10000);
  return (
    <section aria-label="Registro" className="pannello">
      <h2><Termine aiuto="registro_admin">Registro di amministrazione</Termine></h2>
      {registro.isError ? (
        <p className="errore" role="alert">{messaggioErrore(registro.error)}</p>
      ) : registro.isLoading ? (
        <p className="muto">Caricamento...</p>
      ) : !registro.data?.length ? (
        <p className="muto">Ancora nessuna operazione registrata.</p>
      ) : (
        <ul className="registro" aria-label="Registro di amministrazione">
          {registro.data.map((r) => (
            <li key={r.id}>
              <time dateTime={r.created_at} title={dataOra(r.created_at)}>{tempoRelativo(r.created_at, adesso)}</time>
              <span className="chi">{r.username ?? 'sistema'}</span>
              <span>{fraseRegistro(r)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
