import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMagazzino } from '../../context/magazzino';
import { useApi } from '../../lib/api';
import { messaggioErrore } from '../../lib/errori';
import type { ChiaveAiuto } from '../../lib/aiuti';
import { euro } from '../../lib/formati';
import { Button, Dialog, Field, Select, Tabs, useToast } from '../../ui';
import { Suggerimento, testoAiuto } from '../../ui/Suggerimento';
import { ErroreForm, useScrivi } from './comuni';
import { centInEuro, euroInCent, leggiNumero, numeroInTesto, prezzoVendita } from './logica';
import type { Articolo, Fornitore, Ubicazione } from './tipi';

interface Form {
  matricola: string; descrizione: string; um: string; categoria: string; gruppo: string; note: string;
  prezzo: string; iva: string; ricarico: string; sconto: string;
  giacenza: string; minima: string; sicurezza: string; riordino: string; lead: string; domanda: string; costoOrdine: string; costoMant: string;
  ubicazione: string; fornitore: string; codiceFornitore: string; barcode: string; lotti: boolean;
}

const iniziale = (a: Articolo | null): Form => ({
  matricola: a?.matricola ?? '', descrizione: a?.descrizione ?? '', um: a?.um ?? 'PZ.', categoria: a?.categoria ?? 'Standard',
  gruppo: a?.gruppo ?? '', note: a?.note ?? '',
  prezzo: centInEuro(a?.prezzo_acquisto_cent ?? 0), iva: numeroInTesto(a?.iva_perc ?? 22),
  ricarico: numeroInTesto(a?.ricarico_perc ?? 0), sconto: numeroInTesto(a?.sconto_perc ?? 0),
  giacenza: '0', minima: numeroInTesto(a?.scorta_minima ?? 0), sicurezza: numeroInTesto(a?.scorta_sicurezza ?? 0),
  riordino: a ? numeroInTesto(a.punto_riordino) : '', lead: numeroInTesto(a?.lead_time_giorni ?? 3),
  domanda: numeroInTesto(a?.domanda_giornaliera), costoOrdine: centInEuro(a?.costo_ordine_cent ?? 0),
  costoMant: numeroInTesto(a?.costo_mantenimento_perc ?? 20),
  ubicazione: a?.ubicazione_id ?? '', fornitore: a?.fornitore_abituale_id ?? '', codiceFornitore: a?.codice_fornitore ?? '',
  barcode: a?.barcode ?? '', lotti: a?.gestione_lotti ?? false,
});

type Errori = Partial<Record<keyof Form, string>>;
const SCHEDA_DI: Partial<Record<keyof Form, string>> = {
  matricola: 'dati', descrizione: 'dati',
  prezzo: 'prezzi', iva: 'prezzi', ricarico: 'prezzi', sconto: 'prezzi',
  giacenza: 'scorte', minima: 'scorte', sicurezza: 'scorte', riordino: 'scorte', lead: 'scorte', domanda: 'scorte', costoOrdine: 'scorte', costoMant: 'scorte',
};
const SCHEDE = [
  { id: 'dati', etichetta: 'Dati' },
  { id: 'prezzi', etichetta: 'Prezzi' },
  { id: 'scorte', etichetta: 'Scorte' },
  { id: 'logistica', etichetta: 'Logistica' },
];

