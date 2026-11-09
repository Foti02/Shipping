import { useState } from 'react';
import { applicaTema, leggiTema, prossimoTema, salvaTema, type Tema } from '../lib/tema';
import { Icona, type NomeIcona } from '../ui/icone';

const STATI: Record<Tema, { nome: string; icona: NomeIcona }> = {
  auto: { nome: 'automatico', icona: 'schermo' },
  light: { nome: 'chiaro', icona: 'sole' },
  dark: { nome: 'scuro', icona: 'luna' },
};

/** Un pulsante, tre stati: automatico (segue il sistema), chiaro, scuro. */
export function InterruttoreTema() {
  const [tema, setTema] = useState(leggiTema);
  const cambia = () => {
    const n = prossimoTema(tema);
    salvaTema(n);
    applicaTema(n);
    setTema(n);
  };
  const { nome, icona } = STATI[tema];
  return (
    <button type="button" className="top-icona" onClick={cambia} aria-label={`Tema ${nome}, premi per cambiare`} title={`Tema: ${nome}`}>
      <Icona nome={icona} dimensione={20} />
    </button>
  );
}
