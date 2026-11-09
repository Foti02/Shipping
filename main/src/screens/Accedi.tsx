import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { backend } from '../backend';
import { Installa } from '../components/Installa';
import { IllustrazioneMagazzino } from '../components/IllustrazioneMagazzino';
import { InterruttoreTema } from '../components/InterruttoreTema';
import { useSessione } from '../context/sessione';
import { MSG_PASSWORD, MSG_USERNAME, USERNAME, passwordOk } from '../lib/account';
import { messaggioErrore } from '../lib/errori';
import { FIRMA, NOME_PRODOTTO } from '../lib/marchio';
import { Badge, Button, Field, Tabs } from '../ui';
import { Icona, SegnoMarchio, type NomeIcona } from '../ui/icone';
import './accedi.css';

const PUNTI: { icona: NomeIcona; testo: string }[] = [
  { icona: 'magazzini', testo: 'Magazzino personale o di classe' },
  { icona: 'classe', testo: 'Scenari e compiti per ogni studente' },
  { icona: 'documenti', testo: 'Documenti dal preventivo alla fattura' },
];

const iniziali = (nome: string) => nome.trim().slice(0, 2).toUpperCase();

interface DemoUtente { username: string; nome: string; ruolo: 'admin' | 'docente' | 'studente' }

export default function Accedi() {
  const { fase, accedi, registra, entraCome } = useSessione();
  const [modo, setModo] = useState<'accedi' | 'registra'>('accedi');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [errori, setErrori] = useState<{ username?: string; password?: string; nome?: string; form?: string }>({});
  const [occupato, setOccupato] = useState(false);
  const [demo, setDemo] = useState<DemoUtente[]>([]);

  useEffect(() => {
    void backend.demo?.utenti().then(setDemo, () => {});
  }, []);

  if (fase === 'dentro') return <Navigate to="/" replace />;

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    const err: typeof errori = {};
    if (!USERNAME.test(username)) err.username = MSG_USERNAME;
    // Il minimo vale solo per crearla: in accesso lo decide il database (le password demo sono piu' corte).
    if (modo === 'registra' ? !passwordOk(password) : !password) err.password = modo === 'registra' ? MSG_PASSWORD : 'Scrivi la password.';
    if (modo === 'registra' && !nome.trim()) err.nome = 'Scrivi il tuo nome.';
    setErrori(err);
    if (Object.keys(err).length) return;
    setOccupato(true);
    try {
      if (modo === 'accedi') await accedi(username, password);
      else await registra(username, password, nome.trim());
    } catch (x) {
      setErrori({ form: messaggioErrore(x) });
    } finally {
      setOccupato(false);
    }
  };

  const entra = (u: string) => {
    setOccupato(true);
    entraCome(u)
      .catch((x) => setErrori({ form: messaggioErrore(x) }))
      .finally(() => setOccupato(false));
  };

  return (
    <div className="accesso">
      <aside className="accesso-marca">
        <div className="marca-testa">
          <SegnoMarchio dimensione={40} />
          <div>
            <p className="marca-nome">{NOME_PRODOTTO}</p>
            <p className="marca-sotto">Gestionale di magazzino per le esercitazioni in classe.</p>
          </div>
        </div>
        <div className="marca-corpo">
          <IllustrazioneMagazzino />
          <ul className="marca-punti">
            {PUNTI.map((p) => (
              <li key={p.testo}>
                <span className="marca-punto-icona">
                  <Icona nome={p.icona} dimensione={18} />
                </span>
                {p.testo}
              </li>
            ))}
          </ul>
        </div>
        <p className="marca-firma">{FIRMA}</p>
      </aside>

      <main className="accesso-forma">
        <div className="accesso-tema">
          <InterruttoreTema />
        </div>
        <div className="accesso-colonna">
          <section className="scheda-accesso">
            <h1>{modo === 'accedi' ? `Accedi a ${NOME_PRODOTTO}` : 'Crea il tuo account'}</h1>
            <p className="lead">{modo === 'accedi' ? 'Inserisci il tuo nome utente e la password.' : 'Bastano il tuo nome, un nome utente e una password.'}</p>
            <Tabs
              voci={[
                { id: 'accedi', etichetta: 'Accedi' },
                { id: 'registra', etichetta: 'Registrati' },
              ]}
              attiva={modo}
              onCambia={(m) => {
                setModo(m as typeof modo);
                setErrori({});
              }}
            />
            <form onSubmit={invia} noValidate>
              {errori.form && (
                <div className="form-errore" role="alert">
                  {errori.form}
                </div>
              )}
              {modo === 'registra' && (
                <Field label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} errore={errori.nome} autoComplete="name" />
              )}
              <Field
                label="Nome utente"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                errore={errori.username}
                nota="Lettere minuscole, numeri, . _ -"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                errore={errori.password}
                autoComplete={modo === 'accedi' ? 'current-password' : 'new-password'}
              />
              <Button type="submit" variante="accento" className="accesso-invia" disabled={occupato}>
                {modo === 'accedi' ? 'Accedi' : 'Crea account'}
              </Button>
            </form>
          </section>

          {demo.length > 0 && (
            <section className="accesso-demo" aria-labelledby="demo-titolo">
              <h2 id="demo-titolo" className="accesso-separatore">
                <span>Modalità demo</span>
              </h2>
              <p className="hint">Utenti già pronti, senza password. Scegli con chi entrare.</p>
              <div className="demo-elenco">
                {demo.map((u) => (
                  <button key={u.username} type="button" className={`demo-utente${u.ruolo !== 'studente' ? ' demo-docente' : ''}`} disabled={occupato} onClick={() => entra(u.username)}>
                    <span className="demo-avatar" aria-hidden="true">
                      {iniziali(u.nome)}
                    </span>
                    <span className="demo-nome">{u.nome}</span>
                    {u.ruolo === 'docente' && <Badge tono="blu">docente</Badge>}
                    {u.ruolo === 'admin' && <Badge tono="rosso">admin</Badge>}
                  </button>
                ))}
              </div>
              {backend.demo?.reimposta && (
                <button type="button" className="demo-azzera" onClick={() => void backend.demo!.reimposta()}>
                  Azzera i dati demo
                </button>
              )}
            </section>
          )}

          <Installa />
          <p className="accesso-piede">
            Versione {__APP_VERSION__}
            <span className="firma-compatta"> · {FIRMA}</span>
          </p>
        </div>
      </main>
    </div>
  );
}
