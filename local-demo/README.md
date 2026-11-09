# Shipping ERP local-demo

Stessa app di `main/`, ma senza Supabase e senza rete: le **stesse migrazioni SQL** di produzione girano su PGlite (Postgres in WebAssembly) dentro il browser. I dati stanno in IndexedDB.

## Avvio

```
cd local-demo
npm install
npm run dev
```

`npm run build` produce il sito statico in `local-demo/dist/`.

## Utenti pronti

Al primo avvio vengono creati, tutti con password `demo`:

- `admin` (amministratore: gestisce utenti, ruoli, classi e registro da `#/admin`)
- `docente` (docente)
- `anna`, `bruno`, `carla`, `dario`, `elisa`, `franco` (studenti)

Le password sono vere password di Supabase Auth in piccolo: `auth.users.encrypted_password` con bcrypt di pgcrypto (schema `extensions`), come in produzione. Cambio password, creazione docente, reimposta password ed elimina account funzionano come sul sito.

Se le migrazioni contengono le funzioni `api_classe_*`, esiste anche la "Classe demo" con gli studenti dentro e ruoli aziendali assortiti (magazziniere, acquisti, commerciale, amministrazione). Il selettore "entra come" non chiede la password.

## Aggiornamenti e azzeramento

Le migrazioni nuove vengono applicate all'avvio senza toccare i dati esistenti (la tabella `local_meta` ricorda quelle già eseguite). **Dati creati da una versione precedente** (browser con la demo gia' aperta): l'avvio li ripara da solo (aggiunge pgcrypto e la colonna password; chi aveva una password vecchia entra con la stessa e passa a bcrypt al primo accesso; l'utente `admin` viene creato). Se qualcosa non torna, usa "Azzera i dati demo" nella pagina di accesso.

Una migrazione già applicata non viene rieseguita se il file cambia: in quel caso azzera i dati.

Per ripartire da zero usa il pulsante "reimposta" dell'app (`demo.reimposta()`), oppure cancella il sito dai dati del browser.

## Limiti

- I dati sono di un solo browser: niente condivisione tra computer.
- Schede diverse dello stesso browser usano lo stesso database ma non si avvisano: niente presenza o aggiornamenti in tempo reale tra schede, serve ricaricare.
- L'accesso è simulato: la sessione sta nel `localStorage` del browser e non c'è nessun server che la verifichi, quindi non è sicurezza vera.
