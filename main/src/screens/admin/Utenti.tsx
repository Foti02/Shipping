import { useEffect, useState } from 'react';
import { useSessione } from '../../context/sessione';
import { useApi } from '../../lib/api';
import { messaggioErrore } from '../../lib/errori';
import { data, dataOra } from '../../lib/formati';
import { Badge, Button, DataTable, EmptyState, Field, Select, type Colonna, type Tono } from '../../ui';
import { ETICHETTE, DialogoElimina, DialogoPassword, DialogoRuolo, type RuoloScelto } from './dialoghi';
import { cercaPulita, type UtenteAdmin } from './logica';
import { tempoRelativo } from '../classe/logica';
import './admin.css';

export const TONO_RUOLO: Record<RuoloScelto, Tono> = { studente: 'grigio', docente: 'blu', admin: 'rosso' };
const FILTRO = [{ value: '', label: 'Tutti i ruoli' }, ...(['studente', 'docente', 'admin'] as const).map((r) => ({ value: r, label: ETICHETTE[r] }))];

function useRitardato<T>(valore: T, ms = 250): T {
  const [v, setV] = useState(valore);
  useEffect(() => {
    const t = setTimeout(() => setV(valore), ms);
    return () => clearTimeout(t);
  }, [valore, ms]);
  return v;
}

const fermaClic = { onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(), onKeyDown: (e: { stopPropagation: () => void }) => e.stopPropagation() };

export default function Utenti() {
  const { profilo } = useSessione();
  const [cerca, setCerca] = useState('');
  const [ruolo, setRuolo] = useState('');
  const q = useRitardato(cercaPulita(cerca));
  const utenti = useApi<UtenteAdmin[]>('api_admin_utenti', { p_cerca: q || null, p_ruolo: ruolo || null });
  const [cambio, setCambio] = useState<{ utente: UtenteAdmin; ruolo: RuoloScelto } | null>(null);
  const [password, setPassword] = useState<UtenteAdmin | null>(null);
  const [elimina, setElimina] = useState<UtenteAdmin | null>(null);

  const colonne: Colonna<UtenteAdmin>[] = [
    { chiave: 'username', titolo: 'Utente', render: (u) => <><strong>{u.username}</strong>{u.user_id === profilo?.user_id && <> <Badge tono="verde">tu</Badge></>}<br /><span className="muto">{u.nome || '-'}</span></> },
    {
      chiave: 'ruolo_globale', titolo: 'Ruolo', aiuto: 'ruolo_globale',
      render: (u) => (
        <span className="cella-ruolo" {...fermaClic}>
          <Badge tono={TONO_RUOLO[u.ruolo_globale]}>{ETICHETTE[u.ruolo_globale]}</Badge>
          <select className="sel-tab" aria-label={`Cambia ruolo di ${u.username}`} value={u.ruolo_globale} onChange={(e) => setCambio({ utente: u, ruolo: e.target.value as RuoloScelto })}>
            {(['studente', 'docente', 'admin'] as const).map((r) => <option key={r} value={r}>{ETICHETTE[r]}</option>)}
          </select>
        </span>
      ),
    },
    { chiave: 'n_classi_possedute', titolo: 'Classi', valore: (u) => u.n_classi_possedute, render: (u) => <>{u.n_classi_possedute} proprie<br /><span className="muto">{u.n_classi_iscritto} come studente</span></> },
    { chiave: 'creato_il', titolo: 'Creato il', valore: (u) => u.creato_il, render: (u) => data(u.creato_il) },
    {
      chiave: 'ultimo_accesso', titolo: 'Ultimo accesso', valore: (u) => u.ultimo_accesso,
      render: (u) => (u.ultimo_accesso ? <span title={dataOra(u.ultimo_accesso)}>{tempoRelativo(u.ultimo_accesso)}</span> : <span className="muto">mai</span>),
    },
    {
      chiave: 'azioni', titolo: 'Azioni', azioni: true,
      render: (u) => (
        <div className="azioni-riga" {...fermaClic}>
          <Button variante="tenue" aiuto="reimposta_password" aria-label={`Reimposta la password di ${u.username}`} onClick={() => setPassword(u)}>Reimposta password</Button>
          <Button variante="pericolo" aiuto="elimina_utente" aria-label={`Elimina ${u.username}`} disabled={u.user_id === profilo?.user_id} title={u.user_id === profilo?.user_id ? 'Il tuo account si elimina da "Il mio account"' : undefined} onClick={() => setElimina(u)}>Elimina</Button>
        </div>
      ),
    },
  ];

  return (
    <section aria-label="Utenti">
      <div className="filtri" style={{ marginBottom: 16 }}>
        <Field label="Cerca" type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Nome utente o nominativo" maxLength={100} autoComplete="off" />
        <Select label="Ruolo" value={ruolo} onChange={(e) => setRuolo(e.target.value)} opzioni={FILTRO} />
      </div>
      {utenti.isError ? (
        <p className="errore" role="alert">{messaggioErrore(utenti.error)}</p>
      ) : utenti.isLoading ? (
        <p className="muto">Caricamento...</p>
      ) : (
        <>
          <p className="spiegazione">{utenti.data?.length ?? 0} utenti{utenti.data && utenti.data.length >= 200 ? ' (i primi 200: restringi la ricerca)' : ''}.</p>
          <DataTable righe={utenti.data ?? []} colonne={colonne} rigaId={(u) => u.user_id} vuoto={<EmptyState titolo="Nessun utente trovato" testo="Cambia la ricerca o il filtro del ruolo." />} />
        </>
      )}

      <DialogoRuolo utente={cambio?.utente ?? null} ruolo={cambio?.ruolo ?? 'studente'} onChiudi={() => setCambio(null)} />
      <DialogoPassword utente={password} onChiudi={() => setPassword(null)} />
      <DialogoElimina
        aperto={!!elimina}
        onChiudi={() => setElimina(null)}
        titolo="Elimina utente"
        spiegazione={<p>Stai per cancellare l'account <strong>@{elimina?.username}</strong>, il suo magazzino personale e tutti i suoi dati. Non è possibile se possiede classi o se è l'ultimo amministratore.</p>}
        username={elimina?.username ?? ''}
        etichetta="Elimina utente"
        funzione="api_admin_elimina_utente"
        args={{ p_user: elimina?.user_id }}
        onFatto={() => setElimina(null)}
      />
    </section>
  );
}
