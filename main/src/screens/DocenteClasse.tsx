import { Link, useParams } from 'react-router-dom';
import { useSessione } from '../context/sessione';
import { useApi } from '../lib/api';
import { dataOra } from '../lib/formati';
import { messaggioErrore } from '../lib/errori';
import { Badge, DataTable, EmptyState, type Colonna } from '../ui';
import type { ClasseDocente } from './Docente';
import { Barra, Pallino, RegistroLista, useAdesso, useRegistro } from './classe/componenti';
import { etichettaAzione, etichettaPagina, tempoRelativo } from './classe/logica';
import Scenari from './classe/Scenari';
import './classe/classe.css';

export interface UtenteDocente {
  user_id: string;
  username: string;
  nome: string;
  ruolo_aziendale: string | null;
  online: boolean;
  pagina: string | null;
  magazzino_usato: null | { tipo: 'classe'; id: string; nome: string } | { tipo: 'personale' };
  ultima_azione: string | null;
  ultima_azione_il: string | null;
  compiti: { totale: number; completati: number; errori: number; bloccati: number };
}

export default function DocenteClasse() {
  const { id = '' } = useParams();
  const { profilo } = useSessione();
  const docente = profilo?.ruolo_globale === 'docente';
  const adesso = useAdesso();
  // Aggiornamento automatico ogni 5 secondi.
  const utenti = useApi<UtenteDocente[]>('api_docente_utenti', { p_magazzino: id }, { poll: 5000, enabled: docente });
  const classi = useApi<ClasseDocente[]>('api_docente_classi', {}, { poll: 15000, enabled: docente });
  const registro = useRegistro(id, 200);

  if (!docente) return <EmptyState titolo="Area riservata ai docenti" />;
  const classe = classi.data?.find((c) => c.id === id);

  const colonne: Colonna<UtenteDocente>[] = [
    { chiave: 'username', titolo: 'Utente', render: (u) => <><strong>{u.username}</strong><br /><span className="muto">{u.nome}</span></> },
    { chiave: 'ruolo_aziendale', titolo: 'Ruolo', render: (u) => (u.ruolo_aziendale ? <Badge tono="blu">{u.ruolo_aziendale}</Badge> : <span className="muto">jolly</span>) },
    { chiave: 'online', titolo: 'Presenza', valore: (u) => (u.online ? 1 : 0), render: (u) => <Pallino online={u.online} /> },
    {
      chiave: 'pagina', titolo: 'Pagina',
      render: (u) => etichettaPagina(u.pagina) || <span className="muto">-</span>,
    },
    {
      chiave: 'magazzino_usato', titolo: 'Magazzino',
      valore: (u) => (u.magazzino_usato?.tipo === 'classe' ? u.magazzino_usato.nome : u.magazzino_usato ? 'Magazzino personale' : ''),
      // Del magazzino personale si sa solo che e' in uso: mai il contenuto.
      render: (u) => (u.magazzino_usato?.tipo === 'classe' ? u.magazzino_usato.nome : u.magazzino_usato ? 'Magazzino personale' : <span className="muto">-</span>),
    },
    {
      chiave: 'ultima_azione_il', titolo: 'Ultima azione', valore: (u) => u.ultima_azione_il,
      render: (u) =>
        u.ultima_azione ? (
          <>
            {etichettaAzione(u.ultima_azione)}<br />
            <span className="muto" title={dataOra(u.ultima_azione_il)}>{tempoRelativo(u.ultima_azione_il, adesso)}</span>
          </>
        ) : (
          <span className="muto">nessuna</span>
        ),
    },
    {
      chiave: 'compiti', titolo: 'Compiti', valore: (u) => u.compiti.completati / Math.max(1, u.compiti.totale),
      render: (u) => (
        <div className="avanzamento">
          <Barra valore={u.compiti.completati} totale={u.compiti.totale} etichetta={`Compiti di ${u.username}`} />
          <small>
            {u.compiti.completati}/{u.compiti.totale} completati
            {u.compiti.errori > 0 && <> · <Badge tono="rosso">{u.compiti.errori} errori</Badge></>}
            {u.compiti.bloccati > 0 && <> · <Badge tono="giallo">{u.compiti.bloccati} bloccati</Badge></>}
          </small>
        </div>
      ),
    },
  ];

  const online = utenti.data?.filter((u) => u.online).length ?? 0;
  return (
    <>
      <div className="intestazione">
        <h1>
          {classe?.nome ?? 'Classe'}<span className="dot">.</span>
        </h1>
        <div className="righe-bottoni">
          <Link className="btn btn-tenue" to="/docente">Tutte le classi</Link>
          <Link className="btn btn-tenue" to={`/m/${id}/classe`}>Codice, membri e impostazioni</Link>
          <Link className="btn btn-tenue" to={`/m/${id}`}>Apri il magazzino</Link>
        </div>
      </div>

      <section className="sezione" aria-labelledby="h-utenti" style={{ marginTop: 0 }}>
        <h2 id="h-utenti">Studenti <small className="muto">({online} online di {utenti.data?.length ?? 0}, si aggiorna ogni 5 secondi)</small></h2>
        {utenti.isError ? (
          <p className="errore" role="alert">{messaggioErrore(utenti.error)}</p>
        ) : utenti.isLoading ? (
          <p className="muto">Caricamento...</p>
        ) : (
          <DataTable
            righe={utenti.data ?? []}
            colonne={colonne}
            rigaId={(u) => u.user_id}
            vuoto={<EmptyState titolo="Nessuno studente" testo={classe ? `Dai agli studenti il codice ${classe.codice_ingresso}.` : 'Gli studenti entrano con il codice della classe.'} />}
          />
        )}
      </section>

      <Scenari magazzino={id} utenti={utenti.data ?? []} registro={registro.righe} />

      <section className="sezione" aria-labelledby="h-registro">
        <h2 id="h-registro">Registro attività in tempo reale</h2>
        {registro.errore ? <p className="errore" role="alert">{messaggioErrore(registro.errore)}</p> : <RegistroLista righe={registro.righe} />}
      </section>
    </>
  );
}
