import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { backend } from '../backend';
import { InterruttoreTema } from '../components/InterruttoreTema';
import { useSessione } from '../context/sessione';
import { PASSWORD_MIN, haErrori, validaNome, validaPassword } from '../lib/account';
import { useApi, useMutazione } from '../lib/api';
import { messaggioErrore } from '../lib/errori';
import { dataOra } from '../lib/formati';
import { guidaHref } from '../lib/guida';
import { FIRMA, NOME_PRODOTTO } from '../lib/marchio';
import { ETICHETTA_RUOLO_GLOBALE } from '../lib/permessi';
import { Badge, Button, Field, useToast } from '../ui';
import { DialogoElimina, ErroreForm } from './admin/dialoghi';
import './admin/admin.css';

interface DatiAccount {
  user_id: string;
  username: string;
  nome: string;
  ruolo_globale: 'studente' | 'docente' | 'admin';
  creato_il: string;
  n_classi_possedute: number;
}

/** "Il mio account": nominativo, password, tema, eliminazione. Per ogni utente collegato. */
export default function Account() {
  const { profilo, ricarica, esci } = useSessione();
  const toast = useToast();
  const account = useApi<DatiAccount>('api_account');
  const dati = account.data;

  const salvaNome = useMutazione('api_account_nome', { ok: 'Nominativo aggiornato' });
  const [nome, setNome] = useState<string | null>(null); // null = non toccato: si vede quello salvato
  const [errNome, setErrNome] = useState<string>();
  const valoreNome = nome ?? dati?.nome ?? profilo?.nome ?? '';

  const [vecchia, setVecchia] = useState('');
  const [nuova, setNuova] = useState('');
  const [conferma, setConferma] = useState('');
  const [errPw, setErrPw] = useState<{ vecchia?: string; nuova?: string; conferma?: string; form?: string }>({});
  const [occupato, setOccupato] = useState(false);
  const [elimina, setElimina] = useState(false);

  if (!profilo) return null;
  const classi = dati?.n_classi_possedute ?? 0;

  const invioNome = (e: FormEvent) => {
    e.preventDefault();
    const err = validaNome(valoreNome);
    setErrNome(err);
    if (err) return;
    salvaNome.mutate({ p_nome: valoreNome.trim() }, { onSuccess: async () => { setNome(null); await ricarica(); } });
  };

  const invioPassword = async (e: FormEvent) => {
    e.preventDefault();
    const err = validaPassword(nuova, conferma, vecchia);
    setErrPw(err);
    if (haErrori(err)) return;
    setOccupato(true);
    try {
      await backend.auth.cambiaPassword(vecchia, nuova);
      setVecchia('');
      setNuova('');
      setConferma('');
      toast('Password cambiata', 'ok');
    } catch (x) {
      const m = x instanceof Error ? x.message : '';
      // credenziali_errate qui vuol dire "password attuale sbagliata", non "utente sconosciuto"
      if (m === 'credenziali_errate') setErrPw({ vecchia: 'La password attuale non è corretta.' });
      else setErrPw({ form: messaggioErrore(x) });
    } finally {
      setOccupato(false);
    }
  };

  return (
    <div className="account">
      <div className="intestazione">
        <h1>Il mio account</h1>
        <Button variante="tenue" onClick={() => void esci()}>Esci</Button>
      </div>

      <section className="pannello" aria-labelledby="h-profilo">
        <h2 id="h-profilo">Profilo</h2>
        <dl className="dati-account">
          <div><dt>Nome utente</dt><dd><strong>@{profilo.username}</strong></dd></div>
          <div><dt>Ruolo</dt><dd><Badge tono={profilo.ruolo_globale === 'admin' ? 'rosso' : profilo.ruolo_globale === 'docente' ? 'blu' : 'grigio'}>{ETICHETTA_RUOLO_GLOBALE[profilo.ruolo_globale]}</Badge></dd></div>
          {dati?.creato_il && <div><dt>Account creato il</dt><dd>{dataOra(dati.creato_il)}</dd></div>}
        </dl>
        <p className="spiegazione">Il nome utente non si può cambiare: è quello con cui accedi.</p>
        <form onSubmit={invioNome} noValidate className="form-stretto">
          <Field label="Nominativo" value={valoreNome} onChange={(e) => setNome(e.target.value)} errore={errNome} nota="Il nome che vedono docente e compagni." maxLength={60} autoComplete="name" />
          <Button type="submit" variante="accento" disabled={salvaNome.isPending || valoreNome.trim() === (dati?.nome ?? profilo.nome)}>Salva il nominativo</Button>
        </form>
      </section>

      <section className="pannello" aria-labelledby="h-password">
        <h2 id="h-password">Cambia password</h2>
        <form onSubmit={invioPassword} noValidate className="form-stretto">
          {errPw.form && <p className="errore form-errore" role="alert">{errPw.form}</p>}
          <Field label="Password attuale" type="password" value={vecchia} onChange={(e) => setVecchia(e.target.value)} errore={errPw.vecchia} autoComplete="current-password" />
          <Field label="Nuova password" type="password" value={nuova} onChange={(e) => setNuova(e.target.value)} errore={errPw.nuova} nota={`Almeno ${PASSWORD_MIN} caratteri.`} autoComplete="new-password" />
          <Field label="Ripeti la nuova password" type="password" value={conferma} onChange={(e) => setConferma(e.target.value)} errore={errPw.conferma} autoComplete="new-password" />
          <Button type="submit" variante="accento" disabled={occupato}>Cambia password</Button>
        </form>
      </section>

      <section className="pannello" aria-labelledby="h-aspetto">
        <h2 id="h-aspetto">Aspetto e informazioni</h2>
        <div className="righe-bottoni">
          <InterruttoreTema conTesto />
          <Link className="btn btn-tenue" to={guidaHref('/account')}>Apri la guida</Link>
        </div>
        <p className="muto" style={{ marginTop: 12, marginBottom: 0 }}>
          {NOME_PRODOTTO} · Versione {__APP_VERSION__}<br />{FIRMA}
        </p>
      </section>

      <section className="sezione" aria-labelledby="h-pericolo">
        <h2 id="h-pericolo">Zona pericolosa</h2>
        <div className="pericolo">
          <h3>Elimina il mio account</h3>
          <p>Cancella l'account e tutto ciò che è tuo: il magazzino personale (articoli, documenti, anagrafiche, agenda) e i tuoi dati. Dalle classi in cui sei iscritto sparisci, ma ciò che hai registrato lì resta alla classe. Non si può annullare.</p>
          {classi > 0 && (
            <div className="avviso errore-box" role="alert">
              <p>Possiedi {classi === 1 ? 'una classe' : `${classi} classi`}: finché esistono non puoi eliminare l'account. Eliminala dalle sue impostazioni, oppure chiedi a un amministratore di trasferirla a un altro docente.</p>
            </div>
          )}
          <Button variante="pericolo" disabled={classi > 0 || !dati} onClick={() => setElimina(true)}>Elimina account</Button>
        </div>
      </section>

      <DialogoElimina
        aperto={elimina}
        onChiudi={() => setElimina(false)}
        titolo="Elimina il mio account"
        spiegazione={<p>Stai per cancellare l'account <strong>@{profilo.username}</strong>, il tuo magazzino personale e tutti i dati collegati.</p>}
        username={profilo.username}
        etichetta="Elimina il mio account"
        funzione="api_account_elimina"
        args={{}}
        onFatto={() => { setElimina(false); toast('Account eliminato', 'ok'); void esci(); }}
      />
      {account.isError && <ErroreForm errore={account.error} />}
    </div>
  );
}
