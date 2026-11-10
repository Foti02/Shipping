import { Link } from 'react-router-dom';
import { useMagazzino } from '../context/magazzino';
import { useApi } from '../lib/api';
import { dataOra, euro, qta } from '../lib/formati';
import { BadgeStato } from '../ui';
import { CartaRichiudibile } from '../ui/CartaRichiudibile';
import { Termine } from '../ui/Suggerimento';

interface Compito { id: string; titolo: string; stato: string }
interface Notifiche { non_lette: number; elenco: { id: string; messaggio: string; created_at?: string }[] }
interface Kpi { valore_giacenza?: number; rotazione?: number; copertura_giorni?: number; sottoscorta?: number }

// Ogni carta tollera funzione mancante o errore: mostra "non disponibile" e basta.
const NonDisponibile = () => <p className="muto">Non disponibile al momento.</p>;

export default function Cruscotto() {
  const m = useMagazzino();
  const arg = { p_magazzino: m.id };
  const compiti = useApi<Compito[]>('api_compiti_miei', arg, { poll: 5000, enabled: m.tipo === 'classe' });
  const notifiche = useApi<Notifiche>('api_notifiche', arg, { poll: 5000 });
  const kpi = useApi<Kpi>('api_kpi', { ...arg, p_giorni: 30 });

  const k = kpi.data;
  return (
    <>
      <h1>
        Cruscotto
      </h1>
      <div className="griglia">
        <CartaRichiudibile id="compiti" titolo="I miei compiti">
          {m.tipo !== 'classe' ? (
            <p className="muto">I compiti arrivano dalle classi.</p>
          ) : compiti.isError ? (
            <NonDisponibile />
          ) : !compiti.data?.length ? (
            <p className="muto">Nessun compito assegnato.</p>
          ) : (
            <ul>
              {compiti.data.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <span>{c.titolo}</span>
                  <BadgeStato stato={c.stato} />
                </li>
              ))}
            </ul>
          )}
          {m.tipo === 'classe' && <p><Link to={`/m/${m.id}/compiti`}>Tutti i compiti</Link></p>}
        </CartaRichiudibile>

        <CartaRichiudibile id="notifiche" titolo="Notifiche">
          {notifiche.isError ? (
            <NonDisponibile />
          ) : !notifiche.data?.elenco?.length ? (
            <p className="muto">Nessuna notifica.</p>
          ) : (
            <ul>
              {notifiche.data.elenco.slice(0, 5).map((n) => (
                <li key={n.id}>
                  <span>{n.messaggio}</span>
                  {n.created_at && <span className="muto">{dataOra(n.created_at)}</span>}
                </li>
              ))}
            </ul>
          )}
        </CartaRichiudibile>

        <CartaRichiudibile id="numeri" titolo="Numeri del magazzino">
          {kpi.isError || (kpi.isSuccess && !k) ? (
            <NonDisponibile />
          ) : (
            <div className="kpi">
              <div><strong>{k?.valore_giacenza != null ? euro(k.valore_giacenza) : '-'}</strong><span>Valore giacenza</span></div>
              <div><strong>{k?.rotazione != null ? qta(k.rotazione) : '-'}</strong><span><Termine aiuto="rotazione">Rotazione</Termine></span></div>
              <div><strong>{k?.copertura_giorni != null ? `${qta(k.copertura_giorni)} gg` : '-'}</strong><span><Termine aiuto="copertura_giorni">Copertura</Termine></span></div>
              <div><strong>{k?.sottoscorta != null ? qta(k.sottoscorta) : '-'}</strong><span><Termine aiuto="scorta_minima">Sotto scorta</Termine></span></div>
            </div>
          )}
          <p style={{ marginTop: 12 }}><Link to={`/m/${m.id}/analisi`}>Riordino, ABC e valorizzazione</Link></p>
        </CartaRichiudibile>
      </div>
    </>
  );
}
