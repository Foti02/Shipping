import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { backend } from './backend';
import { Layout } from './components/Layout';
import { MagazzinoRotta } from './context/magazzino';
import { useSessione } from './context/sessione';
import { Button, EmptyState } from './ui';
import { messaggioErrore } from './lib/errori';
import { eAdminGlobale, eDocenteGlobale, type RuoloGlobale } from './lib/permessi';
import Accedi from './screens/Accedi';
import Account from './screens/Account';
import Admin from './screens/Admin';
import Agenda from './screens/Agenda';
import Analisi from './screens/Analisi';
import Anagrafiche from './screens/Anagrafiche';
import Articoli from './screens/Articoli';
import Attivita from './screens/Attivita';
import Compiti from './screens/Compiti';
import Cruscotto from './screens/Cruscotto';
import Docente from './screens/Docente';
import DocenteClasse from './screens/DocenteClasse';
import Documenti from './screens/Documenti';
import ImpostazioniClasse from './screens/ImpostazioniClasse';
import Guida from './screens/Guida';
import Inventario from './screens/Inventario';
import NonConfigurato from './screens/NonConfigurato';
import SceltaMagazzino from './screens/SceltaMagazzino';

/** Tiene fuori chi non ha fatto l'accesso. */
function RichiedeAccesso() {
  const { fase, errore, ricarica, esci } = useSessione();
  if (fase === 'carico') return <p className="contenuto muto">Caricamento...</p>;
  if (fase === 'fuori') return <Navigate to="/accedi" replace />;
  if (fase === 'errore')
    return (
      <main className="pubblica">
        <h1>
          Non riesco a collegarmi
        </h1>
        <p>{messaggioErrore(errore)}</p>
        <div className="buttons">
          <Button onClick={() => void ricarica()}>Riprova</Button>
          <Button variante="tenue" onClick={() => void esci()}>
            Esci
          </Button>
        </div>
      </main>
    );
  return <Outlet />;
}

/** Blocco per ruolo: chi non lo ha vede un messaggio chiaro invece di una pagina vuota (la verità resta nel database). */
function RichiedeRuolo({ ammesso, titolo, testo }: { ammesso: (r: RuoloGlobale | undefined) => boolean; titolo: string; testo: string }) {
  const { profilo } = useSessione();
  if (ammesso(profilo?.ruolo_globale)) return <Outlet />;
  return <EmptyState titolo={titolo} testo={testo} azione={<Link className="btn" to="/">Torna ai magazzini</Link>} />;
}

// Rotte di architecture.md sezione 7.
export default function App() {
  if (backend.nonConfigurato) return <NonConfigurato />;
  return (
    <Routes>
      <Route path="/accedi" element={<Accedi />} />
      <Route path="/guida/:sezione?" element={<Guida />} />
      <Route element={<RichiedeAccesso />}>
        <Route element={<Layout />}>
          <Route index element={<SceltaMagazzino />} />
          <Route path="account" element={<Account />} />
          <Route element={<RichiedeRuolo ammesso={eDocenteGlobale} titolo="Area riservata ai docenti" testo="Il ruolo docente lo assegna l'amministratore." />}>
            <Route path="docente" element={<Docente />} />
            <Route path="docente/:id" element={<DocenteClasse />} />
          </Route>
          <Route element={<RichiedeRuolo ammesso={eAdminGlobale} titolo="Area riservata agli amministratori" testo="Questa pagina serve a gestire utenti e classi: è visibile solo a chi ha il ruolo di amministratore." />}>
            <Route path="admin" element={<Admin />} />
          </Route>
        </Route>
        <Route path="m/:id" element={<MagazzinoRotta />}>
          <Route element={<Layout />}>
            <Route index element={<Cruscotto />} />
            <Route path="articoli" element={<Articoli />} />
            <Route path="documenti/:tipo" element={<Documenti />} />
            <Route path="anagrafiche" element={<Anagrafiche />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="inventario" element={<Inventario />} />
            <Route path="analisi" element={<Analisi />} />
            <Route path="compiti" element={<Compiti />} />
            <Route path="attivita" element={<Attivita />} />
            <Route path="classe" element={<ImpostazioniClasse />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
