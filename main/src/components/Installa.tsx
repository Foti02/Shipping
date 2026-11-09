import { useQuery } from '@tanstack/react-query';
import { cmp } from '../semver';

const REPO = 'Foti02/Shipping';
const RELEASES = `https://github.com/${REPO}/releases/latest`;

// L'app desktop (Electron) si riconosce dal suffisso nello user agent.
export const isDesktop = navigator.userAgent.includes('ShippingDesktop');
const here = /Mac/.test(navigator.platform) ? 'mac' : /Win/.test(navigator.platform) ? 'win' : '';

interface Release {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

/** Ultima release su GitHub; offline resta null e i link puntano alla pagina delle release. */
function useRelease() {
  return useQuery({
    queryKey: ['github-release'],
    queryFn: async () => {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
      return r.ok ? ((await r.json()) as Release) : null;
    },
    staleTime: 3_600_000,
  });
}

const trova = (rel: Release | null | undefined, ext: string) => rel?.assets.find((a) => a.name.endsWith(ext))?.browser_download_url;

/** Pannello "Installa l'app": solo sul sito, mai dentro l'app desktop. */
export function Installa() {
  const { data: rel } = useRelease();
  if (isDesktop) return null;
  return (
    <section className="panel">
      <h2>Installa l'app sul computer</h2>
      <p>Stessa app del sito, in una finestra tutta sua.</p>
      <div className="buttons">
        <a className={`btn${here === 'win' ? '' : ' btn-tenue'}`} href={trova(rel, '.exe') ?? RELEASES}>
          Installa per Windows
        </a>
        <a className={`btn${here === 'mac' ? '' : ' btn-tenue'}`} href={trova(rel, '.dmg') ?? RELEASES}>
          Installa per macOS
        </a>
      </div>
      <p className="hint">{rel ? `Ultima versione: ${rel.tag_name}` : 'Si apre l\'ultima versione pubblicata.'}</p>
    </section>
  );
}

/** Fascia "È disponibile la versione X": solo nell'app desktop, quando esiste una release più nuova. */
export function AvvisoAggiornamento() {
  const { data: rel } = useRelease();
  if (!isDesktop || !rel || cmp(rel.tag_name, __APP_VERSION__) <= 0) return null;
  return (
    <div className="avviso-agg">
      <span>
        È disponibile la versione <strong>{rel.tag_name.replace(/^v/, '')}</strong>.
      </span>
      <a href={trova(rel, here === 'mac' ? '.dmg' : '.exe') ?? RELEASES}>Scarica l'aggiornamento</a>
    </div>
  );
}
