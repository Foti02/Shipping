import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMagazzino } from '../context/magazzino';
import { useApi } from '../lib/api';
import { messaggioErrore } from '../lib/errori';
import { dataOra, euro, qta } from '../lib/formati';
import { Badge, DataTable, EmptyState, Select, Tabs, type Colonna, type Tono } from '../ui';
import { AzioniScheda, euroCsv, numCsv } from './classe/componenti';
import './classe/classe.css';

const SCHEDE = [
  { id: 'riordino', etichetta: 'Riordino' },
  { id: 'kpi', etichetta: 'KPI' },
  { id: 'valorizzazione', etichetta: 'Valorizzazione' },
];

/** Carica, gestisce errore e attesa, poi mostra il contenuto. */
function Stato<T>({ q, children }: { q: { data?: T; isError: boolean; isLoading: boolean; error: unknown }; children: (d: T) => ReactNode }) {
  if (q.isError) return <p className="errore" role="alert">{messaggioErrore(q.error)}</p>;
  if (q.isLoading || q.data === undefined) return <p className="muto">Caricamento...</p>;
  return <>{children(q.data)}</>;
}

// ---------- Riordino ----------
interface Suggerimento {
  articolo_id: string; matricola: string; descrizione: string; um: string; giacenza: number; ordinato: number; domanda_giornaliera: number;
  lead_time_giorni: number; scorta_sicurezza: number; punto_riordino: number; punto_riordino_consigliato: number; eoq: number; qta_suggerita: number; urgenza: 'alta' | 'media' | 'nessuna';
}
const URGENZA: Record<string, { tono: Tono; testo: string }> = { alta: { tono: 'rosso', testo: 'Alta' }, media: { tono: 'giallo', testo: 'Media' }, nessuna: { tono: 'verde', testo: 'Nessuna' } };
const ORD_URG = { alta: 0, media: 1, nessuna: 2 };

function Riordino({ magazzino, puoOrdinare }: { magazzino: string; puoOrdinare: boolean }) {
  const q = useApi<Suggerimento[]>('api_riordino_suggerimenti', { p_magazzino: magazzino });
  const [tutti, setTutti] = useState('urgenti');
  const colonne: Colonna<Suggerimento>[] = [
    { chiave: 'matricola', titolo: 'Articolo', render: (r) => <><strong>{r.matricola}</strong><br /><span className="muto">{r.descrizione}</span></> },
    { chiave: 'giacenza', titolo: 'Giacenza', allinea: 'destra', valore: (r) => Number(r.giacenza), render: (r) => `${qta(r.giacenza)} ${r.um}` },
    { chiave: 'ordinato', titolo: 'In arrivo', allinea: 'destra', valore: (r) => Number(r.ordinato), render: (r) => qta(r.ordinato) },
    { chiave: 'domanda_giornaliera', titolo: 'Domanda al giorno', allinea: 'destra', valore: (r) => Number(r.domanda_giornaliera), render: (r) => qta(r.domanda_giornaliera) },
    { chiave: 'lead_time_giorni', titolo: 'Lead time (gg)', allinea: 'destra', valore: (r) => Number(r.lead_time_giorni) },
    { chiave: 'scorta_sicurezza', titolo: 'Scorta di sicurezza', allinea: 'destra', valore: (r) => Number(r.scorta_sicurezza), render: (r) => qta(r.scorta_sicurezza) },
    { chiave: 'punto_riordino_consigliato', titolo: 'Punto di riordino', allinea: 'destra', valore: (r) => Number(r.punto_riordino_consigliato), render: (r) => <>{qta(r.punto_riordino_consigliato)}{Number(r.punto_riordino) !== Number(r.punto_riordino_consigliato) && <span className="muto"> (impostato {qta(r.punto_riordino)})</span>}</> },
    { chiave: 'eoq', titolo: 'EOQ', allinea: 'destra', valore: (r) => Number(r.eoq), render: (r) => (Number(r.eoq) > 0 ? qta(r.eoq) : <span className="muto">dati mancanti</span>) },
    { chiave: 'qta_suggerita', titolo: 'Da ordinare', allinea: 'destra', valore: (r) => Number(r.qta_suggerita), render: (r) => (Number(r.qta_suggerita) > 0 ? <strong>{qta(r.qta_suggerita)}</strong> : '-') },
    { chiave: 'urgenza', titolo: 'Urgenza', valore: (r) => ORD_URG[r.urgenza], render: (r) => <Badge tono={URGENZA[r.urgenza].tono}>{URGENZA[r.urgenza].testo}</Badge> },
  ];
  return (
    <Stato q={q}>
      {(dati) => {
        const righe = tutti === 'urgenti' ? dati.filter((r) => r.urgenza !== 'nessuna') : dati;
        const csv = righe.map((r) => ({
          Matricola: r.matricola, Descrizione: r.descrizione, Giacenza: numCsv(r.giacenza), 'In arrivo': numCsv(r.ordinato), 'Domanda al giorno': numCsv(r.domanda_giornaliera),
          'Lead time (gg)': numCsv(r.lead_time_giorni), 'Scorta di sicurezza': numCsv(r.scorta_sicurezza), 'Punto di riordino': numCsv(r.punto_riordino_consigliato), EOQ: numCsv(r.eoq), 'Da ordinare': numCsv(r.qta_suggerita), Urgenza: r.urgenza,
        }));
        return (
          <>
            <p className="spiegazione">
              Punto di riordino = domanda al giorno × lead time + scorta di sicurezza. Quantità economica EOQ = √(2 · D · S / H), con D domanda annua, S costo di un ordine, H costo annuo di tenere in magazzino un'unità.
            </p>
            <div className="righe-bottoni no-stampa" style={{ marginBottom: 16 }}>
              <div style={{ minWidth: 220 }}>
                <Select label="Mostra" opzioni={[{ value: 'urgenti', label: 'Solo da riordinare' }, { value: 'tutti', label: 'Tutti gli articoli' }]} value={tutti} onChange={(e) => setTutti(e.target.value)} />
              </div>
              {puoOrdinare && <Link className="btn btn-accento" to={`/m/${magazzino}/documenti/ordine_fornitore`}>Vai agli ordini fornitore</Link>}
            </div>
            <AzioniScheda nomeFile="riordino" righe={csv} />
            <DataTable righe={righe} colonne={colonne} rigaId={(r) => r.articolo_id} vuoto={<EmptyState titolo={tutti === 'urgenti' ? 'Niente da riordinare' : 'Nessun articolo'} testo={tutti === 'urgenti' ? 'Tutti gli articoli sono sopra il punto di riordino.' : undefined} />} />
          </>
        );
      }}
    </Stato>
  );
}

