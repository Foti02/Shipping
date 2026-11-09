import { useState, type FormEvent } from 'react';
import { useMagazzino } from '../context/magazzino';
import { useApi, useMutazione } from '../lib/api';
import { messaggioErrore } from '../lib/errori';
import { data, dataOra, qta } from '../lib/formati';
import { Badge, Button, DataTable, Dialog, EmptyState, Field, type Colonna } from '../ui';
import { Suggerimento, testoAiuto } from '../ui/Suggerimento';
import './classe/classe.css';

interface Riga {
  id: string;
  matricola: string;
  descrizione: string;
  lotto: string | null;
  ubicazione: string | null;
  qta_sistema: number | string;
  qta_contata: number | string | null;
  differenza: number | string | null;
  causale: string | null;
  rettificata: boolean;
}
interface Inventario { id: string; nome: string; stato: 'aperto' | 'chiuso'; created_at: string; chiuso_il: string | null; n_righe: number; n_contate: number; n_rettificate: number; righe: Riga[] }
interface Chiusura { righe: number; rettificate: number; non_rettificate: { matricola: string; differenza: number | string }[] }

const CAUSALI = [
  { value: 'conteggio', label: 'Errore di conteggio' },
  { value: 'danneggiato', label: 'Merce danneggiata' },
  { value: 'smarrito', label: 'Merce smarrita' },
  { value: 'errore_registrazione', label: 'Errore di registrazione' },
];
const nomeCausale = (c: string | null) => CAUSALI.find((x) => x.value === c)?.label ?? c ?? '';
const segno = (n: number | string | null) => (n == null ? '' : `${Number(n) > 0 ? '+' : ''}${qta(n)}`);

