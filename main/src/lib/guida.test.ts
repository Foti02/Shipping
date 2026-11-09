import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { guidaHref } from './guida';

const indice: { id: string }[] = JSON.parse(readFileSync(new URL('../../public/manuale/indice.json', import.meta.url), 'utf8'));

describe('guidaHref', () => {
  test.each([
    ['/', '/guida/accesso-e-primo-ingresso'],
    ['/accedi', '/guida/accesso-e-primo-ingresso'],
    ['/m/abc/articoli', '/guida/articoli-carichi-e-scarichi'],
    ['/m/abc/documenti/preventivo', '/guida/preventivi-ordini-cliente-ddt-e-fatture-di-vendita'],
    ['/m/abc/documenti/fattura_vendita', '/guida/preventivi-ordini-cliente-ddt-e-fatture-di-vendita'],
    ['/m/abc/documenti/ordine_fornitore', '/guida/ordini-ai-fornitori-e-merce-in-arrivo'],
    ['/m/abc/documenti/carico', '/guida/ordini-ai-fornitori-e-merce-in-arrivo'],
    ['/m/abc/anagrafiche', '/guida/anagrafiche-dati-azienda-e-agenda'],
    ['/m/abc/agenda', '/guida/anagrafiche-dati-azienda-e-agenda'],
    ['/m/abc/inventario', '/guida/inventario'],
    ['/m/abc/analisi', '/guida/analisi-riordino-kpi-e-valorizzazione'],
    ['/m/abc/classe', '/guida/area-docente-classi-ruoli-scenari-e-controllo'],
    ['/docente', '/guida/area-docente-classi-ruoli-scenari-e-controllo'],
    ['/docente/xyz', '/guida/area-docente-classi-ruoli-scenari-e-controllo'],
    ['/m/abc/compiti', '/guida/esercitazione-di-gruppo-compiti-scorta-condivisa-e-riordino'],
    ['/m/abc/attivita?x=1', '/guida/esercitazione-di-gruppo-compiti-scorta-condivisa-e-riordino'],
    ['/m/abc', '/guida'],
    ['/m/abc/documenti/boh', '/guida'],
    ['/guida/glossario', '/guida'],
  ])('%s -> %s', (da, a) => expect(guidaHref(da)).toBe(a));

  test('ogni sezione indicata esiste nel manuale', () => {
    const ids = new Set(indice.map((s) => s.id));
    for (const p of ['/', '/m/a/articoli', '/m/a/documenti/preventivo', '/m/a/documenti/carico', '/m/a/anagrafiche', '/m/a/inventario', '/m/a/analisi', '/m/a/classe', '/m/a/compiti'])
      expect(ids.has(guidaHref(p).replace('/guida/', ''))).toBe(true);
  });
});
