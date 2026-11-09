import { Link } from 'react-router-dom';
import { useMagazzino } from '../context/magazzino';
import { useApi } from '../lib/api';
import { messaggioErrore } from '../lib/errori';
import { qta } from '../lib/formati';
import { BadgeStato, EmptyState } from '../ui';
import { Termine } from '../ui/Suggerimento';
import { tempoRelativo } from './classe/logica';
import { useAdesso } from './classe/componenti';
import { azioneCompito, ordinaCompiti, percorsoCompito, righeErrore, spiegaBlocco, testoPulsanteCompito, type Compito } from './compiti/logica';
import './classe/classe.css';

interface Notifica { id: string; tipo: string; messaggio: string; risolta_il: string | null; created_at: string }
interface Notifiche { non_lette: number; elenco: Notifica[] }

export default function Compiti() {
  const m = useMagazzino();
  const adesso = useAdesso();
  const classe = m.tipo === 'classe';
  const compiti = useApi<Compito[]>('api_compiti_miei', { p_magazzino: m.id }, { poll: 5000, enabled: classe });
  const notifiche = useApi<Notifiche>('api_notifiche', { p_magazzino: m.id }, { poll: 5000, enabled: classe });

  if (!classe) return <EmptyState titolo="I compiti arrivano dalle classi" testo="Entra in una classe con il codice del docente per vederli qui." />;

  const scorte = (notifiche.data?.elenco ?? []).filter((n) => n.tipo === 'scorta_bassa' && !n.risolta_il);
  const elenco = ordinaCompiti(compiti.data ?? []);
  const bloccati = elenco.filter((c) => c.stato === 'bloccato').length;
  const fatti = elenco.filter((c) => c.stato === 'completato').length;

  return (
    <>
      <h1>
        Compiti
      </h1>

      {scorte.length > 0 && (
        <div className="avviso" role="status">
          <h3><Termine aiuto="scorta_minima">Scorta bassa</Termine> in magazzino</h3>
          <ul>
            {scorte.map((n) => (
              <li key={n.id}>{n.messaggio} <span className="muto">({tempoRelativo(n.created_at, adesso)})</span></li>
            ))}
          </ul>
        </div>
      )}

      {bloccati > 0 && (
        <div className="avviso" role="status">
          <h3>{bloccati === 1 ? '1 compito è bloccato' : `${bloccati} compiti sono bloccati`}</h3>
          <p>La merce in magazzino non basta per tutti gli scarichi. Serve un riordino: chi si occupa degli acquisti deve fare l'ordine al fornitore e poi evaderlo (carico). Appena la merce arriva, i compiti bloccati si riaprono da soli.</p>
        </div>
      )}

      {compiti.isError ? (
        <p className="errore" role="alert">{messaggioErrore(compiti.error)}</p>
      ) : compiti.isLoading ? (
        <p className="muto">Caricamento...</p>
      ) : elenco.length === 0 ? (
        m.ruolo === 'docente' ? (
          <EmptyState titolo="Qui non hai compiti" testo="I compiti degli studenti si vedono e si gestiscono dall'area docente." azione={<Link className="btn" to="/docente">Area docente</Link>} />
        ) : (
          <EmptyState titolo="Nessun compito per ora" testo="Quando il docente attiva uno scenario, i tuoi compiti compaiono qui." />
        )
      ) : (
        <>
          <p className="muto" aria-live="polite">{fatti} di {elenco.length} completati. Si aggiorna da solo ogni 5 secondi.</p>
          <div className="compiti">
            {elenco.map((c) => {
              const azione = azioneCompito(c.tipo);
              const permesso = azione == null || m.puo(azione);
              const errori = righeErrore(c.esito);
              return (
                <article key={c.id} className={`compito ${c.stato}`} aria-labelledby={`c-${c.id}`}>
                  <div className="testa">
                    <h2 id={`c-${c.id}`}>{c.titolo}</h2>
                    {c.stato === 'bloccato' || c.stato === 'errore' ? <Termine aiuto="stato_compito"><BadgeStato stato={c.stato} /></Termine> : <BadgeStato stato={c.stato} />}
                  </div>
                  {c.istruzioni && <p>{c.istruzioni}</p>}
                  <div className="dati">
                    {c.articolo_matricola && <span>{c.articolo_matricola} {c.articolo_descrizione}</span>}
                    {c.controparte && <span>{c.controparte}</span>}
                    {c.qta != null && <span>Quantità: {qta(c.qta)}</span>}
                  </div>
                  {c.stato === 'bloccato' && <p className="spiega">{spiegaBlocco(c.motivo)}</p>}
                  {c.stato === 'errore' && (
                    <div className="spiega">
                      <strong>Qualcosa non torna:</strong>
                      {errori.length > 0 ? <ul>{errori.map((x) => <li key={x}>{x}</li>)}</ul> : <p>{c.motivo ?? 'I dati del documento non coincidono con il compito.'}</p>}
                      <p style={{ margin: '6px 0 0' }}>Correggi il documento e confermalo di nuovo: il controllo si ripete.</p>
                    </div>
                  )}
                  {c.stato === 'completato' && <p className="spiega">Compito completato.</p>}
                  {c.stato !== 'completato' && c.stato !== 'bloccato' &&
                    (permesso ? (
                      <Link className="btn" to={`/m/${m.id}/${percorsoCompito(c.tipo)}`}>{testoPulsanteCompito(c.tipo)}</Link>
                    ) : (
                      <p className="muto">Questo compito non è del tuo ruolo: chiedi al docente di riassegnarlo.</p>
                    ))}
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