function valida(f: Form, crea: boolean): Errori {
  const e: Errori = {};
  if (!f.matricola.trim()) e.matricola = 'Scrivi la matricola.';
  if (!f.descrizione.trim()) e.descrizione = 'Scrivi la descrizione.';
  const num = (k: keyof Form, nome: string, min: number, max = Infinity, intero = false, obbligatorio = true) => {
    const t = f[k] as string;
    const n = leggiNumero(t);
    if (n === null) {
      if (obbligatorio) e[k] = `${nome}: inserisci un numero.`;
    } else if (Number.isNaN(n) || n < min || n > max || (intero && !Number.isInteger(n))) {
      e[k] = `${nome}: ${intero ? 'numero intero' : 'valore'} ${max === Infinity ? `almeno ${min}` : `tra ${min} e ${max}`}.`;
    }
  };
  num('prezzo', 'Prezzo', 0, 9999999);
  num('iva', 'IVA', 0, 100);
  num('ricarico', 'Ricarico', 0, 999.99);
  num('sconto', 'Sconto', 0, 100);
  if (crea) num('giacenza', 'Giacenza', 0);
  num('minima', 'Scorta minima', 0);
  num('sicurezza', 'Scorta di sicurezza', 0);
  num('riordino', 'Punto di riordino', 0, Infinity, false, false);
  num('lead', 'Lead time', 0, 3650, true);
  num('domanda', 'Domanda giornaliera', 0, Infinity, false, false);
  num('costoOrdine', 'Costo ordine', 0, 9999999);
  num('costoMant', 'Costo di mantenimento', 0, 100);
  const ri = leggiNumero(f.riordino);
  const si = leggiNumero(f.sicurezza);
  if (!e.riordino && !e.sicurezza && ri !== null && si !== null && ri < si) e.riordino = 'Il punto di riordino non può essere inferiore alla scorta di sicurezza.';
  return e;
}

const vuotoNull = (s: string) => (s.trim() === '' ? null : s.trim());

function payload(f: Form, id: string | undefined): Record<string, unknown> {
  const n = (s: string) => leggiNumero(s) as number;
  const p: Record<string, unknown> = {
    matricola: f.matricola.trim(), descrizione: f.descrizione.trim(), um: f.um.trim(), categoria: f.categoria.trim(),
    gruppo: vuotoNull(f.gruppo), note: vuotoNull(f.note),
    prezzo_acquisto_cent: euroInCent(f.prezzo), iva_perc: n(f.iva), ricarico_perc: n(f.ricarico), sconto_perc: n(f.sconto),
    scorta_minima: n(f.minima), scorta_sicurezza: n(f.sicurezza), lead_time_giorni: n(f.lead),
    domanda_giornaliera: leggiNumero(f.domanda), costo_ordine_cent: euroInCent(f.costoOrdine), costo_mantenimento_perc: n(f.costoMant),
    ubicazione_id: f.ubicazione || null, fornitore_abituale_id: f.fornitore || null,
    codice_fornitore: vuotoNull(f.codiceFornitore), barcode: vuotoNull(f.barcode), gestione_lotti: f.lotti,
  };
  // Senza punto di riordino lo calcola il database (almeno la scorta di sicurezza).
  if (leggiNumero(f.riordino) !== null) p.punto_riordino = n(f.riordino);
  if (id) p.id = id;
  else if (n(f.giacenza) > 0) p.giacenza_iniziale = n(f.giacenza);
  return p;
}

const DECIMALI = new Set<keyof Form>(['prezzo', 'iva', 'ricarico', 'sconto', 'giacenza', 'minima', 'sicurezza', 'riordino', 'domanda', 'costoOrdine', 'costoMant']);
const UM = ['PZ.', 'KG.', 'LT.', 'MT.', 'MQ.', 'CF.', 'NR.'];

interface Props {
  aperto: boolean;
  /** null = nuovo articolo. */
  articolo: Articolo | null;
  categorie: string[];
  onChiudi: () => void;
}

export function FormArticolo({ aperto, articolo, categorie, onChiudi }: Props) {
  return (
    <Dialog aperto={aperto} titolo="Dati articolo" onChiudi={onChiudi}>
      <Corpo articolo={articolo} categorie={categorie} onChiudi={onChiudi} />
    </Dialog>
  );
}

