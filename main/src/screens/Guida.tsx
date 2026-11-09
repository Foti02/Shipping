import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { FIRMA, NOME_PRODOTTO } from '../lib/marchio';
import '../ui'; // porta con se' ui.css (classi .btn)
import { Icona } from '../ui/icone';
import './guida/guida.css';

interface Voce { id: string; titolo: string; livello: number }
interface Manuale { indice: Voce[]; html: string; sezioni: { id: string; titolo: string; capitolo: string; testo: string }[] }

/** Testo di ogni sezione (da un titolo al successivo), per la ricerca. */
function sezioniDa(html: string): Manuale['sezioni'] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: Manuale['sezioni'] = [];
  let capitolo = '';
  for (const el of Array.from(doc.body.children)) {
    if (/^H[23]$/.test(el.tagName)) {
      if (el.tagName === 'H2') capitolo = el.textContent ?? '';
      out.push({ id: el.id, titolo: el.textContent ?? '', capitolo: el.tagName === 'H3' ? capitolo : '', testo: '' });
    }
    else if (out.length) out[out.length - 1].testo += ` ${el.textContent ?? ''}`;
  }
  return out;
}

/** Indice e testo stanno in public/manuale (generati da scripts/manuale.mjs); importati cosi' funzionano anche da file://. */
function useManuale(): Manuale | 'errore' | null {
  const [m, setM] = useState<Manuale | 'errore' | null>(null);
  useEffect(() => {
    let vivo = true;
    Promise.all([import('../../public/manuale/indice.json'), import('../../public/manuale/contenuto.html?raw')])
      .then(([i, h]) => vivo && setM({ indice: i.default as Voce[], html: h.default, sezioni: sezioniDa(h.default) }))
      .catch(() => vivo && setM('errore'));
    return () => { vivo = false; };
  }, []);
  return m;
}

export default function Guida() {
  const { sezione } = useParams();
  const nav = useNavigate();
  const { key } = useLocation();
  const manuale = useManuale();
  const testo = useRef<HTMLElement>(null);
  const [cerca, setCerca] = useState('');
  const [aperto, setAperto] = useState(false);
  const [visibile, setVisibile] = useState<string | null>(null);
  const pronto = typeof manuale === 'object' && manuale !== null;

  // Va alla sezione dell'indirizzo (o in cima).
  useEffect(() => {
    if (!pronto) return;
    const el = sezione ? testo.current?.querySelector(`[id="${CSS.escape(sezione)}"]`) : null;
    if (el) el.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }, [pronto, sezione]);

  // Evidenzia nell'indice il titolo che si sta leggendo.
  useEffect(() => {
    if (!pronto) return;
    let attesa = 0;
    const aggiorna = () => {
      attesa = 0;
      let corrente: string | null = null;
      for (const h of testo.current?.querySelectorAll<HTMLElement>('h2[id], h3[id]') ?? []) {
        if (h.getBoundingClientRect().top > 120) break;
        corrente = h.id;
      }
      setVisibile(corrente);
    };
    const suScroll = () => { attesa ||= requestAnimationFrame(aggiorna); };
    aggiorna();
    window.addEventListener('scroll', suScroll, { passive: true });
    return () => { window.removeEventListener('scroll', suScroll); cancelAnimationFrame(attesa); };
  }, [pronto]);

  const attiva = visibile ?? sezione ?? null;
  const q = cerca.trim().toLowerCase();
  const risultati = useMemo(() => {
    if (!pronto || q.length < 2) return null;
    return manuale.sezioni.flatMap((s) => {
      const i = s.testo.toLowerCase().indexOf(q);
      if (i < 0 && !s.titolo.toLowerCase().includes(q)) return [];
      const brano = i < 0 ? '' : `${i > 40 ? '…' : ''}${s.testo.slice(Math.max(0, i - 40), i + 80).replace(/\s+/g, ' ').trim()}…`;
      return [{ ...s, brano }];
    });
  }, [manuale, pronto, q]);

  // Nell'indice: tutti i capitoli, e i paragrafi solo del capitolo che si sta leggendo.
  const voci = useMemo(() => {
    if (!pronto) return [];
    let capitolo = '';
    const conCapitolo = manuale.indice.map((v) => {
      if (v.livello === 2) capitolo = v.id;
      return { ...v, capitolo };
    });
    const mio = conCapitolo.find((v) => v.id === attiva)?.capitolo;
    return conCapitolo.filter((v) => v.livello === 2 || v.capitolo === mio);
  }, [manuale, pronto, attiva]);

  const indietro = () => (key !== 'default' ? nav(-1) : nav('/'));
  /** I link `#id` del testo non devono rompere il router a cancelletto. */
  const suClic = (e: MouseEvent) => {
    const href = (e.target as HTMLElement).closest('a')?.getAttribute('href');
    if (href?.startsWith('#')) {
      e.preventDefault();
      nav(`/guida/${href.slice(1)}`);
    }
  };

  return (
    <div className="guida">
      <header className="guida-testa">
        <button type="button" className="btn btn-tenue btn-icona guida-menu" aria-expanded={aperto} aria-controls="guida-indice" aria-label="Indice" onClick={() => setAperto((a) => !a)}>
          <Icona nome={aperto ? 'chiudi' : 'menu'} />
        </button>
        <button type="button" className="btn btn-tenue" onClick={indietro}>
          <Icona nome="freccia" style={{ transform: 'rotate(180deg)' }} /> <span className="guida-etichetta">Torna all'app</span>
        </button>
        <h1>{NOME_PRODOTTO}: guida</h1>
        <div className="guida-scarica">
          <a className="btn btn-tenue" href="manuale/Shipping-ERP-Manuale.pdf" download><span className="guida-lungo">Scarica </span>PDF</a>
          <a className="btn btn-tenue" href="manuale/Shipping-ERP-Manuale.docx" download><span className="guida-lungo">Scarica </span>Word</a>
        </div>
      </header>

      <div className="guida-corpo">
        <nav id="guida-indice" className={`guida-indice${aperto ? ' aperto' : ''}`} aria-label="Indice del manuale">
          <input type="search" className="guida-cerca" placeholder="Cerca nel manuale" aria-label="Cerca nel manuale" value={cerca} onChange={(e) => setCerca(e.target.value)} />
          {risultati ? (
            <ul className="guida-voci">
              {risultati.length === 0 && <li className="guida-vuoto">Nessun risultato.</li>}
              {risultati.map((r) => (
                <li key={r.id}>
                  <Link to={`/guida/${r.id}`} onClick={() => { setAperto(false); setCerca(''); }}>
                    <strong>{r.titolo}</strong>
                    {(r.capitolo || r.brano) && <small>{r.capitolo}{r.capitolo && r.brano && ': '}{r.brano}</small>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="guida-voci">
              {voci.map((v) => (
                <li key={v.id} className={`liv${v.livello}`}>
                  <Link to={`/guida/${v.id}`} aria-current={v.id === attiva ? 'location' : undefined} onClick={() => setAperto(false)}>{v.titolo}</Link>
                </li>
              ))}
            </ul>
          )}
          <p className="guida-firma">{FIRMA}</p>
        </nav>

        <article ref={testo} className="guida-testo" onClick={suClic}>
          {manuale === 'errore' && <p>Non riesco a caricare il manuale. Riprova tra poco.</p>}
          {manuale === null && <p className="muto">Caricamento...</p>}
          {pronto && <div dangerouslySetInnerHTML={{ __html: manuale.html }} />}
        </article>
      </div>
    </div>
  );
}
