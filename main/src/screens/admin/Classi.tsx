import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/api';
import { messaggioErrore } from '../../lib/errori';
import { data } from '../../lib/formati';
import { Button, DataTable, EmptyState, type Colonna } from '../../ui';
import { DialogoTrasferisci } from './dialoghi';
import type { ClasseAdmin } from './logica';
import './admin.css';

export default function Classi() {
  const classi = useApi<ClasseAdmin[]>('api_admin_classi', {}, { poll: 10000 });
  const [trasferisci, setTrasferisci] = useState<ClasseAdmin | null>(null);

  const colonne: Colonna<ClasseAdmin>[] = [
    { chiave: 'nome', titolo: 'Classe', render: (c) => <strong>{c.nome}</strong> },
    { chiave: 'proprietario', titolo: 'Proprietario', valore: (c) => c.proprietario.username, render: (c) => c.proprietario.username },
    { chiave: 'n_iscritti', titolo: 'Iscritti', allinea: 'destra', valore: (c) => c.n_iscritti, render: (c) => c.n_iscritti },
    { chiave: 'n_online', titolo: 'Online', allinea: 'destra', valore: (c) => c.n_online, render: (c) => c.n_online },
    { chiave: 'created_at', titolo: 'Creata il', valore: (c) => c.created_at, render: (c) => data(c.created_at) },
    {
      chiave: 'azioni', titolo: 'Azioni', azioni: true,
      render: (c) => (
        <div className="azioni-riga" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Link className="btn btn-tenue" to={`/docente/${c.id}`} aria-label={`Apri la classe ${c.nome} come docente`}>Apri come docente</Link>
          <Button variante="tenue" aiuto="trasferisci_classe" aria-label={`Trasferisci la classe ${c.nome}`} onClick={() => setTrasferisci(c)}>Trasferisci a...</Button>
        </div>
      ),
    },
  ];

  return (
    <section aria-label="Classi">
      {classi.isError ? (
        <p className="errore" role="alert">{messaggioErrore(classi.error)}</p>
      ) : classi.isLoading ? (
        <p className="muto">Caricamento...</p>
      ) : (
        <DataTable righe={classi.data ?? []} colonne={colonne} rigaId={(c) => c.id} vuoto={<EmptyState titolo="Nessuna classe" testo="Le classi le creano i docenti." />} />
      )}
      <DialogoTrasferisci classe={trasferisci} onChiudi={() => setTrasferisci(null)} />
    </section>
  );
}
