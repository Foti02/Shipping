import { useState } from 'react';
import { useSessione } from '../context/sessione';
import { eAdminGlobale } from '../lib/permessi';
import { EmptyState, Tabs } from '../ui';
import Classi from './admin/Classi';
import NuovoDocente from './admin/NuovoDocente';
import Panoramica from './admin/Panoramica';
import Registro from './admin/Registro';
import Utenti from './admin/Utenti';
import './admin/admin.css';

const SCHEDE = [
  { id: 'panoramica', etichetta: 'Panoramica' },
  { id: 'utenti', etichetta: 'Utenti' },
  { id: 'nuovo', etichetta: 'Nuovo docente' },
  { id: 'classi', etichetta: 'Classi' },
  { id: 'registro', etichetta: 'Registro' },
];

const CONTENUTO: Record<string, () => React.ReactNode> = {
  panoramica: () => <Panoramica />,
  utenti: () => <Utenti />,
  nuovo: () => <NuovoDocente />,
  classi: () => <Classi />,
  registro: () => <Registro />,
};

/** "Amministrazione": utenti, classi, registro. Solo ruolo admin (il database lo controlla comunque a ogni chiamata). */
export default function Admin() {
  const { profilo } = useSessione();
  const [scheda, setScheda] = useState('panoramica');
  if (!eAdminGlobale(profilo?.ruolo_globale))
    return <EmptyState titolo="Area riservata agli amministratori" testo="Questa pagina è visibile solo a chi ha il ruolo di amministratore." />;
  return (
    <>
      <div className="intestazione">
        <h1>Amministrazione</h1>
      </div>
      <Tabs voci={SCHEDE} attiva={scheda} onCambia={setScheda} />
      <div className="scheda-admin" role="tabpanel" aria-labelledby={`tab-${scheda}`}>
        {CONTENUTO[scheda]()}
      </div>
    </>
  );
}
