// Calcolo righe e totali: stessa formula di _ricalcola_documento (0004_documenti.sql, contratto sez. 3).
// Aritmetica intera con BigInt: i numeric di Postgres sono esatti, i float no (1.005 * 100 = 100.49999...).

export interface RigaCalc {
  qta: number;
  prezzo_cent: number;
  sconto_perc: number;
  iva_perc: number;
  inps_perc?: number;
  ritenuta_perc?: number;
}

export interface Totali {
  imponibile_cent: number;
  imposta_cent: number;
  inps_cent: number;
  ritenuta_cent: number;
  totale_cent: number;
}

/** Interi scalati: quantita' a 3 decimali, percentuali a 2 (come numeric(14,3) e numeric(5,2)). */
const sc = (n: number, dec: number) => BigInt(Math.round((Number.isFinite(n) ? n : 0) * 10 ** dec));

/** num / den arrotondato "lontano da zero" sui mezzi, come round() di Postgres su numeric. */
function dividiArrotonda(num: bigint, den: bigint): bigint {
  const neg = num < 0n;
  const a = neg ? -num : num;
  const q = (2n * a + den) / (2n * den);
  return neg ? -q : q;
}

/** netto = round(qta * prezzo * (1 - sconto/100)) */
export function nettoRiga(r: Pick<RigaCalc, 'qta' | 'prezzo_cent' | 'sconto_perc'>): number {
  const num = sc(r.prezzo_cent, 0) * sc(r.qta, 3) * (10000n - sc(r.sconto_perc, 2));
  return Number(dividiArrotonda(num, 10_000_000n));
}

const percentuale = (netto: number, perc: number | undefined) => Number(dividiArrotonda(BigInt(netto) * sc(perc ?? 0, 2), 10000n));

/** imposta = round(netto * iva/100) */
export const impostaRiga = (r: RigaCalc) => percentuale(nettoRiga(r), r.iva_perc);

/** Totale della riga (netto + imposta): righe_documento.totale_cent. */
export const totaleRiga = (r: RigaCalc) => nettoRiga(r) + impostaRiga(r);

/** Totale = imponibile + imposta + INPS - ritenuta, sommando per riga i valori gia' arrotondati. */
export function calcolaTotali(righe: RigaCalc[]): Totali {
  let imponibile = 0, imposta = 0, inps = 0, ritenuta = 0;
  for (const r of righe) {
    const n = nettoRiga(r);
    imponibile += n;
    imposta += percentuale(n, r.iva_perc);
    inps += percentuale(n, r.inps_perc);
    ritenuta += percentuale(n, r.ritenuta_perc);
  }
  return { imponibile_cent: imponibile, imposta_cent: imposta, inps_cent: inps, ritenuta_cent: ritenuta, totale_cent: imponibile + imposta + inps - ritenuta };
}

/** "4,20" o "4.20" -> 4.2; vuoto o non valido -> 0. */
export function numero(testo: string): number {
  const n = Number(testo.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Euro digitati ("4,20") -> centesimi interi. */
export const euroInCent = (testo: string) => Math.round(numero(testo) * 100);

/** Centesimi -> testo da campo ("420" -> "4,20"). */
export const centInEuro = (cent: number) => (cent / 100).toFixed(2).replace('.', ',');
