// Controllo di nome, cognome e nome account ("nome_cognome"). Logica pura, testata in nomi.test.ts.
// shortcut: il controllo e' nell'app (l'API non lo ripete) e le liste sono finite: una parola creativa fuori elenco passa.
// Se serve di piu', spostare le liste in una tabella del database e controllarle li'.

export const USERNAME_NUOVO = /^[a-z]+(_[a-z]+)+[0-9]{0,3}$/;
export const USERNAME_NUOVO_MAX = 40;
export const MSG_USERNAME_NUOVO = 'Nel formato nome_cognome: lettere minuscole senza accenti, separate da _ (es. mario_rossi). Se esiste un omonimo aggiungi un numero (mario_rossi2).';

const senzaAccenti = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');
/** Minuscole senza accenti, senza doppie: "Cazzzo" e "cazo" diventano uguali. */
const chiave = (s: string) => senzaAccenti(s).toLowerCase().replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
const elenco = (s: string) => new Set(s.split(/\s+/).filter(Boolean).map(chiave));

// Volgarita', insulti, offese e contenuti inadatti (italiano e inglese). Solo parole intere: "Cazzola" resta un cognome valido.
const VIETATE = elenco(`
cazzo cazzi cazzone cazzata minchia minchione merda merdoso stronzo stronza stronzi culo culi culone fica figa fighe puttana puttane puttanone
troia troie zoccola mignotta bagascia baldracca bastardo bastarda coglione coglioni cogliona rincoglionito rompicoglioni vaffanculo fottiti fottere
scopare scopata pompino sborra sborrare segaiolo pene vagina tette tettona culattone frocio froci ricchione checca finocchio leccaculo pirla pirlone
negro negra mongolo mongoloide spastico ritardato handicappato deficiente idiota imbecille cretino cretina scemo scema cacca caca cagare cacare caga
pisello pippa porco porca stupro stupratore pedofilo terrone polentone zingaro nazi nazista fascista hitler mussolini duce
fuck fucker fucking shit bullshit bitch asshole ass dick cock pussy cunt whore slut bastard nigger nigga faggot fag retard penis boob boobs tits cum
porn porno sex sexy rape dumb idiot stupid moron
`);

// Parole che non sono nomi di persona: prove, parti di sistema, personaggi, marchi.
const NON_NOMI = elenco(`
test prova prove provando admin administrator root user utente username nome cognome studente docente professore prof insegnante anonimo sconosciuto
nessuno qualcuno tizio caio sempronio asdf asdfgh qwerty qwertyuiop azerty zxcvbn lorem ipsum foo bar baz null undefined none nan
pippo pluto paperino topolino minnie paperone batman superman spiderman ironman hulk thor joker pokemon pikachu goku naruto sonic zelda
minecraft fortnite roblox youtube tiktok instagram google facebook whatsapp amazon netflix bot robot
`);

// Oggetti, cibi, animali e luoghi: controllati solo sul NOME, perche' molti compaiono come cognomi veri (Gatto, Pesce, Porta, Carta).
const OGGETTI = elenco(`
tavolo sedia banco cattedra lavagna banana pizza pasta panino hamburger kebab gelato torta biscotto cioccolato nutella
computer pc telefono cellulare mouse tastiera monitor schermo cavo caricabatterie stampante
bottiglia bicchiere piatto forchetta coltello cucchiaio pentola padella penna matita gomma righello zaino astuccio quaderno libro foglio carta cartone
scarpa scarpe maglia pantalone calzino cappello cappotto giacca
cane gatto topo pollo pesce mucca maiale cavallo coniglio criceto tartaruga leone tigre elefante scimmia
mela pera patata pomodoro limone arancia fragola ciliegia uva anguria melone cipolla carota insalata
luna sole stella nuvola pioggia neve albero fiore erba montagna mare lago fiume
casa macchina auto moto bici bicicletta treno aereo nave camion furgone autobus muletto bancale pallet scatola pacco scaffale magazzino gestionale
porta finestra letto divano lampada armadio cassetto frigo forno lavatrice televisore
palla pallone ombrello chiave borsa sacco secchio scopa spazzola sapone
`);