// ---------- KPI ----------
interface Kpi {
  giorni: number; valore_giacenza: number; costo_venduto: number; rotazione: number | null; copertura_giorni: number | null; sottoscorta: number;
  abc: { articolo: string; articolo_id: string; descrizione: string; classe: 'A' | 'B' | 'C'; valore: number; perc_cum: number }[];
  fermi: { articolo_id: string; matricola: string; descrizione: string; giacenza: number; valore: number; ultimo_scarico: string | null }[];
}
const CLASSE_TONO: Record<string, Tono> = { A: 'blu', B: 'giallo', C: 'grigio' };
type Abc = Kpi['abc'][number];
type Fermo = Kpi['fermi'][number];

const colonneAbc: Colonna<Abc>[] = [
  { chiave: 'articolo', titolo: 'Articolo', render: (r) => <><strong>{r.articolo}</strong><br /><span className="muto">{r.descrizione}</span></> },
  { chiave: 'classe', titolo: 'Classe', render: (r) => <Badge tono={CLASSE_TONO[r.classe]}>Classe {r.classe}</Badge> },
  { chiave: 'valore', titolo: 'Consumo del periodo', allinea: 'destra', valore: (r) => Number(r.valore), render: (r) => euro(r.valore) },
  { chiave: 'perc_cum', titolo: '% cumulata', allinea: 'destra', valore: (r) => Number(r.perc_cum), render: (r) => `${qta(r.perc_cum)} %` },
];
const colonneFermi: Colonna<Fermo>[] = [
  { chiave: 'matricola', titolo: 'Articolo', render: (r) => <><strong>{r.matricola}</strong><br /><span className="muto">{r.descrizione}</span></> },
  { chiave: 'giacenza', titolo: 'Giacenza', allinea: 'destra', valore: (r) => Number(r.giacenza), render: (r) => qta(r.giacenza) },
  { chiave: 'valore', titolo: 'Valore fermo', allinea: 'destra', valore: (r) => Number(r.valore), render: (r) => euro(r.valore) },
  { chiave: 'ultimo_scarico', titolo: 'Ultimo scarico', valore: (r) => r.ultimo_scarico, render: (r) => (r.ultimo_scarico ? dataOra(r.ultimo_scarico) : 'mai') },
];

