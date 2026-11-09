import { useState } from 'react';
import { useApi, useMutazione } from '../../lib/api';
import { messaggioErrore } from '../../lib/errori';
import { Button, Dialog, Field } from '../../ui';
import { avvisi } from './logica';

const CAMPI = [
  'ragione_sociale', 'indirizzo', 'comune', 'nazione', 'fax', 'cod_fisc', 'p_iva', 'telefono', 'cellulare', 'email', 'sito_web',
  'capitale_sociale', 'altro',
] as const;
type Chiave = (typeof CAMPI)[number];
type Azienda = Record<Chiave, string | null>;

interface Props {
  aperto: boolean;
  magazzino: string;
  /** Senza `anagrafiche.scrivi` i campi sono in sola lettura. */
  puoScrivere: boolean;
  onChiudi: () => void;
}

export function DialogoAzienda({ aperto, ...p }: Props) {
  return (
    <Dialog aperto={aperto} titolo="Dati azienda" onChiudi={p.onChiudi}>
      <Caricamento {...p} />
    </Dialog>
  );
}

function Caricamento(p: Omit<Props, 'aperto'>) {
  const q = useApi<Azienda>('api_azienda_leggi', { p_magazzino: p.magazzino });
  if (q.isError) return <p className="form-errore">{messaggioErrore(q.error)}</p>;
  if (!q.data) return <p className="muto">Caricamento...</p>;
  return <FormAzienda {...p} iniziale={q.data} />;
}

function FormAzienda({ magazzino, puoScrivere, onChiudi, iniziale }: Omit<Props, 'aperto'> & { iniziale: Azienda }) {
  const [m, setM] = useState<Record<Chiave, string>>(() => Object.fromEntries(CAMPI.map((k) => [k, iniziale[k] ?? ''])) as Record<Chiave, string>);
  const [provato, setProvato] = useState(false);
  const salva = useMutazione('api_azienda_salva', { ok: 'Dati azienda salvati' });
  const av = avvisi(m);
  const campo = (k: Chiave, label: string, extra: { type?: string; errore?: string } = {}) => (
    <Field label={label} value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} {...extra} />
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setProvato(true);
        if (!m.ragione_sociale.trim()) return;
        const dati = Object.fromEntries(CAMPI.map((k) => [k, m[k].trim() === '' ? null : m[k].trim()]));
        dati.ragione_sociale = m.ragione_sociale.trim();
        salva.mutate({ p_magazzino: magazzino, p_dati: dati }, { onSuccess: onChiudi });
      }}
    >
      <fieldset disabled={!puoScrivere} className="senza-cornice">
        <div className="form-griglia">
          {campo('ragione_sociale', 'Ragione sociale *', { errore: provato && !m.ragione_sociale.trim() ? 'La ragione sociale è obbligatoria.' : undefined })}
          {campo('indirizzo', 'Indirizzo')}
          {campo('comune', 'Comune')}
          {campo('nazione', 'Nazione')}
          {campo('fax', 'Fax')}
          {campo('cod_fisc', 'Codice fiscale', { errore: av.cod_fisc })}
          {campo('p_iva', 'Partita IVA', { errore: av.p_iva })}
          {campo('telefono', 'Telefono', { type: 'tel' })}
          {campo('cellulare', 'Cellulare', { type: 'tel' })}
          {campo('email', 'E-mail', { errore: av.email })}
          {campo('sito_web', 'Sito web')}
          {campo('capitale_sociale', 'Capitale sociale')}
        </div>
        {campo('altro', 'Altro')}
      </fieldset>
      {!puoScrivere && <p className="muto">Il tuo ruolo può solo consultare questi dati.</p>}
      <div className="dialog-azioni">
        <Button variante="tenue" onClick={onChiudi}>
          {puoScrivere ? 'Annulla' : 'Chiudi'}
        </Button>
        {puoScrivere && (
          <Button type="submit" variante="accento" disabled={salva.isPending}>
            Salva
          </Button>
        )}
      </div>
    </form>
  );
}
