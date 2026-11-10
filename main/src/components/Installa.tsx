import { useQuery } from '@tanstack/react-query';
import { URL_LATEST, chiaveOs, haAggiornamento, leggiLatest, type Latest } from '../lib/aggiornamenti';

// L'app desktop (Electron) si riconosce dal suffisso nello user agent.
export const isDesktop = navigator.userAgent.includes('ShippingDesktop');
const os = chiaveOs(navigator.platform);
// Telefono o tablet (iPad compare come Mac ma ha il touch): gli installer sono per computer, non si mostrano.
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));

/** latest.json dell'archivio Supabase; offline o senza file resta null e i pulsanti restano spenti. */
function useLatest() {
  return useQuery<Latest | null>({
    queryKey: ['latest'],
    queryFn: async () => {
      try {
        // il parametro t evita la copia vecchia in cache dalla rete di distribuzione
        const r = await fetch(`${URL_LATEST}?t=${Date.now()}`, { cache: 'no-store' });
        return r.ok ? leggiLatest(await r.json()) : null;
      } catch {
        return null;
      }
    },
    staleTime: 600_000,
  });
}

/** Pannello "Installa l'app": solo sul sito, mai dentro l'app desktop. */
export function Installa() {
  const { data } = useLatest();
  if (isDesktop || isMobile) return null;
  const voce = (chiave: 'windows' | 'mac', testo: string) => {
    const p = data?.[chiave];
    const classe = `btn${os === chiave ? '' : ' btn-tenue'}`;
    return p ? (
      <a className={classe} href={p.url}>{testo} <small>{p.versione}</small></a>
    ) : (
      <span className={`${classe} btn-spento`} aria-disabled="true">{testo}</span>
    );
  };
  return (
    <section className="panel installa">
      <h2>Installa l'app sul computer</h2>
      <p>Stessa app del sito, in una finestra tutta sua.</p>
      <div className="buttons">
        {voce('windows', 'Installa per Windows')}
        {voce('mac', 'Installa per macOS')}
      </div>
      {data && !data.windows && !data.mac && <p className="hint">Nessun installer pubblicato per ora.</p>}
      {data === null && <p className="hint">Elenco degli installer non raggiungibile.</p>}
    </section>
  );
}

/** Fascia "È disponibile la versione X": solo nell'app desktop, quando esiste una versione più nuova. */
export function AvvisoAggiornamento() {
  const { data } = useLatest();
  const p = data?.[os];
  if (!isDesktop || !haAggiornamento(p, __APP_VERSION__)) return null;
  return (
    <div className="avviso-agg">
      <span>È disponibile la versione <strong>{p!.versione}</strong>.</span>
      <a href={p!.url}>Scarica l'aggiornamento</a>
    </div>
  );
}
