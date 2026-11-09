import { expect, test } from 'vitest';
import { Lexer } from 'marked';
import { assegnaId, leggiManuale, slug } from './manuale.mjs';

test('slug toglie accenti e punteggiatura', () => {
  expect(slug("Installare l'app sul computer")).toBe('installare-l-app-sul-computer');
  expect(slug('Ordini ai fornitori e merce in arrivo')).toBe('ordini-ai-fornitori-e-merce-in-arrivo');
});

test('id dei titoli: capitoli senza lettera, sezioni ripetute col prefisso del capitolo, nessun doppione', () => {
  const t = new Lexer().lex('## A. Accesso\n### Passaggi\n## B. Articoli\n### Passaggi\n## Glossario\n### Passaggi');
  assegnaId(t);
  expect(t.filter((x) => x.type === 'heading').map((x) => x.id)).toEqual(['accesso', 'a-passaggi', 'articoli', 'b-passaggi', 'glossario', 'glossario-passaggi']);
});

test('la versione del manuale segue package.json e la copertina esce dal corpo', () => {
  const m = leggiManuale("# Shipping ERP: manuale d'uso\n\nVersione 0.0.1\n\nPowered by Francesco Foti · ITS Team Innovazione\n\n## A chi serve\n", '1.2.3');
  expect(m.md).toContain('Versione 1.2.3');
  expect(m.prodotto).toBe('Shipping ERP');
  expect(m.sottotitolo).toBe("Manuale d'uso");
  expect(m.corpo.trim()).toBe('## A chi serve');
});
