import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { backend } from '../backend';
import { useMagazzinoOpzionale } from '../context/magazzino';
import { useSessione } from '../context/sessione';
import { useApi } from '../lib/api';
import { dataOra } from '../lib/formati';
import { guidaHref } from '../lib/guida';
import { nomePagina, useHeartbeat } from '../lib/heartbeat';
import { FIRMA, NOME_PRODOTTO } from '../lib/marchio';
import type { Azione } from '../lib/permessi';
import { Button, Dialog } from '../ui';
import { Icona, SegnoMarchio, type NomeIcona } from '../ui/icone';
import { AvvisoAggiornamento } from './Installa';
import { InterruttoreTema } from './InterruttoreTema';

/** `a` e' relativo a /m/:id (con eventuale query); `assoluta` lo prende com'e'. `escludeQ`: non attiva se la query contiene questo testo. */
interface Voce { a: string; testo: string; azione?: Azione; soloClasse?: boolean; soloDocente?: boolean; assoluta?: boolean; escludeQ?: string }
interface Gruppo { id: string; testo: string; icona: NomeIcona; voci: Voce[] }
type Elemento = { semplice: Voce & { icona: NomeIcona } } | { gruppo: Gruppo };

// Voci del magazzino attivo. Filtrate da puo(), dal tipo di magazzino e dal ruolo.
const MENU: Elemento[] = [
  { semplice: { a: '', testo: 'Cruscotto', icona: 'cruscotto' } },
  {
    gruppo: {
      id: 'articoli', testo: 'Articoli', icona: 'articoli',
      voci: [
        { a: 'articoli', testo: 'Articoli', escludeQ: 'sezione=ubicazioni' },
        { a: 'articoli?sezione=ubicazioni', testo: 'Ubicazioni' },
      ],
    },
  },
  {
    gruppo: {
      id: 'documenti', testo: 'Documenti', icona: 'documenti',
      voci: [
        { a: 'documenti/preventivo', testo: 'Preventivi' },
        { a: 'documenti/ordine_cliente', testo: 'Ordini cliente' },
        { a: 'documenti/scarico', testo: 'DDT / Scarichi' },
        { a: 'documenti/fattura_vendita', testo: 'Fatture vendita' },
        { a: 'documenti/ordine_fornitore', testo: 'Ordini fornitore' },
        { a: 'documenti/carico', testo: 'Carichi' },
        { a: 'documenti/reso_cliente', testo: 'Resi' },
        { a: 'documenti/fattura_acquisto', testo: 'Fatture acquisto' },
      ],
    },
  },
  { semplice: { a: 'anagrafiche', testo: 'Anagrafiche', icona: 'anagrafiche' } },
  { semplice: { a: 'agenda', testo: 'Agenda', icona: 'agenda' } },
  {
    gruppo: {
      id: 'magazzino', testo: 'Magazzino', icona: 'inventario',
      voci: [
        { a: 'inventario', testo: 'Inventario', azione: 'inventario' },
        { a: 'analisi', testo: 'Analisi' },
      ],
    },
  },
  {
    gruppo: {
      id: 'classe', testo: 'Classe', icona: 'classe',
      voci: [
        { a: 'compiti', testo: 'Compiti', soloClasse: true },
        { a: 'attivita', testo: 'Attività', soloClasse: true },
        { a: 'classe', testo: 'Impostazioni classe', soloClasse: true, soloDocente: true },
      ],
    },
  },
];

const CHIAVE_GRUPPI = 'shipping.nav.gruppi';
const leggiGruppi = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE_GRUPPI) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
};
const salvaGruppi = (v: Record<string, boolean>) => {
  try {
    localStorage.setItem(CHIAVE_GRUPPI, JSON.stringify(v));
  } catch { /* nessun salvataggio: i gruppi restano come sono finche' la pagina e' aperta */ }
};

interface Notifica { id: string; messaggio: string; created_at?: string; letta?: boolean }
interface Notifiche { non_lette: number; elenco: Notifica[] }

