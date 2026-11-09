import { useEffect, useState, type FormEvent } from 'react';
import { useApi, useMutazione } from '../../lib/api';
import { messaggioErrore } from '../../lib/errori';
import { qta } from '../../lib/formati';
import { Badge, BadgeStato, Button, DataTable, Dialog, EmptyState, Field, Select, type Colonna } from '../../ui';
import { righeErrore, type Compito } from '../compiti/logica';
import type { UtenteDocente } from '../DocenteClasse';
import type { RigaAttivita } from './componenti';
import { nomeTipoDocumento, type ScenarioNoto } from './logica';
import './classe.css';

interface CompitoTutti {
  id: string;
  assegnato_a: string | null;
  username: string | null;
  ruolo_aziendale: string | null;
  tipo: string;
  titolo: string;
  articolo_matricola: string | null;
  articolo_descrizione: string | null;
  controparte: string | null;
  qta: number | string | null;
  stato: string;
  motivo: string | null;
  esito: Compito['esito'];
}

interface Doc { documento_id: string; tipo?: string; anno: number; numero: number; controparte?: string | null; stato_spedizione?: string }
interface Anomalie {
  totale: number;
  giacenze_negative: { articolo_id: string; matricola: string; descrizione: string; qta: number }[];
  ordini_non_evasi: Doc[];
  ddt_senza_fattura: Doc[];
  fatture_senza_ddt: Doc[];
  spedizioni_ferme: Doc[];
  compiti_in_errore: { compito_id: string; titolo: string; username: string | null; esito: Compito['esito'] }[];
}

const STATI_SCENARIO = { bozza: { tono: 'grigio', testo: 'Bozza' }, attivo: { tono: 'verde', testo: 'Attivo' }, chiuso: { tono: 'grigio', testo: 'Chiuso' } } as const;
const SI_NO = [{ value: 'no', label: 'No' }, { value: 'si', label: 'Sì' }];

const nomeDoc = (d: Doc) => `${d.tipo ? nomeTipoDocumento(d.tipo) : 'scarico (DDT)'} n. ${d.numero}/${d.anno}${d.controparte ? ` - ${d.controparte}` : ''}`;

function Sezione({ titolo, voci }: { titolo: string; voci: string[] }) {
  if (!voci.length) return null;
  return (
    <div>
      <h3>{titolo} ({voci.length})</h3>
      <ul>{voci.map((v, i) => <li key={i}>{v}</li>)}</ul>
    </div>
  );
}

function RisultatoControllo({ r }: { r: Anomalie }) {
  if (r.totale === 0) return <div className="avviso ok-box" role="status"><h3>Tutto in ordine</h3><p>Nessuna anomalia trovata nello scenario.</p></div>;
  return (
    <div className="avviso errore-box anomalie" role="status">
      <h3>{r.totale} {r.totale === 1 ? 'anomalia' : 'anomalie'}</h3>
      <Sezione titolo="Giacenze negative" voci={r.giacenze_negative.map((g) => `${g.matricola} ${g.descrizione}: ${qta(g.qta)}`)} />
      <Sezione titolo="Ordini non evasi" voci={r.ordini_non_evasi.map(nomeDoc)} />
      <Sezione titolo="DDT senza fattura" voci={r.ddt_senza_fattura.map(nomeDoc)} />
      <Sezione titolo="Fatture senza DDT" voci={r.fatture_senza_ddt.map(nomeDoc)} />
      <Sezione titolo="Spedizioni ferme" voci={r.spedizioni_ferme.map((d) => `${nomeDoc(d)} (${(d.stato_spedizione ?? '').replace(/_/g, ' ')})`)} />
      <Sezione titolo="Compiti in errore" voci={r.compiti_in_errore.map((c) => `${c.username ?? 'libero'}: ${c.titolo}${righeErrore(c.esito).length ? ' - ' + righeErrore(c.esito).join('; ') : ''}`)} />
    </div>
  );
}

