import { useMemo, useState } from 'react';
import { useMagazzino } from '../context/magazzino';
import { messaggioErrore } from '../lib/errori';
import { EmptyState, Select } from '../ui';
import { RegistroLista, useRegistro } from './classe/componenti';
import { etichettaAzione } from './classe/logica';
import './classe/classe.css';

export default function Attivita() {
  const m = useMagazzino();
  const { righe, errore, caricamento } = useRegistro(m.id, 200);
  const [utente, setUtente] = useState('');
  const [azione, setAzione] = useState('');

  const utenti = useMemo(() => [...new Set(righe.map((r) => r.username).filter((x): x is string => !!x))].sort(), [righe]);
  const azioni = useMemo(() => [...new Set(righe.map((r) => r.azione))].sort((a, b) => etichettaAzione(a).localeCompare(etichettaAzione(b), 'it')), [righe]);
  const filtrate = righe.filter((r) => (!utente || r.username === utente) && (!azione || r.azione === azione));

  return (
    <>
      <h1>
        Attività<span className="dot">.</span>
      </h1>
      <p className="muto">Cosa succede nel magazzino, da chiunque. Si aggiorna ogni 5 secondi.</p>
      {errore ? (
        <p className="errore" role="alert">{messaggioErrore(errore)}</p>
      ) : caricamento ? (
        <p className="muto">Caricamento...</p>
      ) : righe.length === 0 ? (
        <EmptyState titolo="Ancora nessuna attività" testo="Quando qualcuno salva o conferma qualcosa, lo trovi qui." />
      ) : (
        <>
          <div className="pannello filtri">
            <Select label="Utente" opzioni={[{ value: '', label: 'Tutti' }, ...utenti.map((u) => ({ value: u, label: u }))]} value={utente} onChange={(e) => setUtente(e.target.value)} />
            <Select label="Azione" opzioni={[{ value: '', label: 'Tutte' }, ...azioni.map((a) => ({ value: a, label: etichettaAzione(a) }))]} value={azione} onChange={(e) => setAzione(e.target.value)} />
          </div>
          {filtrate.length ? <RegistroLista righe={filtrate} /> : <p className="muto">Nessuna attività con questi filtri.</p>}
        </>
      )}
    </>
  );
}
