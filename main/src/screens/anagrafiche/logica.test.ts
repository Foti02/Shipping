import { describe, expect, it } from 'vitest';
import { avvisi, datiPerSalva, errori, filtra, ibanValido, moduloDa, righeCsv, type Anagrafica } from './logica';

const base = (o: Partial<Anagrafica>): Anagrafica => ({
  id: '1', tipo: 'cliente', codice: null, ragione_sociale: 'X', indirizzo: null, comune: null, email: null, sito_web: null, banca: null,
  iban: null, cod_fisc: null, p_iva: null, telefono: null, cellulare: null, sconto_perc: 0, lead_time_giorni: 3, note: null, ...o,
});

describe('validazioni', () => {
  it('campi vuoti: nessun avviso', () => expect(avvisi(moduloDa())).toEqual({}));
  it('avvisa su e-mail, IBAN, P.IVA, CF errati', () => {
    const a = avvisi({ ...moduloDa(), email: 'rossi@', iban: 'IT12', p_iva: '123', cod_fisc: 'ABC' });
    expect(Object.keys(a).sort()).toEqual(['cod_fisc', 'email', 'iban', 'p_iva']);
  });
  it('accetta valori corretti', () => {
    const a = avvisi({ ...moduloDa(), email: 'a@b.it', iban: 'IT60 X054 2811 1010 0000 0123 456', p_iva: '12345678901', cod_fisc: 'RSSMRA80A01H501U' });
    expect(a).toEqual({});
    expect(avvisi({ ...moduloDa(), cod_fisc: '12345678901' })).toEqual({});
  });
  it('IBAN italiano deve avere 27 caratteri', () => {
    expect(ibanValido('IT60X0542811101000000123456')).toBe(true);
    expect(ibanValido('IT60X05428111010000001234')).toBe(false);
    expect(ibanValido('DE89370400440532013000')).toBe(true);
  });
  it('blocca solo ragione sociale, sconto e giorni', () => {
    expect(errori(moduloDa(), false).ragione_sociale).toBeDefined();
    expect(errori({ ...moduloDa(), ragione_sociale: 'A', sconto_perc: '120' }, false).sconto_perc).toBeDefined();
    expect(errori({ ...moduloDa(), ragione_sociale: 'A', lead_time_giorni: '-1' }, true).lead_time_giorni).toBeDefined();
    expect(errori({ ...moduloDa(), ragione_sociale: 'A', lead_time_giorni: '-1' }, false)).toEqual({});
  });
});

describe('datiPerSalva', () => {
  it('crea: tipo, vuoti a null, sconto con virgola', () => {
    const d = datiPerSalva({ ...moduloDa(), ragione_sociale: ' Rossi ', sconto_perc: '2,5' }, 'cliente');
    expect(d).toMatchObject({ tipo: 'cliente', ragione_sociale: 'Rossi', sconto_perc: 2.5, codice: null });
    expect(d).not.toHaveProperty('lead_time_giorni');
  });
  it('modifica: id al posto del tipo; fornitore manda i giorni', () => {
    const d = datiPerSalva({ ...moduloDa(), ragione_sociale: 'F', lead_time_giorni: '7' }, 'fornitore', 'abc');
    expect(d).toMatchObject({ id: 'abc', lead_time_giorni: 7 });
    expect(d).not.toHaveProperty('tipo');
  });
});

describe('filtra', () => {
  const r = [
    base({ id: '1', ragione_sociale: 'Società È', comune: 'Roma' }),
    base({ id: '2', tipo: 'fornitore', ragione_sociale: 'Logi', p_iva: '12345678901' }),
  ];
  it('per tipo', () => expect(filtra(r, 'fornitore', '').map((x) => x.id)).toEqual(['2']));
  it('ignora accenti e maiuscole', () => expect(filtra(r, 'tutti', 'societa e').map((x) => x.id)).toEqual(['1']));
  it('cerca anche in partita IVA', () => expect(filtra(r, 'tutti', '4567').map((x) => x.id)).toEqual(['2']));
});

it('righeCsv espone le colonne leggibili', () => expect(righeCsv([base({ tipo: 'fornitore' })])[0].Tipo).toBe('Fornitore'));