export default function Scenari({ magazzino, utenti, registro }: { magazzino: string; utenti: UtenteDocente[]; registro: RigaAttivita[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState(false);
  const [f, setF] = useState({ nome: 'Esercitazione 1', seed: '1', articoli: '12', sotto: 'no', inv: 'no' });

  // Gli scenari vengono dal database (api_scenari_elenco); le mutazioni invalidano la query.
  const elenco = useApi<{ id: string; nome: string; stato: ScenarioNoto['stato']; created_at: string }[]>(
    'api_scenari_elenco', { p_magazzino: magazzino }, { poll: 5000 });
  const memoria: ScenarioNoto[] = (elenco.data ?? []).map((s) => ({ id: s.id, nome: s.nome, stato: s.stato, creato_il: s.created_at }));

  const scenarioId = sel ?? memoria[0]?.id ?? null;
  const scenario = memoria.find((s) => s.id === scenarioId);

  const compiti = useApi<CompitoTutti[]>('api_compiti_tutti', { p_scenario: scenarioId }, { poll: 5000, enabled: !!scenarioId });
  const genera = useMutazione<{ scenario_id: string; n_compiti: number; n_studenti: number }>('api_scenario_genera', { ok: 'Scenario generato in bozza: attivalo per assegnare i compiti.' });
  const stato = useMutazione('api_scenario_stato');
  const riassegna = useMutazione('api_scenario_riassegna', { ok: 'Compito riassegnato' });
  const controlla = useMutazione<Anomalie>('api_scenario_controlla');
  const resetControllo = controlla.reset;
  useEffect(() => resetControllo(), [scenarioId, resetControllo]);

  const invia = (e: FormEvent) => {
    e.preventDefault();
    genera.mutate(
      {
        p_magazzino: magazzino,
        p_nome: f.nome.trim(),
        p_config: { seed: Number(f.seed) || 1, n_articoli: Number(f.articoli) || 12, sottoscorta_forzata: f.sotto === 'si', con_inventario: f.inv === 'si' },
      },
      {
        onSuccess: (r) => {
          setSel(r.scenario_id);
          setNuovo(false);
        },
      },
    );
  };

  const cambiaStato = (s: ScenarioNoto, nuovoStato: 'attivo' | 'chiuso') =>
    stato.mutate({ p_scenario: s.id, p_stato: nuovoStato });

  const colonne: Colonna<CompitoTutti>[] = [
    { chiave: 'username', titolo: 'Studente', valore: (c) => c.username ?? '~', render: (c) => c.username ?? <span className="muto">libero</span> },
    { chiave: 'ruolo_aziendale', titolo: 'Ruolo', render: (c) => (c.ruolo_aziendale ? <Badge tono="blu">{c.ruolo_aziendale}</Badge> : '') },
    { chiave: 'titolo', titolo: 'Compito' },
    { chiave: 'articolo_matricola', titolo: 'Merce', render: (c) => (c.articolo_matricola ? `${c.articolo_matricola} ${c.articolo_descrizione ?? ''}` : '') },
    { chiave: 'qta', titolo: 'Q.tà', allinea: 'destra', valore: (c) => (c.qta == null ? null : Number(c.qta)), render: (c) => (c.qta == null ? '' : qta(c.qta)) },
    { chiave: 'stato', titolo: 'Stato', aiuto: 'stato_compito', render: (c) => <><BadgeStato stato={c.stato} />{c.stato === 'bloccato' && c.motivo ? <small className="muto"> {c.motivo}</small> : null}</> },
    {
      chiave: 'riassegna', titolo: 'Riassegna a', ordinabile: false,
      render: (c) => (
        // La riga si seleziona al clic e con Invio/Spazio: dentro il menu non deve succedere.
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <select
            className="sel-tab"
            aria-label={`Riassegna "${c.titolo}"`}
            value={c.assegnato_a ?? ''}
            disabled={riassegna.isPending || c.stato === 'completato'}
            onChange={(e) => riassegna.mutate({ p_compito: c.id, p_user: e.target.value || null })}
          >
            <option value="">Libero (nessuno)</option>
            {utenti.map((u) => <option key={u.user_id} value={u.user_id}>{u.username}</option>)}
          </select>
        </span>
      ),
    },
  ];

  return (
    <section className="sezione" aria-labelledby="h-scenari">
      <div className="intestazione">
        <h2 id="h-scenari" style={{ margin: 0 }}>Scenari ed esercitazioni</h2>
        <Button variante="accento" aiuto="scenario" onClick={() => setNuovo(true)}>Crea scenario</Button>
      </div>

      {!memoria.length ? (
        <EmptyState titolo="Nessuno scenario" testo="Uno scenario crea articoli, clienti e fornitori fittizi e assegna compiti diversi a ogni studente." />
      ) : (
        <ul className="scenari">
          {memoria.map((s) => (
            <li key={s.id} aria-current={s.id === scenarioId}>
              <span className="nome">{s.nome}</span>
              <Badge tono={STATI_SCENARIO[s.stato].tono}>{STATI_SCENARIO[s.stato].testo}</Badge>
              <Button variante="tenue" onClick={() => setSel(s.id)} aria-pressed={s.id === scenarioId}>Compiti</Button>
              {s.stato !== 'attivo' ? (
                <Button disabled={stato.isPending} onClick={() => cambiaStato(s, 'attivo')}>{s.stato === 'chiuso' ? 'Riattiva' : 'Attiva'}</Button>
              ) : (
                <Button variante="tenue" disabled={stato.isPending} onClick={() => cambiaStato(s, 'chiuso')}>Chiudi</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {scenario && (
        <>
          <div className="righe-bottoni" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Compiti di "{scenario.nome}"</h3>
            <Button variante="tenue" onClick={() => controlla.mutate({ p_scenario: scenario.id })} disabled={controlla.isPending}>Controlla scenario</Button>
          </div>
          {scenario.stato === 'bozza' && <p className="avviso">Lo scenario è in bozza: gli studenti non vedono i compiti finché non lo attivi.</p>}
          {controlla.data && <RisultatoControllo r={controlla.data} />}
          {compiti.isError ? (
            <p className="errore" role="alert">{messaggioErrore(compiti.error)}</p>
          ) : compiti.isLoading ? (
            <p className="muto">Caricamento...</p>
          ) : (
            <DataTable
              righe={compiti.data ?? []}
              colonne={colonne}
              rigaId={(c) => c.id}
              dettaglio={(c) => {
                const err = righeErrore(c.esito);
                return (
                  <>
                    <h3>{c.titolo}</h3>
                    {err.length ? <ul>{err.map((x) => <li key={x}>{x}</li>)}</ul> : <p>{c.motivo ? `Motivo: ${c.motivo}.` : 'Nessun problema segnalato.'}</p>}
                  </>
                );
              }}
              vuoto={<EmptyState titolo="Nessun compito" testo="Lo scenario non ha compiti: servono studenti iscritti alla classe." />}
            />
          )}
        </>
      )}

      <Dialog aperto={nuovo} titolo="Crea scenario" onChiudi={() => setNuovo(false)}>
        <form onSubmit={invia}>
          <Field label="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoFocus />
          <Field label="Seed" type="number" value={f.seed} onChange={(e) => setF({ ...f, seed: e.target.value })} aiuto="seed" />
          <Field label="Numero di articoli" type="number" min={1} max={200} value={f.articoli} onChange={(e) => setF({ ...f, articoli: e.target.value })} nota="Almeno due articoli per studente: se serve ne vengono creati di più." />
          <Select label="Sottoscorta forzata" opzioni={SI_NO} value={f.sotto} onChange={(e) => setF({ ...f, sotto: e.target.value })} aiuto="sottoscorta_forzata" />
          <Select label="Con inventario" opzioni={SI_NO} value={f.inv} onChange={(e) => setF({ ...f, inv: e.target.value })} nota="Il fisico simulato differisce dal sistema per alcune merci." />
          <div className="dialog-azioni">
            <Button variante="tenue" onClick={() => setNuovo(false)}>Annulla</Button>
            <Button type="submit" variante="accento" disabled={!f.nome.trim() || genera.isPending}>Genera</Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
