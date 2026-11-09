import { useState } from 'react';
import { ElencoArticoli } from './articoli/ElencoArticoli';
import { Ubicazioni } from './articoli/Ubicazioni';
import { Tabs } from '../ui';

const SCHEDE = [
  { id: 'sc-articoli', etichetta: 'Articoli' },
  { id: 'sc-ubicazioni', etichetta: 'Ubicazioni' },
];

export default function Articoli() {
  const [scheda, setScheda] = useState('sc-articoli');
  return (
    <>
      <h1 className="no-stampa">
        Articoli<span className="dot">.</span>
      </h1>
      <div className="no-stampa">
        <Tabs voci={SCHEDE} attiva={scheda} onCambia={setScheda} />
      </div>
      <div role="tabpanel" aria-labelledby={`tab-${scheda}`}>
        {scheda === 'sc-articoli' ? <ElencoArticoli /> : <Ubicazioni />}
      </div>
    </>
  );
}