/** Cornice dell'app: barra laterale a gruppi richiudibili (cassetto sotto 800px), intestazione, campanella, menu utente, piede. */
export function Layout() {
  const m = useMagazzinoOpzionale();
  const { profilo, esci } = useSessione();
  const { pathname, search } = useLocation();
  const qc = useQueryClient();
  const [utente, setUtente] = useState(false);
  const [campanella, setCampanella] = useState(false);
  const [cassetto, setCassetto] = useState(false);
  const [aperti, setAperti] = useState(leggiGruppi);
  const menu = useRef<HTMLDivElement>(null);
  const bottoneMenu = useRef<HTMLButtonElement>(null);
  const bottoneChiudi = useRef<HTMLButtonElement>(null);

  useHeartbeat(m?.id ?? null, nomePagina(pathname));
  const notifiche = useApi<Notifiche>('api_notifiche', { p_magazzino: m?.id }, { poll: 5000, enabled: !!m });
  const non_lette = notifiche.data?.non_lette ?? 0;

  useEffect(() => {
    if (!utente) return;
    const chiudi = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menu.current?.contains(e.target as Node)) setUtente(false);
    };
    document.addEventListener('mousedown', chiudi);
    document.addEventListener('keydown', chiudi);
    return () => {
      document.removeEventListener('mousedown', chiudi);
      document.removeEventListener('keydown', chiudi);
    };
  }, [utente]);

  // Il cassetto (telefono) si chiude con Esc e dopo ogni cambio pagina; il focus torna al pulsante che l'ha aperto.
  useEffect(() => setCassetto(false), [pathname, search]);
  useEffect(() => {
    if (!cassetto) return;
    bottoneChiudi.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setCassetto(false);
      bottoneMenu.current?.focus();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [cassetto]);

  const apriCampanella = () => {
    setCampanella(true);
    if (non_lette > 0)
      void backend.rpc('api_notifiche_leggi', { p_magazzino: m!.id }).then(() => qc.invalidateQueries({ queryKey: ['api', 'api_notifiche'] }), () => {});
  };

  const base = m ? `/m/${m.id}` : '';
  const docenteGlobale = profilo?.ruolo_globale === 'docente';
  const visibile = (v: Voce) =>
    (!v.azione || !!m?.puo(v.azione)) && (!v.soloClasse || m?.tipo === 'classe') && (!v.soloDocente || (m?.tipo === 'classe' && m.ruolo === 'docente'));
  const elementi = m
    ? MENU.flatMap((e): Elemento[] => {
        if ('semplice' in e) return visibile(e.semplice) ? [e] : [];
        const voci = e.gruppo.voci.filter(visibile);
        return voci.length ? [{ gruppo: { ...e.gruppo, voci } }] : [];
      })
    : [];
  const gruppoDocente: Gruppo | null = docenteGlobale ? { id: 'docente', testo: 'Docente', icona: 'docente', voci: [{ a: '/docente', testo: 'Le mie classi', assoluta: true }] } : null;

  const percorso = (v: Voce) => (v.assoluta ? v.a : v.a ? `${base}/${v.a}` : base);
  const attiva = (v: Voce) => {
    const [p, q] = percorso(v).split('?');
    if (v.assoluta ? !(pathname === p || pathname.startsWith(`${p}/`)) : pathname !== p) return false;
    if (q) return search.includes(q);
    return !(v.escludeQ && search.includes(v.escludeQ));
  };
  const gruppoAttivo = (g: Gruppo) => g.voci.some(attiva);
  const tuttiGruppi = [...elementi.flatMap((e) => ('gruppo' in e ? [e.gruppo] : [])), ...(gruppoDocente ? [gruppoDocente] : [])];
  const idAttivo = tuttiGruppi.find(gruppoAttivo)?.id;

  // Il gruppo della pagina corrente si apre da solo: non si resta mai senza vedere dove si e'.
  useEffect(() => {
    if (!idAttivo) return;
    setAperti((a) => {
      if (a[idAttivo] ?? true) return a;
      const n = { ...a, [idAttivo]: true };
      salvaGruppi(n);
      return n;
    });
  }, [idAttivo]);

  const alterna = (id: string, ora: boolean) => {
    const n = { ...aperti, [id]: !ora };
    setAperti(n);
    salvaGruppi(n);
  };
  // Senza scelta salvata sono aperti solo i gruppi piu' usati e quello della pagina.
  const eAperto = (g: Gruppo) => aperti[g.id] ?? (g.id === 'articoli' || g.id === idAttivo);

  // Funzioni di disegno e non componenti: cosi' il focus non si perde quando la barra si ridisegna.
  const linkVoce = (v: Voce, icona?: NomeIcona) => (
    <Link to={percorso(v)} className={`nav-voce${attiva(v) ? ' attiva' : ''}`} aria-current={attiva(v) ? 'page' : undefined}>
      {icona && <Icona nome={icona} />}
      <span>{v.testo}</span>
    </Link>
  );
  const vistaGruppo = (g: Gruppo) => {
    const ora = eAperto(g);
    return (
      <li key={g.id}>
        <button type="button" className={`nav-gruppo-testa${gruppoAttivo(g) ? ' attivo' : ''}`} aria-expanded={ora} aria-controls={`nav-g-${g.id}`} onClick={() => alterna(g.id, ora)}>
          <Icona nome={g.icona} />
          <span className="nav-etichetta">{g.testo}</span>
          <Icona nome="freccia" dimensione={16} className="icona nav-freccia" />
        </button>
        <ul id={`nav-g-${g.id}`} className="nav-sotto" hidden={!ora}>
          {g.voci.map((v) => (
            <li key={v.a}>
              {linkVoce(v)}
            </li>
          ))}
        </ul>
      </li>
    );
  };

  return (
    <div className="shell">
      <nav id="nav-principale" className={`nav${cassetto ? ' aperta' : ''}`} aria-label="Menu principale">
        <div className="nav-testa">
          <p className="marchio">
            <SegnoMarchio dimensione={28} />
            {NOME_PRODOTTO}
          </p>
          <button ref={bottoneChiudi} type="button" className="top-icona nav-chiudi" aria-label="Chiudi il menu" onClick={() => { setCassetto(false); bottoneMenu.current?.focus(); }}>
            <Icona nome="chiudi" />
          </button>
        </div>
        <ul className="nav-lista">
          <li>
            {linkVoce({ a: '/', testo: 'Tutti i magazzini', assoluta: true }, 'magazzini')}
          </li>
          {elementi.map((e) =>
            'semplice' in e ? (
              <li key={e.semplice.a || 'cruscotto'}>
                {linkVoce(e.semplice, e.semplice.icona)}
              </li>
            ) : (
              vistaGruppo(e.gruppo)
            ),
          )}
          {gruppoDocente && vistaGruppo(gruppoDocente)}
        </ul>
        <p className="nav-piede">{FIRMA}</p>
      </nav>
      {cassetto && <button type="button" className="nav-velo" aria-label="Chiudi il menu" tabIndex={-1} onClick={() => setCassetto(false)} />}
      <div className="colonna">
        <AvvisoAggiornamento />
        <header className="top">
          <button ref={bottoneMenu} type="button" className="top-icona top-menu" aria-label="Apri il menu" aria-expanded={cassetto} aria-controls="nav-principale" onClick={() => setCassetto(true)}>
            <Icona nome="menu" dimensione={20} />
          </button>
          <div className="top-contesto">
            {m ? m.nome : NOME_PRODOTTO}
            {m && <small>{m.tipo === 'personale' ? 'personale' : m.ruolo === 'docente' ? 'docente' : (m.ruolo_aziendale ?? 'classe')}</small>}
          </div>
          <Link to={guidaHref(pathname)} className="top-icona" aria-label="Guida" title="Guida di questa pagina">
            <Icona nome="guida" />
            <span className="top-testo">Guida</span>
          </Link>
          <InterruttoreTema />
          {m && (
            <button type="button" className="top-icona" onClick={apriCampanella} aria-label={`Notifiche, ${non_lette} non lette`}>
              <Icona nome="campana" />
              {non_lette > 0 && <span className="conto">{non_lette}</span>}
            </button>
          )}
          <div className="menu-utente" ref={menu}>
            <button type="button" className="top-icona" aria-expanded={utente} onClick={() => setUtente(!utente)}>
              <Icona nome="utente" />
              <span className="nome-utente">{profilo?.nome || profilo?.username}</span>
            </button>
            {utente && (
              <div className="tendina">
                <p className="muto">@{profilo?.username}</p>
                <Button variante="tenue" onClick={() => void esci()}>
                  Esci
                </Button>
              </div>
            )}
          </div>
        </header>
        <main className="contenuto">
          <Outlet />
        </main>
        <footer className="piede">
          {NOME_PRODOTTO} · Versione {__APP_VERSION__}
          <span className="solo-piccolo"> · {FIRMA}</span>
        </footer>
      </div>
      <Dialog aperto={campanella} titolo="Notifiche" onChiudi={() => setCampanella(false)}>
        {notifiche.data?.elenco?.length ? (
          <ul className="elenco-notifiche">
            {notifiche.data.elenco.map((n) => (
              <li key={n.id}>
                {n.messaggio}
                {n.created_at && <div className="muto">{dataOra(n.created_at)}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muto">Nessuna notifica.</p>
        )}
        <div className="dialog-azioni">
          <Button variante="tenue" onClick={() => setCampanella(false)}>
            Chiudi
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
