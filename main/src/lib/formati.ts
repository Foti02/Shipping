// useGrouping true = sempre: it-IT di suo non mette il punto sotto le cinque cifre (1234,56).
const fEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: true });
const fQta = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3, useGrouping: true });
const fData = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fDataOra = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Centesimi -> "1.234,56 €" (con spazio non divisibile prima del simbolo). */
// + 0 trasforma -0 in 0: senza, una ritenuta nulla si vedrebbe come "-0,00 €".
export const euro = (cent: number | string | null | undefined) => fEuro.format(Number(cent ?? 0) / 100 + 0);

/** Quantita' in formato italiano, fino a 3 decimali: 1234.5 -> "1.234,5". */
export const qta = (n: number | string | null | undefined) => fQta.format(Number(n ?? 0));

// "2026-11-06" (colonna date) va letta come giorno locale: new Date() la sposterebbe in UTC.
const comeData = (d: Date | string) => {
  if (d instanceof Date) return d;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
};

/** Data it-IT "06/11/2026"; vuoto se assente o non valida. */
export function data(d: Date | string | null | undefined): string {
  if (!d) return '';
  const x = comeData(d);
  return isNaN(+x) ? '' : fData.format(x);
}

/** Data e ora it-IT "06/11/2026, 13:42". */
export function dataOra(d: Date | string | null | undefined): string {
  if (!d) return '';
  const x = comeData(d);
  return isNaN(+x) ? '' : fDataOra.format(x);
}
