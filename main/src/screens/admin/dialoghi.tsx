import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useApi, useMutazione } from '../../lib/api';
import { PASSWORD_MIN, confermaScritta, haErrori, validaPassword } from '../../lib/account';
import { messaggioErrore } from '../../lib/errori';
import { Button, Dialog, Field, Select } from '../../ui';
import './admin.css';

// I toast stanno sotto i dialoghi modali: l'esito di errore si mostra dentro il dialogo.
export const ErroreForm = ({ errore }: { errore: unknown }) =>
  errore ? <p className="errore form-errore" role="alert">{messaggioErrore(errore)}</p> : null;

/** <dialog>.showModal() porta il focus sul pulsante Chiudi: dopo, lo riportiamo sul primo campo del modulo. */
function useFocusPrimoCampo() {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.querySelector('input')?.focus(), 0);
    return () => clearTimeout(t);
  }, []);
  return ref;
}

interface ElimDati { titolo: string; spiegazione: ReactNode; username: string; etichetta: string; funzione: string; args: Record<string, unknown>; onFatto: () => void }

/** Conferma scritta dello username prima di un'eliminazione definitiva (account proprio o di un altro utente). */
function FormElimina({ titolo, spiegazione, username, etichetta, funzione, args, onFatto, onChiudi }: ElimDati & { onChiudi: () => void }) {
  const elimina = useMutazione(funzione);
  const [conferma, setConferma] = useState('');
  const ok = confermaScritta(conferma, username);
  const formRef = useFocusPrimoCampo();
  const invia = (e: FormEvent) => {
    e.preventDefault();
    if (ok) elimina.mutate({ ...args, p_conferma: conferma.trim() }, { onSuccess: onFatto });
  };
  return (
    <form ref={formRef} onSubmit={invia} aria-label={titolo}>
      {spiegazione}
      <p><strong>Non si può annullare.</strong></p>
      <Field label={`Per confermare scrivi lo username: ${username}`} value={conferma} onChange={(e) => setConferma(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus />
      <ErroreForm errore={elimina.error} />
      <div className="dialog-azioni">
        <Button variante="tenue" onClick={onChiudi}>Annulla</Button>
        <Button type="submit" variante="pericolo" disabled={!ok || elimina.isPending}>{etichetta}</Button>
      </div>
    </form>
  );
}

export function DialogoElimina({ aperto, onChiudi, ...d }: ElimDati & { aperto: boolean; onChiudi: () => void }) {
  return (
    <Dialog aperto={aperto} titolo={d.titolo} onChiudi={onChiudi}>
      <FormElimina {...d} onChiudi={onChiudi} />
    </Dialog>
  );
}

export type RuoloScelto = 'studente' | 'docente' | 'admin';
export const ETICHETTE: Record<RuoloScelto, string> = { studente: 'Studente', docente: 'Docente', admin: 'Amministratore' };

/** Cambio di ruolo con conferma esplicita: dice che cosa cambia per l'utente. */
export function DialogoRuolo({ utente, ruolo, onChiudi }: { utente: { user_id: string; username: string; ruolo_globale: RuoloScelto } | null; ruolo: RuoloScelto; onChiudi: () => void }) {
  return (
    <Dialog aperto={!!utente} titolo="Cambia ruolo" onChiudi={onChiudi}>
      {utente && <FormRuolo utente={utente} ruolo={ruolo} onChiudi={onChiudi} />}
    </Dialog>
  );
}

const EFFETTO: Record<RuoloScelto, string> = {
  studente: 'Perde l\'area docente e l\'amministrazione. Le classi di cui è proprietario vanno trasferite prima.',
  docente: 'Può creare classi e gestire le proprie. Perde l\'amministrazione, se l\'aveva.',
  admin: 'Potrà fare tutto ciò che fa un docente su qualsiasi classe, gestire gli account di tutti e cambiare i ruoli.',
};

function FormRuolo({ utente, ruolo, onChiudi }: { utente: { user_id: string; username: string; ruolo_globale: RuoloScelto }; ruolo: RuoloScelto; onChiudi: () => void }) {
  const imposta = useMutazione('api_admin_imposta_ruolo', { ok: 'Ruolo aggiornato' });
  return (
    <>
      <p>
        <strong>{utente.username}</strong> passa da {ETICHETTE[utente.ruolo_globale].toLowerCase()} a <strong>{ETICHETTE[ruolo].toLowerCase()}</strong>.
      </p>
      <p className="muto">{EFFETTO[ruolo]}</p>
      <ErroreForm errore={imposta.error} />
      <div className="dialog-azioni">
        <Button variante="tenue" onClick={onChiudi}>Annulla</Button>
        <Button variante={ruolo === 'studente' ? 'pericolo' : 'accento'} disabled={imposta.isPending} onClick={() => imposta.mutate({ p_user: utente.user_id, p_ruolo: ruolo }, { onSuccess: onChiudi })}>
          Conferma il cambio
        </Button>
      </div>
    </>
  );
}

export function DialogoPassword({ utente, onChiudi }: { utente: { user_id: string; username: string } | null; onChiudi: () => void }) {
  return (
    <Dialog aperto={!!utente} titolo="Reimposta password" onChiudi={onChiudi}>
      {utente && <FormPassword utente={utente} onChiudi={onChiudi} />}
    </Dialog>
  );
}

function FormPassword({ utente, onChiudi }: { utente: { user_id: string; username: string }; onChiudi: () => void }) {
  const reimposta = useMutazione('api_admin_reimposta_password');
  const [nuova, setNuova] = useState('');
  const [conferma, setConferma] = useState('');
  const [errori, setErrori] = useState<{ nuova?: string; conferma?: string }>({});
  const [fatto, setFatto] = useState(false);
  const formRef = useFocusPrimoCampo();
  const invia = (e: FormEvent) => {
    e.preventDefault();
    const err = validaPassword(nuova, conferma);
    setErrori(err);
    if (!haErrori(err)) reimposta.mutate({ p_user: utente.user_id, p_password: nuova }, { onSuccess: () => setFatto(true) });
  };
  if (fatto)
    return (
      <>
        <div className="avviso ok-box" role="status">
          <h3>Password reimpostata</h3>
          <p>La password di <strong>{utente.username}</strong> è cambiata. Comunicagliela di persona: l'app non la mostrerà più e non la invia a nessuno.</p>
        </div>
        <div className="dialog-azioni"><Button variante="accento" onClick={onChiudi}>Chiudi</Button></div>
      </>
    );
  return (
    <form ref={formRef} onSubmit={invia} noValidate>
      <p>Scegli una nuova password per <strong>{utente.username}</strong>. <strong>Va comunicata all'utente</strong>: lui potrà poi cambiarla dal suo account.</p>
      <Field label="Nuova password" type="password" value={nuova} onChange={(e) => setNuova(e.target.value)} errore={errori.nuova} nota={`Almeno ${PASSWORD_MIN} caratteri.`} autoComplete="new-password" autoFocus />
      <Field label="Ripeti la nuova password" type="password" value={conferma} onChange={(e) => setConferma(e.target.value)} errore={errori.conferma} autoComplete="new-password" />
      <ErroreForm errore={reimposta.error} />
      <div className="dialog-azioni">
        <Button variante="tenue" onClick={onChiudi}>Annulla</Button>
        <Button type="submit" variante="accento" disabled={reimposta.isPending}>Reimposta password</Button>
      </div>
    </form>
  );
}

interface Candidato { user_id: string; username: string; nome: string; ruolo_globale: RuoloScelto }

export function DialogoTrasferisci({ classe, onChiudi }: { classe: { id: string; nome: string; proprietario: { user_id: string; username: string } } | null; onChiudi: () => void }) {
  return (
    <Dialog aperto={!!classe} titolo="Trasferisci la classe" onChiudi={onChiudi}>
      {classe && <FormTrasferisci classe={classe} onChiudi={onChiudi} />}
    </Dialog>
  );
}

function FormTrasferisci({ classe, onChiudi }: { classe: { id: string; nome: string; proprietario: { user_id: string; username: string } }; onChiudi: () => void }) {
  const trasferisci = useMutazione('api_admin_classe_trasferisci', { ok: 'Classe trasferita' });
  const d = useApi<Candidato[]>('api_admin_utenti', { p_ruolo: 'docente' });
  const ad = useApi<Candidato[]>('api_admin_utenti', { p_ruolo: 'admin' });
  const [scelto, setScelto] = useState('');
  const docenti = d.data && ad.data ? [...d.data, ...ad.data].sort((x, y) => x.username.localeCompare(y.username)) : null;
  const opzioni = [{ value: '', label: 'Scegli un docente...' }, ...(docenti ?? []).filter((d) => d.user_id !== classe.proprietario.user_id).map((d) => ({ value: d.user_id, label: `${d.username}${d.nome ? ` (${d.nome})` : ''}${d.ruolo_globale === 'admin' ? ' - amministratore' : ''}` }))];
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (scelto) trasferisci.mutate({ p_magazzino: classe.id, p_nuovo_proprietario: scelto }, { onSuccess: onChiudi }); }}>
      <p>La classe <strong>{classe.nome}</strong> è di <strong>{classe.proprietario.username}</strong>. Scegli chi ne diventa il proprietario: iscritti, dati e compiti restano dove sono, il proprietario precedente resta nella classe.</p>
      <Select label="Nuovo proprietario" aiuto="trasferisci_classe" value={scelto} onChange={(e) => setScelto(e.target.value)} opzioni={opzioni} disabled={!docenti} />
      <ErroreForm errore={d.error ?? ad.error ?? trasferisci.error} />
      <div className="dialog-azioni">
        <Button variante="tenue" onClick={onChiudi}>Annulla</Button>
        <Button type="submit" variante="accento" disabled={!scelto || trasferisci.isPending}>Trasferisci</Button>
      </div>
    </form>
  );
}