/** Parole e iniziali con la maiuscola: "mario DE luca" -> "Mario De Luca", "d'angelo" -> "D'Angelo". */
export const parole = (s: string) => s.trim().split(/\s+/).filter(Boolean);
export const formattaNome = (s: string) =>
  parole(s).map((p) => p.toLowerCase().replace(/(^|['’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())).join(' ');

const LATINO = /^\p{Script=Latin}+(['’-]\p{Script=Latin}+)*$/u;
const slug = (s: string) => senzaAccenti(parole(s).join(' ')).toLowerCase().replace(/['’-]/g, '').replace(/\s+/g, '_');

/** Nome account proposto: nome_cognome (vuoto finche' manca uno dei due). */
export const usernameDa = (nome: string, cognome: string) => (parole(nome).length && parole(cognome).length ? `${slug(nome)}_${slug(cognome)}` : '');
/** Il nome account senza il numero finale degli omonimi. */
const base = (u: string) => u.replace(/[0-9]+$/, '');

/** Errore per una sola parte (nome o cognome), o undefined. `soloNome`: controlla anche gli oggetti. */
function errorePezzo(testo: string, etichetta: string, soloNome: boolean): string | undefined {
  const p = parole(testo);
  if (!p.length) return `Scrivi il ${etichetta}.`;
  for (const parola of p) {
    if (parola.length < 2) return `Il ${etichetta} non può avere parole di una sola lettera.`;
    if (!LATINO.test(parola)) return `Il ${etichetta} può avere solo lettere (niente numeri o simboli).`;
    const k = chiave(parola);
    if (!/[aeiouy]/.test(k) || /(.)\1\1/.test(senzaAccenti(parola).toLowerCase()) || /[^aeiouy]{5}/.test(senzaAccenti(parola).toLowerCase())) {
      return `Questo non sembra un ${etichetta} vero.`;
    }
    if (VIETATE.has(k)) return `Parola non ammessa nel ${etichetta}: usa il tuo nome vero.`;
    if (NON_NOMI.has(k) || (soloNome && OGGETTI.has(k))) return `"${parola}" non è un ${etichetta} valido: scrivi il tuo nome vero.`;
  }
  if (!/^[a-z_]+$/.test(slug(testo))) return `Il ${etichetta} può avere solo lettere dell'alfabeto latino.`;
  return undefined;
}

export interface ErroriNominativo { nome?: string; cognome?: string; username?: string }

/** Registrazione e creazione docente: nome, cognome e nome account (nome_cognome, con numero finale facoltativo). */
export function validaNominativo(nome: string, cognome: string, username: string): ErroriNominativo {
  const e: ErroriNominativo = { nome: errorePezzo(nome, 'nome', true), cognome: errorePezzo(cognome, 'cognome', false) };
  if (!USERNAME_NUOVO.test(username) || username.length > USERNAME_NUOVO_MAX) e.username = MSG_USERNAME_NUOVO;
  else if (!e.nome && !e.cognome && base(username) !== usernameDa(nome, cognome)) e.username = `Deve essere ${usernameDa(nome, cognome)} (più un numero se serve).`;
  return e;
}

/** Cambio nominativo ("Nome Cognome" in un campo solo): almeno due parole; se l'account e' nel formato nome_cognome deve restare coerente. */
export function validaNominativoUnico(testo: string, username: string): string | undefined {
  const p = parole(testo);
  if (p.length < 2) return 'Scrivi nome e cognome.';
  const e = errorePezzo(p[0], 'nome', true) ?? errorePezzo(p.slice(1).join(' '), 'cognome', false);
  if (e) return e;
  if (USERNAME_NUOVO.test(username) && base(username) !== slug(testo)) {
    return `Deve corrispondere al nome account (${base(username)}): puoi cambiare solo maiuscole e accenti.`;
  }
  return undefined;
}
