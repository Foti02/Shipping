import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSessione } from '../context/sessione';
import { useApi, useMutazione } from '../lib/api';
import { messaggioErrore } from '../lib/errori';
import { Badge, Button, Dialog, EmptyState, Field } from '../ui';
import './classe/classe.css';

export interface ClasseDocente {
  id: string;
  nome: string;
  codice_ingresso: string;
  codice_attivo: boolean;
  n_iscritti: number;
  n_online: number;
  created_at: string;
}

export default function Docente() {
  const { profilo, ricarica } = useSessione();
  const nav = useNavigate();
  const docente = profilo?.ruolo_globale === 'docente';
  const classi = useApi<ClasseDocente[]>('api_docente_classi', {}, { poll: 10000, enabled: docente });
  const crea = useMutazione<{ id: string }>('api_classe_crea');
  const [nuova, setNuova] = useState(false);
  const [nome, setNome] = useState('');

  if (!docente)
    return <EmptyState titolo="Area riservata ai docenti" testo="Il ruolo docente si assegna dall'amministratore del database." />;

  const invia = (e: FormEvent) => {
    e.preventDefault();
    crea.mutate(
      { p_nome: nome.trim() },
      {
        onSuccess: async (r) => {
          await ricarica(); // la nuova classe deve comparire nella sessione prima di aprirla
          setNuova(false);
          setNome('');
          nav(`/docente/${(r as { id: string }).id}`);
        },
      },
    );
  };

  return (
    <>
      <div className="intestazione">
        <h1>
          Le mie classi<span className="dot">.</span>
        </h1>
        <Button variante="accento" onClick={() => setNuova(true)}>
          Nuova classe
        </Button>
      </div>

      {classi.isError ? (
        <p className="errore" role="alert">{messaggioErrore(classi.error)}</p>
      ) : classi.isLoading ? (
        <p className="muto">Caricamento...</p>
      ) : !classi.data?.length ? (
        <EmptyState titolo="Nessuna classe" testo="Crea la prima classe: otterrai un codice da dare agli studenti." azione={<Button onClick={() => setNuova(true)}>Nuova classe</Button>} />
      ) : (
        <div className="griglia">
          {classi.data.map((c) => (
            <section className="carta" key={c.id} aria-label={`Classe ${c.nome}`}>
              <h2>{c.nome}</h2>
              <p className="muto">
                Codice <strong>{c.codice_ingresso}</strong> {c.codice_attivo ? <Badge tono="verde">attivo</Badge> : <Badge tono="grigio">disattivato</Badge>}
              </p>
              <div className="kpi" style={{ marginBottom: 16 }}>
                <div><strong>{c.n_iscritti}</strong><span>Iscritti</span></div>
                <div><strong>{c.n_online}</strong><span>Online ora</span></div>
              </div>
              <Link className="btn" to={`/docente/${c.id}`}>
                Apri classe
              </Link>
            </section>
          ))}
        </div>
      )}

      <Dialog aperto={nuova} titolo="Nuova classe" onChiudi={() => setNuova(false)}>
        <form onSubmit={invia}>
          <Field label="Nome della classe" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          <div className="dialog-azioni">
            <Button variante="tenue" onClick={() => setNuova(false)}>
              Annulla
            </Button>
            <Button type="submit" variante="accento" disabled={!nome.trim() || crea.isPending}>
              Crea
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
