import { useState, type FormEvent } from 'react';
import { useMagazzino } from '../../context/magazzino';
import { messaggioErrore } from '../../lib/errori';
import { Button, Dialog, Field, Select, useToast } from '../../ui';
import { ErroreForm, useScrivi } from './comuni';
import { leggiNumero } from './logica';

const TIPI = [
  { value: 'prezzo_perc', label: 'Aumenta o riduci il prezzo di acquisto (%)', min: -100, max: Infinity, aiuto: 'Positivo aumenta, negativo riduce: -10 toglie il 10%.' },
  { value: 'ricarico_perc', label: 'Imposta il ricarico di vendita (%)', min: 0, max: 999.99, aiuto: 'Sostituisce il ricarico di ogni articolo scelto.' },
  { value: 'sconto_perc', label: 'Imposta lo sconto fisso (%)', min: 0, max: 100, aiuto: 'Sostituisce lo sconto di ogni articolo scelto.' },
];

interface Props {
  aperto: boolean;
  ids: string[];
  onChiudi: () => void;
}

export function Variazioni({ aperto, ids, onChiudi }: Props) {
  return (
    <Dialog aperto={aperto} titolo="Variazioni sugli articoli" onChiudi={onChiudi}>
      <Corpo ids={ids} onChiudi={onChiudi} />
    </Dialog>
  );
}

function Corpo({ ids, onChiudi }: Omit<Props, 'aperto'>) {
  const m = useMagazzino();
  const toast = useToast();
  const [tipo, setTipo] = useState(TIPI[0].value);
  const [valore, setValore] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [errCampo, setErrCampo] = useState<string | undefined>();
  const variazione = useScrivi<{ aggiornati: number }>('api_articoli_variazione');
  const t = TIPI.find((x) => x.value === tipo)!;

  const invia = (e: FormEvent) => {
    e.preventDefault();
    const n = leggiNumero(valore);
    if (n === null || Number.isNaN(n) || n < t.min || n > t.max) {
      setErrCampo(`Inserisci un numero ${t.max === Infinity ? `da ${t.min} in su` : `tra ${t.min} e ${t.max}`}.`);
      return;
    }
    setErrCampo(undefined);
    variazione.mutate({ p_magazzino: m.id, p_ids: ids, p_tipo: tipo, p_valore: n }, {
      onSuccess: (r) => {
        toast(`Articoli aggiornati: ${r.aggiornati}.`, 'ok');
        onChiudi();
      },
      onError: (err) => setErrore(messaggioErrore(err)),
    });
  };

  return (
    <form onSubmit={invia} noValidate>
      <p>
        Applico la variazione a <strong>{ids.length}</strong> {ids.length === 1 ? 'articolo selezionato' : 'articoli selezionati'}.
      </p>
      <ErroreForm testo={errore} />
      <Select label="Cosa vuoi cambiare" value={tipo} onChange={(e) => setTipo(e.target.value)} opzioni={TIPI} />
      <Field label="Valore (%)" value={valore} onChange={(e) => setValore(e.target.value)} errore={errCampo} aiuto={t.aiuto} inputMode="decimal" />
      <div className="dialog-azioni">
        <Button variante="tenue" onClick={onChiudi}>
          Annulla
        </Button>
        <Button type="submit" variante="accento" disabled={variazione.isPending}>
          Applica
        </Button>
      </div>
    </form>
  );
}
