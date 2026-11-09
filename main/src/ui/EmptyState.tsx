import type { ReactNode } from 'react';

export function EmptyState({ titolo, testo, azione }: { titolo: string; testo?: string; azione?: ReactNode }) {
  return (
    <div className="vuoto">
      <h3>{titolo}</h3>
      {testo && <p>{testo}</p>}
      {azione}
    </div>
  );
}
