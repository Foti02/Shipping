import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMagazzino } from '../context/magazzino';
import { useSessione } from '../context/sessione';
import { useApi, useMutazione } from '../lib/api';
import { messaggioErrore } from '../lib/errori';
import { stampa } from '../lib/stampa';
import { Badge, Button, DataTable, Dialog, EmptyState, Field, Select, useToast, type Colonna } from '../ui';
import type { ClasseDocente } from './Docente';
import './classe/classe.css';

interface Membro {
  user_id: string;
  username: string;
  nome: string;
  ruolo: 'docente' | 'studente';
  ruolo_aziendale: string | null;
  entrato_il: string;
}

const RUOLI = [
  { value: '', label: 'Jolly (può fare tutto)' },
  { value: 'magazziniere', label: 'Magazziniere' },
  { value: 'acquisti', label: 'Acquisti' },
  { value: 'commerciale', label: 'Commerciale' },
  { value: 'amministrazione', label: 'Amministrazione' },
];
const GIACENZA = [
  { value: 'si', label: 'Bloccata: non si può scaricare più di quanto c\'è' },
  { value: 'no', label: 'Consentita: la giacenza può andare sotto zero' },
];

type Pericolo = 'azzera' | 'elimina' | null;

export default function ImpostazioniClasse() {
  const m = useMagazzino();
  const { ricarica } = useSessione();
  const nav = useNavigate();
  const toast = useToast();
  const docente = m.tipo === 'classe' && m.ruolo === 'docente';
  const arg = { p_magazzino: m.id };

  const classi = useApi<ClasseDocente[]>('api_docente_classi', {}, { enabled: docente });
  const membri = useApi<Membro[]>('api_classe_membri', arg, { enabled: docente });
  const impostazioni = useApi<{ blocca_giacenza_negativa: boolean }>('api_magazzino_impostazioni', arg);
  const codice = useMutazione('api_classe_codice');
  const ruolo = useMutazione('api_classe_imposta_ruolo', { ok: 'Ruolo aggiornato' });
  const rimuovi = useMutazione('api_classe_rimuovi', { ok: 'Membro rimosso' });
  const giacenza = useMutazione('api_magazzino_impostazioni', { ok: 'Impostazione salvata' });
  const azzera = useMutazione('api_classe_azzera', { ok: 'Dati della classe azzerati' });
  const elimina = useMutazione('api_classe_elimina');

  const [grande, setGrande] = useState(false);
  const [daRimuovere, setDaRimuovere] = useState<Membro | null>(null);
  const [pericolo, setPericolo] = useState<Pericolo>(null);
  const [conferma, setConferma] = useState('');

  if (m.tipo !== 'classe') return <EmptyState titolo="Solo per le classi" testo="Il magazzino personale non ha un codice di ingresso né membri." />;
  if (!docente)
    return (
      <>
        <h1>Classe<span className="dot">.</span></h1>
        <EmptyState titolo="Solo il docente può gestire la classe" testo="Codice, membri, ruoli e cancellazione dei dati sono riservati al docente." />
        <p className="muto">
          Giacenza negativa: {impostazioni.data ? (impostazioni.data.blocca_giacenza_negativa ? 'bloccata' : 'consentita') : '...'}.
        </p>
      </>
    );

  const classe = classi.data?.find((c) => c.id === m.id);
  const cod = classe?.codice_ingresso ?? '------';
  const attivo = classe?.codice_attivo ?? false;
  const chiudiPericolo = () => { setPericolo(null); setConferma(''); };
  const confermaOk = conferma === m.nome;

  const copia = async () => {
    try {
      await navigator.clipboard.writeText(cod);
      toast('Codice copiato', 'ok');
    } catch {
      toast('Non riesco a copiare: selezionalo e copialo a mano.', 'errore');
    }
  };

  const eseguiPericolo = (e: FormEvent) => {
    e.preventDefault();
    if (pericolo === 'azzera') {
      azzera.mutate({ ...arg, p_conferma: conferma }, { onSuccess: () => { try { localStorage.removeItem(`shipping-scenari-${m.id}`); } catch { /* niente */ } chiudiPericolo(); } });
    } else {
      elimina.mutate(
        { ...arg, p_conferma: conferma },
        { onSuccess: async () => { chiudiPericolo(); toast('Classe eliminata', 'ok'); await ricarica(); nav('/', { replace: true }); } },
      );
    }
  };

  const colonne: Colonna<Membro>[] = [
    { chiave: 'username', titolo: 'Utente', render: (u) => <><strong>{u.username}</strong><br /><span className="muto">{u.nome}</span></> },
    { chiave: 'ruolo', titolo: 'Ruolo', render: (u) => (u.ruolo === 'docente' ? <Badge tono="blu">docente</Badge> : <Badge>studente</Badge>) },
    {
      chiave: 'ruolo_aziendale', titolo: 'Ruolo aziendale',
      render: (u) =>
        u.ruolo === 'docente' ? (
          <span className="muto">-</span>
        ) : (
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <select
              className="sel-tab"
              aria-label={`Ruolo aziendale di ${u.username}`}
              value={u.ruolo_aziendale ?? ''}
              disabled={ruolo.isPending}
              onChange={(e) => ruolo.mutate({ ...arg, p_user: u.user_id, p_ruolo_aziendale: e.target.value || null })}
            >
              {RUOLI.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </span>
        ),
    },
    {
      chiave: 'azioni', titolo: '', ordinabile: false,
      render: (u) =>
        u.ruolo === 'studente' ? (
          <Button variante="tenue" aria-label={`Rimuovi ${u.username} dalla classe`} onClick={(e) => { e.stopPropagation(); setDaRimuovere(u); }}>Rimuovi</Button>
        ) : null,
    },
  ];

  return (
    <>
      <div className="no-stampa">
        <h1>Classe: {m.nome}<span className="dot">.</span></h1>

        <section className="pannello" aria-labelledby="h-codice">
          <h2 id="h-codice">Codice di ingresso</h2>
          <p className="muto">Gli studenti lo scrivono in "Entra con codice". Finché è attivo, chiunque lo conosca può entrare.</p>
          <div>
            <span className={`codice-grande ${attivo ? '' : 'codice-spento'}`} aria-label={`Codice ${cod.split('').join(' ')}`}>{cod}</span>{' '}
            {attivo ? <Badge tono="verde">attivo</Badge> : <Badge tono="grigio">disattivato</Badge>}
          </div>
          {classi.isError && <p className="errore" role="alert">{messaggioErrore(classi.error)}</p>}
          <div className="righe-bottoni">
            <Button onClick={copia} disabled={!classe}>Copia</Button>
            <Button variante="tenue" onClick={() => setGrande(true)} disabled={!classe}>Mostra in grande</Button>
            <Button variante="tenue" onClick={stampa} disabled={!classe}>Stampa</Button>
            <Button variante="tenue" disabled={codice.isPending} onClick={() => codice.mutate({ ...arg, p_azione: attivo ? 'disattiva' : 'attiva' })}>
              {attivo ? 'Disattiva codice' : 'Attiva codice'}
            </Button>
            <Button variante="tenue" disabled={codice.isPending} onClick={() => codice.mutate({ ...arg, p_azione: 'rigenera' }, { onSuccess: () => toast('Nuovo codice generato: il vecchio non vale più.', 'ok') })}>
              Rigenera
            </Button>
          </div>
        </section>

        <section className="sezione" aria-labelledby="h-membri">
          <h2 id="h-membri">Membri</h2>
          <p className="spiegazione">Il ruolo aziendale decide quali azioni vede lo studente (Jolly: tutte). Gli scenari assegnano compiti secondo il ruolo.</p>
          {membri.isError ? (
            <p className="errore" role="alert">{messaggioErrore(membri.error)}</p>
          ) : (
            <DataTable righe={membri.data ?? []} colonne={colonne} rigaId={(u) => u.user_id} vuoto={<EmptyState titolo="Nessun membro" />} />
          )}
        </section>

        <section className="sezione" aria-labelledby="h-imp">
          <h2 id="h-imp">Impostazioni del magazzino</h2>
          <div className="pannello">
            <Select
              label="Giacenza negativa"
              opzioni={GIACENZA}
              value={impostazioni.data ? (impostazioni.data.blocca_giacenza_negativa ? 'si' : 'no') : 'si'}
              disabled={!impostazioni.data || giacenza.isPending}
              onChange={(e) => giacenza.mutate({ ...arg, p_blocca_giacenza_negativa: e.target.value === 'si' })}
              aiuto="Con il blocco attivo uno scarico oltre la giacenza viene rifiutato."
            />
          </div>
        </section>

        <section className="sezione" aria-labelledby="h-pericolo">
          <h2 id="h-pericolo">Zona pericolosa</h2>
          <div className="pericolo">
            <h3>Azzera i dati della classe</h3>
            <p>Cancella articoli, giacenze, movimenti, documenti, anagrafiche, ubicazioni, lotti, scadenze, inventari, scenari e compiti, notifiche e registro delle attività. La numerazione dei documenti riparte da 1. Restano la classe, il codice, i membri con i loro ruoli e i dati azienda.</p>
            <Button variante="pericolo" onClick={() => setPericolo('azzera')}>Azzera dati</Button>
          </div>
          <div className="pericolo">
            <h3>Elimina la classe</h3>
            <p>Cancella tutto: i dati sopra, ma anche i membri e la classe stessa. Gli studenti restano con il loro magazzino personale. Non si può annullare.</p>
            <Button variante="pericolo" onClick={() => setPericolo('elimina')}>Elimina classe</Button>
          </div>
        </section>
      </div>

      <section className="solo-stampa" aria-hidden="true">
        <h1>Classe: {m.nome}</h1>
        <p>Per entrare scrivi questo codice in "Entra con codice":</p>
        <div className="codice-proiettato">{cod}</div>
      </section>

      <Dialog aperto={grande} titolo={`Codice della classe ${m.nome}`} onChiudi={() => setGrande(false)}>
        <div className="codice-proiettato" aria-label={`Codice ${cod.split('').join(' ')}`}>{cod}</div>
        <div className="dialog-azioni">
          <Button variante="tenue" onClick={() => setGrande(false)}>Chiudi</Button>
        </div>
      </Dialog>

      <Dialog aperto={!!daRimuovere} titolo="Rimuovi dalla classe" onChiudi={() => setDaRimuovere(null)}>
        <p>
          <strong>{daRimuovere?.username}</strong> perde l'accesso a questa classe e ai suoi compiti. Potrà rientrare solo con il codice. Il suo magazzino personale non viene toccato.
        </p>
        <div className="dialog-azioni">
          <Button variante="tenue" onClick={() => setDaRimuovere(null)}>Annulla</Button>
          <Button variante="pericolo" disabled={rimuovi.isPending} onClick={() => rimuovi.mutate({ ...arg, p_user: daRimuovere!.user_id }, { onSuccess: () => setDaRimuovere(null) })}>
            Rimuovi
          </Button>
        </div>
      </Dialog>

      <Dialog aperto={pericolo !== null} titolo={pericolo === 'azzera' ? 'Azzera i dati' : 'Elimina la classe'} onChiudi={chiudiPericolo}>
        <form onSubmit={eseguiPericolo}>
          <p>
            {pericolo === 'azzera'
              ? 'Verranno cancellati tutti i dati di lavoro della classe (articoli, documenti, movimenti, anagrafiche, scenari, compiti, registro). I membri restano.'
              : 'Verranno cancellati tutti i dati, i membri e la classe stessa.'}{' '}
            <strong>Non si può annullare.</strong>
          </p>
          <Field label={`Per confermare scrivi il nome della classe: ${m.nome}`} value={conferma} onChange={(e) => setConferma(e.target.value)} autoComplete="off" spellCheck={false} />
          <div className="dialog-azioni">
            <Button variante="tenue" onClick={chiudiPericolo}>Annulla</Button>
            <Button type="submit" variante="pericolo" disabled={!confermaOk || azzera.isPending || elimina.isPending}>
              {pericolo === 'azzera' ? 'Azzera dati' : 'Elimina classe'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
