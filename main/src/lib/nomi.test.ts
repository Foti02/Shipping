import { expect, test } from 'vitest';
import { formattaNome, usernameDa, validaNominativo, validaNominativoUnico } from './nomi';

const ok = (n: string, c: string, u = usernameDa(n, c)) => expect(validaNominativo(n, c, u), `${n} ${c}`).toEqual({ nome: undefined, cognome: undefined, username: undefined });
const no = (n: string, c: string, campo: 'nome' | 'cognome' | 'username') => expect(validaNominativo(n, c, usernameDa(n, c))[campo], `${n} ${c}`).toBeDefined();

test('nomi veri: accenti, apostrofi, particelle, nomi composti', () => {
  ok('Francesco', 'Foti');
  ok('Niccolò', "D'Angelo");
  ok('Maria Grazia', 'De Luca');
  ok('Anna-Maria', 'Cazzola'); // Cazzola e' un cognome vero: le parole vietate valgono solo intere
  ok('Marco', 'Gatto'); // un oggetto/animale come cognome e' ammesso
  expect(usernameDa('Niccolò', "D'Angelo")).toBe('niccolo_dangelo');
  expect(usernameDa('Maria Grazia', 'De Luca')).toBe('maria_grazia_de_luca');
});

test('volgarita e offese rifiutate, anche con lettere ripetute e maiuscole', () => {
  no('Cazzo', 'Rossi', 'nome');
  no('CAZZZZO', 'Rossi', 'nome');
  no('Mario', 'Stronzo', 'cognome');
  no('Mario', 'Fuck', 'cognome');
  no('Hitler', 'Rossi', 'nome');
});

test('oggetti, prove e personaggi rifiutati come nome', () => {
  no('Tavolo', 'Rossi', 'nome');
  no('Pizza', 'Margherita', 'nome');
  no('Test', 'Prova', 'nome');
  no('Mario', 'Admin', 'cognome');
  no('Pippo', 'Rossi', 'nome');
});

test('non sono nomi: numeri, simboli, tastiera a caso, una lettera sola', () => {
  no('M4rio', 'Rossi', 'nome');
  no('Mario', 'Rossi!', 'cognome');
  no('Asdfgh', 'Rossi', 'nome');
  no('Mmmario', 'Rossi', 'nome');
  no('M', 'Rossi', 'nome');
  no('', 'Rossi', 'nome');
  no('Mario', '', 'cognome');
  no('李', '雷', 'nome');
});

test('nome account: formato nome_cognome, numero finale per gli omonimi, coerente col nome', () => {
  expect(validaNominativo('Mario', 'Rossi', 'mario_rossi2').username).toBeUndefined();
  for (const u of ['mario', 'Mario_Rossi', 'mario rossi', 'mario_rossi_', 'luigi_verdi', 'mario_rossi1234', `${'a'.repeat(41)}_b`]) {
    expect(validaNominativo('Mario', 'Rossi', u).username, u).toBeDefined();
  }
});

test('cambio nominativo: due parole, coerente con il nome account nel formato nuovo', () => {
  expect(validaNominativoUnico('Francesco Foti', 'francesco_foti')).toBeUndefined();
  expect(validaNominativoUnico('Niccolò D\'Angelo', 'niccolo_dangelo')).toBeUndefined();
  expect(validaNominativoUnico('Francesco', 'francesco_foti')).toBeDefined();
  expect(validaNominativoUnico('Franco Foti', 'francesco_foti')).toBeDefined();
  expect(validaNominativoUnico('Tavolo Rossi', 'tavolo_rossi')).toBeDefined();
  expect(validaNominativoUnico('Anna Bianchi', 'anna')).toBeUndefined(); // account vecchio: nessun legame
});

test('formattaNome: maiuscole giuste', () => {
  expect(formattaNome('  mario   DE luca ')).toBe('Mario De Luca');
  expect(formattaNome("d'angelo")).toBe("D'Angelo");
  expect(formattaNome('anna-maria')).toBe('Anna-Maria');
});