function KpiScheda({ magazzino }: { magazzino: string }) {
  const [giorni, setGiorni] = useState('30');
  const q = useApi<Kpi>('api_kpi', { p_magazzino: magazzino, p_giorni: Number(giorni) });
  return (
    <>
      <div className="no-stampa" style={{ maxWidth: 260 }}>
        <Select label="Periodo" opzioni={[{ value: '30', label: 'Ultimi 30 giorni' }, { value: '90', label: 'Ultimi 90 giorni' }, { value: '365', label: 'Ultimo anno' }]} value={giorni} onChange={(e) => setGiorni(e.target.value)} />
      </div>
      <Stato q={q}>
        {(k) => {
          const csv = [
            ...k.abc.map((r) => ({ Sezione: 'ABC', Articolo: r.articolo, Descrizione: r.descrizione, Classe: r.classe, 'Valore (EUR)': euroCsv(r.valore), '% cumulata': numCsv(r.perc_cum), Giacenza: '', 'Ultimo scarico': '' })),
            ...k.fermi.map((r) => ({ Sezione: 'Fermo', Articolo: r.matricola, Descrizione: r.descrizione, Classe: '', 'Valore (EUR)': euroCsv(r.valore), '% cumulata': '', Giacenza: numCsv(r.giacenza), 'Ultimo scarico': r.ultimo_scarico ? dataOra(r.ultimo_scarico) : 'mai' })),
          ];
          return (
            <>
              <AzioniScheda nomeFile={`kpi-${k.giorni}-giorni`} righe={csv} />
              <div className="kpi largo">
                <div><strong>{euro(k.valore_giacenza)}</strong><span>Valore della giacenza</span></div>
                <div><strong>{euro(k.costo_venduto)}</strong><span>Costo venduto ({k.giorni} gg)</span></div>
                <div><strong>{k.rotazione != null ? qta(k.rotazione) : '-'}</strong><span>Rotazione</span></div>
                <div><strong>{k.copertura_giorni != null ? `${qta(k.copertura_giorni)} gg` : '-'}</strong><span>Copertura</span></div>
                <div><strong>{qta(k.sottoscorta)}</strong><span>Articoli sotto scorta</span></div>
              </div>
              <p className="spiegazione">Rotazione = costo venduto / valore medio di magazzino. Copertura = per quanti giorni basta la giacenza al ritmo di consumo del periodo.</p>
              <h2>Analisi ABC</h2>
              <p className="spiegazione">Gli articoli sono ordinati per consumo: la classe A copre circa l'80% del consumo, la B fino al 95%, la C il resto.</p>
              <DataTable righe={k.abc} colonne={colonneAbc} rigaId={(r) => r.articolo_id} vuoto={<EmptyState titolo="Nessun consumo nel periodo" testo="Servono scarichi confermati per classificare gli articoli." />} />
              <h2 style={{ marginTop: 24 }}>Articoli fermi</h2>
              <p className="spiegazione">In giacenza ma senza nessuno scarico nel periodo: capitale immobilizzato.</p>
              <DataTable righe={k.fermi} colonne={colonneFermi} rigaId={(r) => r.articolo_id} vuoto={<EmptyState titolo="Nessun articolo fermo" />} />
            </>
          );
        }}
      </Stato>
    </>
  );
}

// ---------- Valorizzazione ----------
interface Val { valore_cmp: number; valore_fifo: number; valore_lifo: number; diff_fifo_cmp: number; diff_lifo_cmp: number; diff_fifo_lifo: number }
interface Valorizzazione { righe: (Val & { articolo_id: string; matricola: string; descrizione: string; um: string; qta: number })[]; totali: Val }

const diff = (c: number) => <span className={Number(c) === 0 ? '' : Number(c) > 0 ? 'positivo' : 'negativo'}>{Number(c) > 0 ? '+' : ''}{euro(c)}</span>;