function Corpo({ articolo, categorie, onChiudi }: Omit<Props, 'aperto'>) {
  const m = useMagazzino();
  const toast = useToast();
  const crea = !articolo;
  const [f, setF] = useState(() => iniziale(articolo));
  const [scheda, setScheda] = useState('dati');
  const [errori, setErrori] = useState<Errori>({});
  const [errForm, setErrForm] = useState<string | null>(null);
  const salva = useScrivi('api_articolo_salva');
  const ubicazioni = useApi<Ubicazione[]>('api_ubicazioni_elenco', { p_magazzino: m.id });
  const fornitori = useApi<Fornitore[]>('api_anagrafiche_elenco', { p_magazzino: m.id, p_tipo: 'fornitore' });

  const set = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const campo = (k: keyof Form, label: string, extra: { aiuto?: ChiaveAiuto; nota?: string; list?: string; maxLength?: number } = {}) => (
    <Field label={label} value={f[k] as string} onChange={set(k)} errore={errori[k]} inputMode={DECIMALI.has(k) ? 'decimal' : undefined} {...extra} />
  );

  const vendita = useMemo(() => {
    const a = euroInCent(f.prezzo);
    const [ri, sc, iv] = [f.ricarico, f.sconto, f.iva].map((s) => leggiNumero(s) ?? 0);
    return a === null || Number.isNaN(a) || [ri, sc, iv].some(Number.isNaN) ? null : prezzoVendita(a, ri, sc, iv);
  }, [f.prezzo, f.ricarico, f.sconto, f.iva]);

  const invia = (ev: FormEvent) => {
    ev.preventDefault();
    const e = valida(f, crea);
    setErrori(e);
    const chiavi = Object.keys(e) as (keyof Form)[];
    if (chiavi.length) {
      const schede = [...new Set(chiavi.map((k) => SCHEDA_DI[k]))];
      setScheda(SCHEDA_DI[chiavi[0]]!);
      setErrForm(`Controlla i campi in rosso (schede: ${schede.map((s) => SCHEDE.find((x) => x.id === s)?.etichetta).join(', ')}).`);
      return;
    }
    setErrForm(null);
    salva.mutate({ p_magazzino: m.id, p_dati: payload(f, articolo?.id) }, {
      onSuccess: () => {
        toast(crea ? 'Articolo creato.' : 'Articolo salvato.', 'ok');
        onChiudi();
      },
      onError: (err) => {
        if (err instanceof Error && err.message === 'gia_esiste') {
          setErrori({ matricola: 'Esiste già un articolo con questa matricola.' });
          setScheda('dati');
          setErrForm('Matricola già usata: scegline un\'altra.');
        } else setErrForm(messaggioErrore(err));
      },
    });
  };

  const opzUbicazioni = [{ value: '', label: 'Nessuna' }, ...(ubicazioni.data ?? []).map((u) => ({ value: u.id, label: u.codice }))];
  const opzFornitori = [{ value: '', label: 'Nessuno' }, ...(fornitori.data ?? []).map((x) => ({ value: x.id, label: x.ragione_sociale }))];

  return (
    <form onSubmit={invia} noValidate>
      <Tabs voci={SCHEDE.map((s) => ({ id: `fa-${s.id}`, etichetta: s.etichetta }))} attiva={`fa-${scheda}`} onCambia={(id) => setScheda(id.slice(3))} />
      <ErroreForm testo={errForm} />
      <div role="tabpanel" aria-labelledby={`tab-fa-${scheda}`}>
        {scheda === 'dati' && (
          <>
            {campo('matricola', 'Matricola', { maxLength: 40 })}
            {campo('descrizione', 'Descrizione')}
            <div className="art-griglia2">
              {campo('um', 'Unità di misura', { list: 'art-um', maxLength: 10 })}
              {campo('categoria', 'Categoria', { list: 'art-categorie' })}
              <div className="largo">{campo('gruppo', 'Gruppo (facoltativo)')}</div>
            </div>
            <div className="field">
              <label htmlFor="art-note">Note</label>
              <textarea id="art-note" value={f.note} onChange={set('note')} />
            </div>
            <datalist id="art-um">{UM.map((u) => <option key={u} value={u} />)}</datalist>
            <datalist id="art-categorie">{categorie.map((c) => <option key={c} value={c} />)}</datalist>
          </>
        )}

        {scheda === 'prezzi' && (
          <>
            <div className="art-griglia2">
              {campo('prezzo', 'Prezzo di acquisto (€)', { nota: 'In euro, senza IVA: 12,50' })}
              {campo('iva', 'IVA (%)')}
              {campo('ricarico', 'Ricarico di vendita (%)', { aiuto: 'ricarico' })}
              {campo('sconto', 'Sconto fisso (%)', { aiuto: 'sconto_fisso' })}
            </div>
            <dl className="art-prezzi" aria-label="Prezzi calcolati">
              <div><dt>Acquisto con IVA</dt><dd>{vendita ? euro(vendita.acquistoIvato) : '-'}</dd></div>
              <div><dt>Prezzo di listino (acquisto + ricarico)</dt><dd>{vendita ? euro(vendita.listino) : '-'}</dd></div>
              <div><dt>Prezzo di vendita (dopo lo sconto)</dt><dd>{vendita ? euro(vendita.netto) : '-'}</dd></div>
              <div><dt>Prezzo di vendita con IVA</dt><dd>{vendita ? euro(vendita.ivato) : '-'}</dd></div>
            </dl>
          </>
        )}

        {scheda === 'scorte' && (
          <>
            <p className="muto">Questi valori servono per le esercitazioni sul riordino: il programma li usa per segnalare la merce sotto scorta.</p>
            <div className="art-griglia2">
              {crea ? (
                <div className="largo">{campo('giacenza', 'Giacenza iniziale', { nota: 'Crea il movimento di apertura. Si imposta solo qui, poi cambia con carichi, scarichi e inventario.' })}</div>
              ) : (
                <p className="largo muto">La giacenza non si modifica da qui: cambia con carichi, scarichi, resi e inventario.</p>
              )}
              {campo('minima', 'Scorta minima', { aiuto: 'scorta_minima' })}
              {campo('sicurezza', 'Scorta di sicurezza', { aiuto: 'scorta_sicurezza' })}
              <div className="largo">
                {campo('riordino', 'Punto di riordino', { aiuto: 'punto_riordino', nota: 'Se lo lasci vuoto lo propone il programma.' })}
              </div>
              {campo('lead', 'Lead time (giorni)', { aiuto: 'lead_time' })}
              {campo('domanda', 'Domanda giornaliera', { aiuto: 'domanda_giornaliera' })}
              {campo('costoOrdine', 'Costo di un ordine (€)', { aiuto: 'costo_ordine' })}
              {campo('costoMant', 'Costo di mantenimento (% annuo)', { aiuto: 'costo_mantenimento' })}
            </div>
          </>
        )}

        {scheda === 'logistica' && (
          <>
            <Select label="Ubicazione" value={f.ubicazione} onChange={set('ubicazione')} opzioni={opzUbicazioni} aiuto="ubicazione" nota={ubicazioni.isError ? 'Ubicazioni non disponibili.' : undefined} />
            <Select label="Fornitore abituale" value={f.fornitore} onChange={set('fornitore')} opzioni={opzFornitori} nota={fornitori.isError ? 'Fornitori non disponibili.' : undefined} />
            <div className="art-griglia2">
              {campo('codiceFornitore', 'Codice del fornitore')}
              {campo('barcode', 'Codice a barre')}
            </div>
            <Suggerimento testo={testoAiuto('gestione_lotti')}>
              <label className="art-check">
                <input type="checkbox" checked={f.lotti} onChange={(e) => setF((v) => ({ ...v, lotti: e.target.checked }))} />
                Gestione lotti (scarico dal lotto che scade prima)
              </label>
            </Suggerimento>
          </>
        )}
      </div>
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
