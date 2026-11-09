import { useEffect, useState } from 'react';
import { useApi } from '../../lib/api';
import { dataOra } from '../../lib/formati';
import { scaricaCsv, stampa } from '../../lib/stampa';
import { Button } from '../../ui';
import { dettaglioAttivita, etichettaAzione, tempoRelativo } from './logica';
import './classe.css';

/** Ora corrente che si aggiorna da sola: serve a far scorrere i "3 minuti fa" tra un polling e l'altro. */
export function useAdesso(ms = 5000) {
  const [adesso, setAdesso] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAdesso(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return adesso;
}

export function Pallino({ online }: { online: boolean }) {
  return (
    <span className="stato-presenza">
      <span className={`pallino ${online ? 'on' : ''}`} aria-hidden="true" />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

/** Barra con il testo "x di y" per i lettori di schermo. */
export function Barra({ valore, totale, etichetta }: { valore: number; totale: number; etichetta: string }) {
  const p = totale > 0 ? Math.round((100 * valore) / totale) : 0;
  return (
    <div className="barra" role="progressbar" aria-label={etichetta} aria-valuemin={0} aria-valuemax={totale} aria-valuenow={valore}>
      <span style={{ width: `${p}%` }} />
    </div>
  );
}

export interface RigaAttivita {
  id: number;
  azione: string;
  entita: string;
  entita_id: string | null;
  dettagli: unknown;
  created_at: string;
  user_id: string | null;
  username: string | null;
}

/** Registro incrementale: la prima chiamata prende le ultime `limite` righe, poi ogni 5 s solo quelle con id maggiore. */
export function useRegistro(magazzino: string, limite = 50) {
  const [righe, setRighe] = useState<RigaAttivita[]>([]);
  const ultimo = righe.length ? Math.max(...righe.map((r) => Number(r.id))) : null;
  const q = useApi<RigaAttivita[]>('api_attivita', { p_magazzino: magazzino, p_dopo_id: ultimo, p_limite: ultimo == null ? limite : 200 }, { poll: 5000 });
  useEffect(() => {
    const nuove = q.data;
    if (!nuove?.length) return;
    setRighe((vecchie) => {
      const noti = new Set(vecchie.map((r) => r.id));
      return [...nuove.filter((r) => !noti.has(r.id)), ...vecchie].slice(0, 500);
    });
  }, [q.data]);
  return { righe, errore: q.error, caricamento: q.isLoading };
}

export function RegistroLista({ righe }: { righe: RigaAttivita[] }) {
  const adesso = useAdesso();
  if (!righe.length) return <p className="muto">Ancora nessuna attività.</p>;
  return (
    <ul className="registro" aria-label="Registro delle attività">
      {righe.map((r) => (
        <li key={r.id}>
          <time dateTime={r.created_at} title={dataOra(r.created_at)}>{tempoRelativo(r.created_at, adesso)}</time>
          <span className="chi">{r.username ?? 'sistema'}</span>
          <span>
            {etichettaAzione(r.azione)} <span className="dett">{dettaglioAttivita(r.dettagli)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "Esporta CSV" e "Stampa" della scheda corrente. */
export function AzioniScheda({ nomeFile, righe }: { nomeFile: string; righe: Record<string, unknown>[] }) {
  return (
    <div className="righe-bottoni no-stampa" style={{ marginBottom: 16 }}>
      <Button variante="tenue" onClick={() => scaricaCsv(nomeFile, righe)} disabled={righe.length === 0}>
        Esporta CSV
      </Button>
      <Button variante="tenue" onClick={stampa}>
        Stampa
      </Button>
    </div>
  );
}

/** Numero con virgola decimale per i CSV (Excel italiano). */
export const numCsv = (n: number | string | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
/** Centesimi -> "12,34" per i CSV. */
export const euroCsv = (c: number | string | null | undefined) => (c == null ? '' : (Number(c) / 100).toFixed(2).replace('.', ','));
