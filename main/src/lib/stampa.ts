// Stampa e CSV senza dipendenze: la stampa usa il dialogo del browser (che offre anche "Salva come PDF").

const csvCella = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Scarica un CSV (separatore ";" e BOM, cosi' Excel italiano lo apre bene). */
export function scaricaCsv(nomeFile: string, righe: Record<string, unknown>[]) {
  if (righe.length === 0) return;
  const colonne = Object.keys(righe[0]);
  const testo = [colonne, ...righe.map((r) => colonne.map((c) => r[c]))].map((r) => r.map(csvCella).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + testo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile.endsWith('.csv') ? nomeFile : `${nomeFile}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Apre il dialogo di stampa. Gli elementi con classe "no-stampa" non compaiono (vedi ui.css). */
export function stampa() {
  window.print();
}
