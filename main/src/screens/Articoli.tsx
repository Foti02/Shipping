import { useSearchParams } from 'react-router-dom';
import { ElencoArticoli } from './articoli/ElencoArticoli';
import { Ubicazioni } from './articoli/Ubicazioni';
import { Tabs } from '../ui';

const SCHEDE = [
  { id: 'sc-articoli', etichetta: 'Articoli' },
  { id: 'sc-ubicazioni', etichetta: 'Ubicazioni' },
];

export default function Articoli() {
  // La sezione sta nell'indirizzo (?sezione=ubicazioni): la voce della barra laterale e le schede mostrano la stessa cosa.
  const [params, setParams] = useSearchParams();
  const scheda = params.get('sezione') === 'ubicazioni' ? 'sc-ubicazioni' : 'sc-articoli';
  const setScheda = (id: string) => setParams(id === 'sc-ubicazioni' ? { sezione: 'ubicazioni' } : {});
  return (
    <>
      <h1 className="no-stampa">
        {scheda === 'sc-ubicazioni' ? 'Ubicazioni' : 'Articoli'}
      </h1>
      <div className="no-stampa solo-piccolo">
        <Tabs voci={SCHEDE} attiva={scheda} onCambia={setScheda} />
      </div>
      <div role="tabpanel" aria-labelledby={`tab-${scheda}`}>
        {scheda === 'sc-articoli' ? <ElencoArticoli /> : <Ubicazioni />}
      </div>
    </>
  );
}
