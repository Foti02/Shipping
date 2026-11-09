import { useState } from 'react';
import { useMutazione } from '../../lib/api';
import { Button, Dialog, Field } from '../../ui';
import { avvisi, datiPerSalva, errori, moduloDa, type Anagrafica, type Modulo, type Tipo } from './logica';

interface Props {
  aperto: boolean;
  magazzino: string;
  /** Tipo della nuova anagrafica (ignorato in modifica: il tipo non cambia). */
  tipo: Tipo;
  /** Presente = modifica. */
  anagrafica?: Anagrafica;
  onChiudi: () => void;
}

export function DialogoAnagrafica({ aperto, ...p }: Props) {
  return (
    <Dialog aperto={aperto} titolo="Anagrafica" onChiudi={p.onChiudi}>
      <FormAnagrafica {...p} />
    </Dialog>
  );
}

function FormAnagrafica({ magazzino, tipo, anagrafica, onChiudi }: Omit<Props, 'aperto'>) {
  const t = anagrafica?.tipo ?? tipo;
  const [m, setM] = useState<Modulo>(() => moduloDa(anagrafica));
  const [provato, setProvato] = useState(false);
  const salva = useMutazione('api_anagrafica_salva', { ok: 'Anagrafica salvata' });
  const err = provato ? errori(m, t === 'fornitore') : {};
  const av = avvisi(m);

  const campo = (k: keyof Modulo) => ({ value: m[k], onChange: (e: { target: { value: string } }) => setM({ ...m, [k]: e.target.value }) });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setProvato(true);
        if (Object.keys(errori(m, t === 'fornitore')).length) return;
        salva.mutate({ p_magazzino: magazzino, p_dati: datiPerSalva(m, t, anagrafica?.id) }, { onSuccess: onChiudi });
      }}
    >
      <p className="muto">{t === 'cliente' ? 'Cliente' : 'Fornitore'}</p>
      <div className="form-griglia">
        <Field label="Codice" {...campo('codice')} />
        <Field label="Ragione sociale *" required {...campo('ragione_sociale')} errore={err.ragione_sociale} autoFocus />
        <Field label="Indirizzo" {...campo('indirizzo')} />
        <Field label="Comune" {...campo('comune')} />
        <Field label="E-mail" type="email" {...campo('email')} errore={av.email} />
        <Field label="Sito web" {...campo('sito_web')} />
        <Field label="Banca" {...campo('banca')} />
        <Field label="IBAN" {...campo('iban')} errore={av.iban} />
        <Field label="Telefono" type="tel" {...campo('telefono')} />
        <Field label="Cellulare" type="tel" {...campo('cellulare')} />
        <Field label="Codice fiscale" {...campo('cod_fisc')} errore={av.cod_fisc} />
        <Field label="Partita IVA" inputMode="numeric" {...campo('p_iva')} errore={av.p_iva} />
        <Field label="Sconto %" inputMode="decimal" {...campo('sconto_perc')} errore={err.sconto_perc} />
        {t === 'fornitore' && (
          <Field label="Giorni di consegna" inputMode="numeric" {...campo('lead_time_giorni')} errore={err.lead_time_giorni} aiuto="lead_time" />
        )}
      </div>
      <Field label="Note" {...campo('note')} />
      {Object.keys(av).length > 0 && <p className="muto">Ci sono segnalazioni sui dati: per l&apos;esercitazione puoi salvare comunque.</p>}
      <div className="dialog-azioni">
        <Button variante="tenue" onClick={onChiudi}>
          Annulla
        </Button>
        <Button type="submit" variante="accento" disabled={salva.isPending}>
          Salva
        </Button>
      </div>
    </form>
  );
}
