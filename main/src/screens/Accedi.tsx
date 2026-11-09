import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { backend } from '../backend';
import { Installa } from '../components/Installa';
import { useSessione } from '../context/sessione';
import { messaggioErrore } from '../lib/errori';
import { Badge, Button, Field, Tabs } from '../ui';

const USERNAME = /^[a-z0-9._-]{3,20}$/;

interface DemoUtente { username: string; nome: string; ruolo: 'docente' | 'studente' }

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
    if (!USERNAME.test(username)) err.username = 'Da 3 a 20 caratteri: lettere minuscole, numeri, punto, trattino e trattino basso.';
    if (password.length < 6) err.password = 'Almeno 6 caratteri.';
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
    <main className="pubblica">
      <h1>
        Shipping
      </h1>
      <p className="lead">Gestionale di magazzino per le esercitazioni in classe.</p>

      <section className="panel">
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
          <Button type="submit" variante="accento" disabled={occupato}>
            {modo === 'accedi' ? 'Accedi' : 'Crea account'}
          </Button>
        </form>
      </section>

      {demo.length > 0 && (
        <section className="panel">
          <h2>Entra come</h2>
          <p className="hint">Modalità demo: utenti già pronti, senza password.</p>
          <div className="buttons">
            {demo.map((u) => (
              <Button key={u.username} variante="tenue" disabled={occupato} onClick={() => entra(u.username)}>
                {u.nome} {u.ruolo === 'docente' && <Badge tono="blu">docente</Badge>}
              </Button>
            ))}
          </div>
          {backend.demo?.reimposta && (
            <Button variante="tenue" onClick={() => void backend.demo!.reimposta()}>
              Azzera i dati demo
            </Button>
          )}
        </section>
      )}

      <Installa />
      <p className="hint">Versione {__APP_VERSION__}</p>
    </main>
  );
}
