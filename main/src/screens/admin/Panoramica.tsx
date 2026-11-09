import type { ReactNode } from 'react';
import { useApi } from '../../lib/api';
import { messaggioErrore } from '../../lib/errori';
import { Termine } from '../../ui/Suggerimento';
import type { Statistiche } from './logica';
import '../classe/classe.css';
import './admin.css';

export default function Panoramica() {
  const s = useApi<Statistiche>('api_admin_statistiche', {}, { poll: 10000 });
  if (s.isError) return <p className="errore" role="alert">{messaggioErrore(s.error)}</p>;
  if (!s.data) return <p className="muto">Caricamento...</p>;
  const d = s.data;
  const carte: { chiave: string; etichetta: ReactNode; valore: number }[] = [
    { chiave: 'studenti', etichetta: 'Studenti', valore: d.utenti.studenti },
    { chiave: 'docenti', etichetta: 'Docenti', valore: d.utenti.docenti },
    { chiave: 'admin', etichetta: 'Amministratori', valore: d.utenti.admin },
    { chiave: 'classi', etichetta: 'Classi', valore: d.classi },
    { chiave: 'personali', etichetta: 'Magazzini personali', valore: d.magazzini_personali },
    { chiave: 'online', etichetta: <Termine aiuto="online_ora">Online ora</Termine>, valore: d.online_ora },
  ];
  return (
    <section aria-label="Panoramica">
      <div className="kpi largo">
        {carte.map((c) => (
          <div key={c.chiave}><strong>{c.valore}</strong><span>{c.etichetta}</span></div>
        ))}
      </div>
      <p className="spiegazione">Si aggiorna da solo ogni 10 secondi.</p>
    </section>
  );
}
