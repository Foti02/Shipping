import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { backend } from '../../backend';
import { CampiNominativo, useNominativo } from '../../components/CampiNominativo';
import { PASSWORD_MIN, haErrori, validaPassword } from '../../lib/account';
import { messaggioErrore } from '../../lib/errori';
import { Badge, Button, Field } from '../../ui';
import './admin.css';

interface Esito { username: string; nome: string; ruoloImpostato: boolean; errore?: unknown }

/** Crea un account e lo promuove a docente. La sessione dell'admin non cambia. */
export default function NuovoDocente() {
  const qc = useQueryClient();
  const v = useNominativo();
  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [errori, setErrori] = useState<{ nuova?: string; conferma?: string; form?: string }>({});
  const [occupato, setOccupato] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(null);

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    const { nuova, conferma: c } = validaPassword(password, conferma);
    const err = { nuova, conferma: c };
    setErrori(err);
    if (!v.controlla() || haErrori(err)) return;
    const username = v.username;
    const nome = v.nominativo();
    setOccupato(true);
    let creato: { userId: string } | null = null;
    try {
      creato = await backend.auth.creaUtente(username, password, nome);
      await backend.rpc('api_admin_imposta_ruolo', { p_user: creato.userId, p_ruolo: 'docente' });
      setEsito({ username, nome, ruoloImpostato: true });
      v.azzera(); setPassword(''); setConferma('');
    } catch (x) {
      // account creato ma ruolo non impostato: l'admin lo vede e puo' correggerlo da "Utenti"
      if (creato) setEsito({ username, nome, ruoloImpostato: false, errore: x });
      else if (x instanceof Error && x.message === 'gia_esiste') v.setErrori({ username: 'Questo nome account è già in uso: aggiungi un numero (mario_rossi2).' });
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
        <CampiNominativo v={v} />
        <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} errore={errori.nuova} nota={`Almeno ${PASSWORD_MIN} caratteri. Va comunicata al docente.`} autoComplete="new-password" />
        <Field label="Ripeti la password" type="password" value={conferma} onChange={(e) => setConferma(e.target.value)} errore={errori.conferma} autoComplete="new-password" />
        <Button type="submit" variante="accento" disabled={occupato}>Crea docente</Button>
      </form>
    </section>
  );
}
