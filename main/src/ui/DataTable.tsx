import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { EmptyState } from './EmptyState';

export interface Colonna<T> {
  chiave: string;
  titolo: string;
  /** Cosa mostrare nella cella (default: `riga[chiave]`). */
  render?: (riga: T) => ReactNode;
  /** Valore usato per ordinare (default: `riga[chiave]`). */
  valore?: (riga: T) => string | number | null | undefined;
  allinea?: 'destra';
  /** false per disattivare l'ordinamento al clic (default true). */
  ordinabile?: boolean;
}

interface Props<T> {
  righe: T[];
  colonne: Colonna<T>[];
  rigaId: (riga: T) => string;
  /** Pannello sotto la tabella con la riga selezionata (come S01/S02). */
  dettaglio?: (riga: T) => ReactNode;
  onSeleziona?: (riga: T | null) => void;
  vuoto?: ReactNode;
}

const collator = new Intl.Collator('it', { numeric: true, sensitivity: 'base' });

/** Ordina una copia: numeri come numeri, testi in ordine italiano naturale, vuoti sempre in fondo. */
export function ordina<T>(righe: T[], val: (r: T) => string | number | null | undefined, verso: 1 | -1): T[] {
  return [...righe].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const nx = x == null || x === '';
    const ny = y == null || y === '';
    if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
    return c * verso;
  });
}

export function DataTable<T>({ righe, colonne, rigaId, dettaglio, onSeleziona, vuoto }: Props<T>) {
  const [ord, setOrd] = useState<{ chiave: string; verso: 1 | -1 } | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const visibili = useMemo(() => {
    const c = colonne.find((x) => x.chiave === ord?.chiave);
    if (!ord || !c) return righe;
    return ordina(righe, c.valore ?? ((r) => (r as Record<string, never>)[c.chiave]), ord.verso);
  }, [righe, colonne, ord]);

  const scelta = visibili.find((r) => rigaId(r) === sel) ?? null;
  const scegli = (r: T) => {
    const nuova = scelta && rigaId(scelta) === rigaId(r) ? null : r;
    setSel(nuova ? rigaId(nuova) : null);
    onSeleziona?.(nuova);
  };
  const tasto = (e: KeyboardEvent, r: T) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      scegli(r);
    }
  };

  if (righe.length === 0) return <>{vuoto ?? <EmptyState titolo="Nessun elemento" />}</>;
  return (
    <div className="dt">
      <div className="dt-scroll">
        <table>
          <thead>
            <tr>
              {colonne.map((c) => {
                const ordinabile = c.ordinabile !== false;
                const attiva = ord?.chiave === c.chiave;
                return (
                  <th key={c.chiave} className={c.allinea} aria-sort={attiva ? (ord!.verso === 1 ? 'ascending' : 'descending') : undefined}>
                    {ordinabile ? (
                      <button type="button" onClick={() => setOrd(attiva && ord!.verso === 1 ? { chiave: c.chiave, verso: -1 } : { chiave: c.chiave, verso: 1 })}>
                        {c.titolo}
                        <span aria-hidden="true">{attiva ? (ord!.verso === 1 ? ' ▲' : ' ▼') : ''}</span>
                      </button>
                    ) : (
                      c.titolo
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibili.map((r) => {
              const id = rigaId(r);
              return (
                <tr key={id} tabIndex={0} aria-selected={id === sel} className={id === sel ? 'sel' : undefined} onClick={() => scegli(r)} onKeyDown={(e) => tasto(e, r)}>
                  {colonne.map((c) => (
                    <td key={c.chiave} className={c.allinea}>
                      {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.chiave] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {dettaglio && scelta && <section className="dt-dettaglio">{dettaglio(scelta)}</section>}
    </div>
  );
}