function ValorizzazioneScheda({ magazzino }: { magazzino: string }) {
  const q = useApi<Valorizzazione>('api_valorizzazione', { p_magazzino: magazzino });
  type R = Valorizzazione['righe'][number];
  const colonne: Colonna<R>[] = [
    { chiave: 'matricola', titolo: 'Articolo', render: (r) => <><strong>{r.matricola}</strong><br /><span className="muto">{r.descrizione}</span></> },
    { chiave: 'qta', titolo: 'Q.tà', allinea: 'destra', valore: (r) => Number(r.qta), render: (r) => `${qta(r.qta)} ${r.um}` },
    { chiave: 'valore_cmp', titolo: 'Costo medio', allinea: 'destra', valore: (r) => Number(r.valore_cmp), render: (r) => euro(r.valore_cmp) },
    { chiave: 'valore_fifo', titolo: 'FIFO', allinea: 'destra', valore: (r) => Number(r.valore_fifo), render: (r) => euro(r.valore_fifo) },
    { chiave: 'valore_lifo', titolo: 'LIFO', allinea: 'destra', valore: (r) => Number(r.valore_lifo), render: (r) => euro(r.valore_lifo) },
    { chiave: 'diff_fifo_cmp', titolo: 'FIFO - medio', allinea: 'destra', valore: (r) => Number(r.diff_fifo_cmp), render: (r) => diff(r.diff_fifo_cmp) },
    { chiave: 'diff_lifo_cmp', titolo: 'LIFO - medio', allinea: 'destra', valore: (r) => Number(r.diff_lifo_cmp), render: (r) => diff(r.diff_lifo_cmp) },
    { chiave: 'diff_fifo_lifo', titolo: 'FIFO - LIFO', allinea: 'destra', valore: (r) => Number(r.diff_fifo_lifo), render: (r) => diff(r.diff_fifo_lifo) },
  ];
  return (
    <Stato q={q}>
      {(v) => {
        const t = v.totali;
        const csv = [
          ...v.righe.map((r) => ({ Matricola: r.matricola, Descrizione: r.descrizione, Quantita: numCsv(r.qta), 'Costo medio (EUR)': euroCsv(r.valore_cmp), 'FIFO (EUR)': euroCsv(r.valore_fifo), 'LIFO (EUR)': euroCsv(r.valore_lifo), 'FIFO-medio (EUR)': euroCsv(r.diff_fifo_cmp), 'LIFO-medio (EUR)': euroCsv(r.diff_lifo_cmp), 'FIFO-LIFO (EUR)': euroCsv(r.diff_fifo_lifo) })),
          ...(v.righe.length ? [{ Matricola: 'TOTALE', Descrizione: '', Quantita: '', 'Costo medio (EUR)': euroCsv(t.valore_cmp), 'FIFO (EUR)': euroCsv(t.valore_fifo), 'LIFO (EUR)': euroCsv(t.valore_lifo), 'FIFO-medio (EUR)': euroCsv(t.diff_fifo_cmp), 'LIFO-medio (EUR)': euroCsv(t.diff_lifo_cmp), 'FIFO-LIFO (EUR)': euroCsv(t.diff_fifo_lifo) }] : []),
        ];
        return (
          <>
            <p className="spiegazione">
              Lo stesso magazzino valutato in tre modi. Costo medio ponderato: ogni carico fa la media. FIFO: esce prima la merce entrata prima, resta valutata ai prezzi più recenti. LIFO: esce prima l'ultima entrata, resta valutata ai prezzi più vecchi.
            </p>
            <AzioniScheda nomeFile="valorizzazione" righe={csv} />
            <div className="kpi largo">
              <div><strong>{euro(t.valore_cmp)}</strong><span>Totale costo medio</span></div>
              <div><strong>{euro(t.valore_fifo)}</strong><span>Totale FIFO</span></div>
              <div><strong>{euro(t.valore_lifo)}</strong><span>Totale LIFO</span></div>
              <div><strong>{diff(t.diff_fifo_cmp)}</strong><span>FIFO - costo medio</span></div>
              <div><strong>{diff(t.diff_lifo_cmp)}</strong><span>LIFO - costo medio</span></div>
              <div><strong>{diff(t.diff_fifo_lifo)}</strong><span>FIFO - LIFO</span></div>
            </div>
            <DataTable righe={v.righe} colonne={colonne} rigaId={(r) => r.articolo_id} vuoto={<EmptyState titolo="Nessun movimento" testo="La valorizzazione si calcola dai carichi e scarichi registrati." />} />
          </>
        );
      }}
    </Stato>
  );
}

export default function Analisi() {
  const m = useMagazzino();
  const [scheda, setScheda] = useState('riordino');
  return (
    <>
      <h1>
        Analisi<span className="dot">.</span>
      </h1>
      <div className="no-stampa">
        <Tabs voci={SCHEDE} attiva={scheda} onCambia={setScheda} />
      </div>
      <h2 className="solo-stampa">{m.nome}: {SCHEDE.find((s) => s.id === scheda)?.etichetta}</h2>
      <div role="tabpanel" aria-labelledby={`tab-${scheda}`}>
        {scheda === 'riordino' && <Riordino magazzino={m.id} puoOrdinare={m.puo('ordine_fornitore')} />}
        {scheda === 'kpi' && <KpiScheda magazzino={m.id} />}
        {scheda === 'valorizzazione' && <ValorizzazioneScheda magazzino={m.id} />}
      </div>
    </>
  );
}