export default function Inventario() {
  const m = useMagazzino();
  const scrive = m.puo('inventario');
  const elenco = useApi<Inventario[]>('api_inventari_elenco', { p_magazzino: m.id });
  const apri = useMutazione<{ id: string }>('api_inventario_apri');
  const conta = useMutazione('api_inventario_conta');
  const rettifica = useMutazione('api_inventario_rettifica', { ok: 'Rettifica registrata' });
  const chiudi = useMutazione<Chiusura>('api_inventario_chiudi');

  const [scelto, setScelto] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState(false);
  const [nome, setNome] = useState('');
  const [contando, setContando] = useState<Riga | null>(null);
  const [quantita, setQuantita] = useState('');
  const [causali, setCausali] = useState<Record<string, string>>({});
  const [nota, setNota] = useState<Chiusura | null>(null);

  const inv = elenco.data?.find((i) => i.id === scelto) ?? elenco.data?.[0];
  const aperto = inv?.stato === 'aperto';
  const daContare = inv ? inv.n_righe - inv.n_contate : 0;

  const apriNuovo = (e: FormEvent) => {
    e.preventDefault();
    apri.mutate({ p_magazzino: m.id, p_nome: nome.trim() }, { onSuccess: (r) => { setScelto(r.id); setNuovo(false); setNota(null); } });
  };
  const chiudiConta = () => { setContando(null); setQuantita(''); };
  const eseguiConta = (valore: string | null) =>
    conta.mutate({ p_riga: contando!.id, ...(valore != null ? { p_qta: Number(valore.replace(',', '.')) } : {}) }, { onSuccess: chiudiConta });

  const colonne: Colonna<Riga>[] = [
    { chiave: 'matricola', titolo: 'Articolo', render: (r) => <><strong>{r.matricola}</strong><br /><span className="muto">{r.descrizione}</span></> },
    { chiave: 'ubicazione', titolo: 'Ubicazione / lotto', aiuto: 'ubicazione', valore: (r) => r.ubicazione, render: (r) => [r.ubicazione, r.lotto].filter(Boolean).join(' / ') || <span className="muto">-</span> },
    { chiave: 'qta_sistema', titolo: 'Sistema', allinea: 'destra', valore: (r) => Number(r.qta_sistema), render: (r) => qta(r.qta_sistema) },
    { chiave: 'qta_contata', titolo: 'Contata', allinea: 'destra', valore: (r) => (r.qta_contata == null ? null : Number(r.qta_contata)), render: (r) => (r.qta_contata == null ? <span className="muto">da contare</span> : qta(r.qta_contata)) },
    {
      chiave: 'differenza', titolo: 'Differenza', allinea: 'destra', valore: (r) => (r.differenza == null ? null : Number(r.differenza)),
      render: (r) =>
        r.differenza == null ? '' : Number(r.differenza) === 0 ? <span className="positivo">0</span> : <span className={`diff-riga ${Number(r.differenza) < 0 ? 'negativo' : 'positivo'}`}>{segno(r.differenza)}</span>,
    },
    {
      chiave: 'azioni', titolo: 'Azioni', ordinabile: false,
      render: (r) => {
        if (r.rettificata) return <Badge tono="verde">Rettificata: {nomeCausale(r.causale)}</Badge>;
        if (!aperto || !scrive) return r.qta_contata != null && Number(r.differenza) !== 0 ? <Badge tono="giallo">Non rettificata</Badge> : null;
        const serve = r.qta_contata != null && Number(r.differenza) !== 0;
        return (
          // Dentro la riga selezionabile: clic e tasti non devono selezionarla.
          <span className="righe-bottoni" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Button variante="tenue" onClick={() => { setContando(r); setQuantita(''); }}>{r.qta_contata == null ? 'Conta' : 'Riconta'}</Button>
            {serve && (
              <>
                <Suggerimento testo={testoAiuto('causale_rettifica')}>
                  <select className="sel-tab" aria-label={`Causale per ${r.matricola}`} value={causali[r.id] ?? 'conteggio'} onChange={(e) => setCausali({ ...causali, [r.id]: e.target.value })}>
                    {CAUSALI.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Suggerimento>
                <Button variante="accento" disabled={rettifica.isPending} onClick={() => rettifica.mutate({ p_riga: r.id, p_causale: causali[r.id] ?? 'conteggio' })}>Rettifica</Button>
              </>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <div className="intestazione">
        <h1>
          Inventario
        </h1>
        {scrive && <Button variante="accento" onClick={() => { setNome(`Inventario del ${data(new Date())}`); setNuovo(true); }}>Nuovo inventario</Button>}
      </div>
      <p className="spiegazione">
        Qui si confronta ciò che il sistema dice di avere con ciò che c'è sullo scaffale. Il magazzino è simulato: il "fisico" non esiste davvero.
        Con "Conta" scopri la quantità fisica simulata dell'esercitazione, oppure scrivi tu la quantità che hai contato. Se c'è differenza, scegli la causa e rettifica: il sistema si allinea.
      </p>

      {elenco.isError ? (
        <p className="errore" role="alert">{messaggioErrore(elenco.error)}</p>
      ) : elenco.isLoading ? (
        <p className="muto">Caricamento...</p>
      ) : !elenco.data?.length ? (
        <EmptyState titolo="Nessun inventario" testo={scrive ? 'Aprine uno: viene fotografata la giacenza di sistema di ogni articolo.' : 'Il tuo ruolo non può aprire inventari.'} azione={scrive ? <Button onClick={() => { setNome(`Inventario del ${data(new Date())}`); setNuovo(true); }}>Nuovo inventario</Button> : undefined} />
      ) : (
        <>
          <div className="elenco-inv" role="group" aria-label="Inventari">
            {elenco.data.map((i) => (
              <button key={i.id} type="button" aria-pressed={i.id === inv?.id} onClick={() => { setScelto(i.id); setNota(null); }}>
                {i.nome} ({i.stato === 'aperto' ? 'aperto' : 'chiuso'})
              </button>
            ))}
          </div>

          {inv && (
            <>
              <div className="righe-bottoni" style={{ marginBottom: 16 }}>
                <Badge tono={aperto ? 'blu' : 'grigio'}>{aperto ? 'Aperto' : 'Chiuso'}</Badge>
                <span>{inv.n_contate} righe contate su {inv.n_righe} · {inv.n_rettificate} rettificate</span>
                <span className="muto">{aperto ? `aperto il ${dataOra(inv.created_at)}` : `chiuso il ${dataOra(inv.chiuso_il)}`}</span>
                {aperto && scrive && (
                  <Button variante="tenue" disabled={daContare > 0 || chiudi.isPending} onClick={() => chiudi.mutate({ p_inventario: inv.id }, { onSuccess: (r) => setNota(r) })}>
                    Chiudi inventario
                  </Button>
                )}
              </div>
              {aperto && scrive && daContare > 0 && <p className="muto">Per chiudere servono tutte le righe contate: ne mancano {daContare}.</p>}
              {nota && (
                <div className={`avviso ${nota.non_rettificate.length ? '' : 'ok-box'}`} role="status">
                  <h3>Inventario chiuso</h3>
                  <p>{nota.rettificate} righe rettificate su {nota.righe}.</p>
                  {nota.non_rettificate.length > 0 && (
                    <p>Differenze lasciate senza rettifica (il sistema non è cambiato): {nota.non_rettificate.map((x) => `${x.matricola} (${segno(x.differenza)})`).join(', ')}.</p>
                  )}
                </div>
              )}
              <DataTable righe={inv.righe} colonne={colonne} rigaId={(r) => r.id} vuoto={<EmptyState titolo="Nessuna riga" testo="Il magazzino non aveva giacenze quando l'inventario è stato aperto." />} />
            </>
          )}
        </>
      )}

      <Dialog aperto={nuovo} titolo="Nuovo inventario" onChiudi={() => setNuovo(false)}>
        <form onSubmit={apriNuovo}>
          <Field label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          <div className="dialog-azioni">
            <Button variante="tenue" onClick={() => setNuovo(false)}>Annulla</Button>
            <Button type="submit" variante="accento" disabled={!nome.trim() || apri.isPending}>Apri</Button>
          </div>
        </form>
      </Dialog>

      <Dialog aperto={!!contando} titolo={contando ? `Conta ${contando.matricola}` : 'Conta'} onChiudi={chiudiConta}>
        <p>{contando?.descrizione}. Il sistema dice <strong>{contando ? qta(contando.qta_sistema) : ''}</strong>.</p>
        <p className="muto">Il fisico è simulato: "Rivela il fisico" mostra la quantità reale inventata dallo scenario. Se questa riga non ne ha una, scrivi tu la quantità.</p>
        <form onSubmit={(e) => { e.preventDefault(); eseguiConta(quantita); }}>
          <Field label="Quantità contata" inputMode="decimal" value={quantita} onChange={(e) => setQuantita(e.target.value)} />
          <div className="dialog-azioni">
            <Button variante="tenue" onClick={chiudiConta}>Annulla</Button>
            <Button variante="tenue" aiuto="inventario_fisico" disabled={conta.isPending} onClick={() => eseguiConta(null)}>Rivela il fisico</Button>
            <Button type="submit" variante="accento" disabled={conta.isPending || quantita.trim() === '' || isNaN(Number(quantita.replace(',', '.')))}>Registra quantità</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
