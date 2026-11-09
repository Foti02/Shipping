import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { backend } from '../../backend';
import { PASSWORD_MIN, haErrori, validaNome, validaPassword, validaUsername } from '../../lib/account';
import { messaggioErrore } from '../../lib/errori';
import { Badge, Button, Field } from '../../ui';
import './admin.css';

interface Esito { username: string; nome: string; ruoloImpostato: boolean; errore?: unknown }

/** Crea un account e lo promuove a docente. La sessione dell'admin non cambia. */
export default function NuovoDocente() {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [nome, setNome] = useState('');
  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [errori, setErrori] = useState<{ username?: string; nome?: string; nuova?: string; conferma?: string; form?: string }>({});
  const [occupato, setOccupato] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(null);

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    const { nuova, conferma: c } = validaPassword(password, conferma);
    const err = { username: validaUsername(username), nome: validaNome(nome), nuova, conferma: c };
    setErrori(err);
    if (haErrori(err)) return;
    setOccupato(true);
    let creato: { userId: string } | null = null;
    try {
      creato = await backend.auth.creaUtente(username, password, nome.trim());
      await backend.rpc('api_admin_imposta_ruolo', { p_user: creato.userId, p_ruolo: 'docente' });
      setEsito({ username, nome: nome.trim(), ruoloImpostato: true });
      setUsername(''); setNome(''); setPassword(''); setConferma('');
    } catch (x) {
      // account creato ma ruolo non impostato: l'admin lo vede e puo' correggerlo da "Utenti"
      if (creato) setEsito({ username, nome: nome.trim(), ruoloImpostato: false, errore: x });
      else if (x instanceof Error && x.message === 'gia_esiste') setErrori({ username: 'Questo nome utente è già in uso.' });
      else setErrori({ form: messaggioErrore(x) });
    } finally {
      setOccupato(false);
      void qc.invalidateQueries({ queryKey: ['api'] });
    }
  };

  return (
    <section aria-label="Nuovo docente" className="pannello">
      {esito && (
        <div className={`avviso ${esito.ruoloImpostato ? 'ok-box' : 'errore-box'}`} role="status">
          {esito.ruoloImpostato ? (
            <>
              <h3>Docente creato</h3>
              <ul>
                <li>Nome utente: <strong>{esito.username}</strong></li>
                <li>Nominativo: {esito.nome}</li>
                <li>Ruolo: <Badge tono="blu">Docente</Badge></li>
              </ul>
              <p>Comunica nome utente e password al docente di persona: l'app non la mostra né la invia. Potrà cambiarla da "Il mio account".</p>
            </>
          ) : (
            <>
              <h3>Account creato, ma il ruolo non è stato impostato</h3>
              <p>L'account <strong>{esito.username}</strong> esiste come studente: {messaggioErrore(esito.errore)} Impostalo come docente dalla scheda Utenti.</p>
            </>
          )}
        </div>
      )}
      <form onSubmit={invia} noValidate className="form-stretto">
        {errori.form && <p className="errore form-errore" role="alert">{errori.form}</p>}
        <Field label="Nome utente" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} errore={errori.username} nota="Da 3 a 20 caratteri: lettere minuscole, numeri, . _ -" autoComplete="off" autoCapitalize="none" spellCheck={false} />
        <Field label="Nominativo" value={nome} onChange={(e) => setNome(e.target.value)} errore={errori.nome} maxLength={60} autoComplete="off" />
        <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} errore={errori.nuova} nota={`Almeno ${PASSWORD_MIN} caratteri. Va comunicata al docente.`} autoComplete="new-password" />
        <Field label="Ripeti la password" type="password" value={conferma} onChange={(e) => setConferma(e.target.value)} errore={errori.conferma} autoComplete="new-password" />
        <Button type="submit" variante="accento" disabled={occupato}>Crea docente</Button>
      </form>
    </section>
  );
}
