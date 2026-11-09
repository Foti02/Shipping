import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { backend } from '../backend';
import { useMagazzinoOpzionale } from '../context/magazzino';
import { useSessione } from '../context/sessione';
import { useApi } from '../lib/api';
import { dataOra } from '../lib/formati';
import { nomePagina, useHeartbeat } from '../lib/heartbeat';
import type { Azione } from '../lib/permessi';
import { Button, Dialog } from '../ui';
import { AvvisoAggiornamento } from './Installa';

interface Voce { a: string; testo: string; azione?: Azione; soloClasse?: boolean; soloDocente?: boolean }

// Voci del magazzino attivo, relative a /m/:id. Filtrate da puo(), dal tipo di magazzino e dal ruolo.
const VOCI: Voce[] = [
  { a: '', testo: 'Cruscotto' },
  { a: 'articoli', testo: 'Magazzino' },
  { a: 'documenti/carico', testo: 'Movimenti' },
  { a: 'documenti/ordine_fornitore', testo: 'Ordini' },
  { a: 'documenti/fattura_vendita', testo: 'Fatture' },
  { a: 'anagrafiche', testo: 'Anagrafiche' },
  { a: 'agenda', testo: 'Agenda' },
  { a: 'inventario', testo: 'Inventario', azione: 'inventario' },
  { a: 'analisi', testo: 'Analisi' },
  { a: 'compiti', testo: 'Compiti', soloClasse: true },
  { a: 'attivita', testo: 'Attività', soloClasse: true },
  { a: 'classe', testo: 'Classe', soloDocente: true },
];

interface Notifica { id: string; messaggio: string; created_at?: string; letta?: boolean }
interface Notifiche { non_lette: number; elenco: Notifica[] }

/** Cornice dell'app: barra laterale (in basso sotto 800px), intestazione, campanella, menu utente, piede. */
export function Layout() {
  const m = useMagazzinoOpzionale();
  const { profilo, esci } = useSessione();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const [utente, setUtente] = useState(false);
  const [campanella, setCampanella] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

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

  const apriCampanella = () => {
    setCampanella(true);
    if (non_lette > 0)
      void backend.rpc('api_notifiche_leggi', { p_magazzino: m!.id }).then(() => qc.invalidateQueries({ queryKey: ['api', 'api_notifiche'] }), () => {});
  };

  const base = m ? `/m/${m.id}` : '';
  const voci = m
    ? VOCI.filter((v) => (!v.azione || m.puo(v.azione)) && (!v.soloClasse || m.tipo === 'classe') && (!v.soloDocente || (m.tipo === 'classe' && m.ruolo === 'docente')))
    : [];

  return (
    <div className="shell">
      <nav className="nav" aria-label="Menu principale">
        <p className="marchio">
          Shipping<span className="dot">.</span>
        </p>
        <NavLink to="/" end>
          Magazzini
        </NavLink>
        {voci.map((v) => (
          <NavLink key={v.a} to={v.a ? `${base}/${v.a}` : base} end={!v.a}>
            {v.testo}
          </NavLink>
        ))}
        {profilo?.ruolo_globale === 'docente' && <NavLink to="/docente">Docente</NavLink>}
      </nav>
      <div className="colonna">
        <AvvisoAggiornamento />
        <header className="top">
          <h1 className="titolo" style={{ fontSize: '1.25rem' }}>
            {m ? m.nome : 'Shipping'}
            <span className="dot">.</span>
            {m && <small>{m.tipo === 'personale' ? 'personale' : m.ruolo === 'docente' ? 'docente' : (m.ruolo_aziendale ?? 'classe')}</small>}
          </h1>
          {m && (
            <button type="button" className="top-icona" onClick={apriCampanella} aria-label={`Notifiche, ${non_lette} non lette`}>
              Notifiche
              {non_lette > 0 && <span className="conto">{non_lette}</span>}
            </button>
          )}
          <div className="menu-utente" ref={menu}>
            <button type="button" className="top-icona" aria-expanded={utente} onClick={() => setUtente(!utente)}>
              {profilo?.nome || profilo?.username}
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
        <footer className="piede">Versione {__APP_VERSION__}</footer>
      </div>
      <Dialog aperto={campanella} titolo="Notifiche" onChiudi={() => setCampanella(false)}>
        {notifiche.data?.elenco?.length ? (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {notifiche.data.elenco.map((n) => (
              <li key={n.id} className="carta" style={{ padding: 12 }}>
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
