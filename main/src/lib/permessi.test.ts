import { expect, test } from 'vitest';
import { eAdminGlobale, eDocenteGlobale, puoAzione, PERMESSI_RUOLO, type Azione, type Ruolo, type RuoloAziendale } from './permessi';

const TUTTE: Azione[] = ['articoli.scrivi', 'anagrafiche.scrivi', 'lotti_ubicazioni', 'carico', 'scarico', 'reso', 'trasferimento', 'inventario', 'ordine_fornitore', 'evadi_ordine', 'preventivo', 'ordine_cliente', 'spedizione', 'fattura', 'scadenze'];
const classe = (ruolo_aziendale: RuoloAziendale | null, ruolo: Ruolo['ruolo'] = 'studente'): Ruolo => ({ tipo: 'classe', ruolo, ruolo_aziendale });

test('magazzino personale, docente e jolly possono tutto', () => {
  for (const a of TUTTE) {
    expect(puoAzione({ tipo: 'personale', ruolo: 'studente', ruolo_aziendale: null }, a)).toBe(true);
    expect(puoAzione(classe('acquisti', 'docente'), a)).toBe(true);
    expect(puoAzione(classe(null), a)).toBe(true);
  }
});

test('matrice dei ruoli aziendali (sezione 4 del contratto)', () => {
  expect([...PERMESSI_RUOLO.magazziniere].sort()).toEqual(['carico', 'scarico', 'reso', 'trasferimento', 'inventario', 'evadi_ordine', 'spedizione', 'lotti_ubicazioni', 'scadenze'].sort());
  expect(puoAzione(classe('magazziniere'), 'scarico')).toBe(true);
  expect(puoAzione(classe('magazziniere'), 'fattura')).toBe(false);
  expect(puoAzione(classe('acquisti'), 'ordine_fornitore')).toBe(true);
  expect(puoAzione(classe('acquisti'), 'evadi_ordine')).toBe(true); // come nel database (0006_scenari.sql)
  expect(puoAzione(classe('acquisti'), 'carico')).toBe(false);
  expect(puoAzione(classe('commerciale'), 'preventivo')).toBe(true);
  expect(puoAzione(classe('commerciale'), 'articoli.scrivi')).toBe(false);
  expect(puoAzione(classe('amministrazione'), 'fattura')).toBe(true);
  expect(puoAzione(classe('amministrazione'), 'inventario')).toBe(false);
  for (const r of Object.keys(PERMESSI_RUOLO) as RuoloAziendale[]) expect(puoAzione(classe(r), 'scadenze')).toBe(true);
});

test('l\'admin fa tutto sulle classi, anche con un ruolo aziendale che lo limiterebbe', () => {
  for (const r of Object.keys(PERMESSI_RUOLO) as RuoloAziendale[])
    for (const a of TUTTE) {
      expect(puoAzione({ ...classe(r), admin: true }, a)).toBe(true);
      expect(puoAzione({ ...classe(r), admin: false }, a)).toBe(PERMESSI_RUOLO[r].includes(a));
    }
});

test('ruoli globali: docente e admin usano l\'area docente, solo l\'admin l\'amministrazione', () => {
  expect((['studente', 'docente', 'admin'] as const).map(eDocenteGlobale)).toEqual([false, true, true]);
  expect((['studente', 'docente', 'admin'] as const).map(eAdminGlobale)).toEqual([false, false, true]);
  expect(eDocenteGlobale(undefined)).toBe(false);
  expect(eAdminGlobale(null)).toBe(false);
});
