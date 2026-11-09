# Architettura: Shipping (clone di MerciGest)

Contratto per chi scrive codice. Se qualcosa qui è ambiguo, si chiede, non si indovina. Dati completi in `main/supabase/migrations/0001_schema.sql`.

## 1. Stack

| Strato | Scelta | Perché |
| --- | --- | --- |
| Interfaccia | Vite + React + TypeScript, `HashRouter`, TanStack Query | file statici: funzionano su sito, su `file://` dentro Electron e senza server |
| Stile | Neutro da gestionale moderno (il riferimento grafico ITS è superato): CSS con token in `main/src/style.css`, font di sistema, niente Tailwind; palette sfondo `#f4f6f8`, superfici `#fff`, testo ardesia `#1e293b`, un solo accento blu `#2f6196`, tema scuro neutro; angoli 6-8 px, bordi sottili, nessun logo | tabella densa, barra laterale a gruppi, suggerimenti dopo 1,5 s |
| Database | Postgres (Supabase) | richiesto dall'utente |
| Logica | **funzioni SQL `api_*`**, nessun accesso diretto alle tabelle | un solo posto per regole, permessi e concorrenza; gira uguale in Supabase e in PGlite |
| Accesso | `username` + password, senza verifica email | il nome utente diventa l'email finta `<username>@shipping.local` (Supabase Auth, "Confirm email" spento) |
| Aggiornamenti | polling (battito 20 s, notifiche e compiti 5 s, vista docente 5 s) | niente Realtime: più semplice, uguale in locale, basta per una classe |
| Desktop | Electron + electron-builder (già pronto, vedi `VERSIONING.md`) | `.exe` e `.dmg` dallo stesso sito |
| Sito | GitHub Pages (workflow `deploy-web.yml`), URL e chiave anon in `main/.env.production` | la chiave anon è pubblica per progetto; la sicurezza sta nelle funzioni |
| Test | Vitest. I test SQL girano su PGlite (Postgres in WASM) | si provano giacenze e numerazioni vere senza Supabase |

Nessun microservizio, nessun backend a parte.

## 2. Due cartelle, un solo codice

- `main/`: l'app. `src/backend/supabase.ts` parla con Supabase. Deploy da qui.
- `local-demo/`: stessa app, avviata con `vite --config local-demo/vite.config.ts` (root `../main`). Cambia solo il file dietro l'alias `@backend-impl`: `local-demo/backend-pglite.ts` esegue le **stesse** migrazioni SQL su PGlite nel browser (dati in IndexedDB) e simula l'accesso. Ha un selettore "entra come" con un docente e sei studenti già pronti, per provare una lezione da soli. Nessun credenziale, nessuna rete.

Interfaccia unica (`main/src/backend/types.ts`):

```ts
export interface Backend {
  rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T>;
  auth: {
    registra(username: string, password: string, nome: string): Promise<void>;
    accedi(username: string, password: string): Promise<void>;
    esci(): Promise<void>;
    sessione(): Promise<{ userId: string } | null>;
  };
}
```

L'interfaccia importa sempre `backend` da `src/backend/index.ts`, mai Supabase direttamente.

## 3. Convenzioni SQL (valgono per tutte le migrazioni)

- Funzioni chiamabili dal client: prefisso `api_`, `language plpgsql`, `security definer`, `set search_path = public`, ritorno `jsonb` (oggetto o array). Parametri con prefisso `p_`. Il client passa gli argomenti per nome.
- Funzioni interne: prefisso `_`, non concesse al client.
- `grant execute on function api_* to authenticated;` e `revoke all on all tables in schema public from anon, authenticated;`.
- Identità: `auth.uid()`. Dentro le funzioni: `_uid()` (solleva `non_autenticato` se nullo), `_membro(p_magazzino)`, `_puo(p_magazzino, p_azione)` (booleano), `_richiedi(p_magazzino, p_azione)` (solleva `permesso_negato`).
- Errori: `raise exception '<codice>'` con codice in snake_case: `non_autenticato`, `permesso_negato`, `non_trovato`, `dato_non_valido`, `giacenza_insufficiente`, `codice_non_valido`, `conferma_errata`, `stato_non_valido`, `gia_esiste`. Il client mostra il testo in italiano partendo dal codice.
- Date/ore `timestamptz`. Soldi in centesimi. Quantità `numeric(14,3)`.
- Ogni scrittura chiama `_registra(p_magazzino, p_azione, p_entita, p_entita_id, p_dettagli)` (riga in `attivita`).
- Numerazione: `insert into contatori ... on conflict (...) do update set ultimo = contatori.ultimo + 1 returning ultimo`, mai `max()+1`.
- Giacenze: dopo ogni scrittura su `giacenze` si ricontrolla la scorta con `_controlla_scorte(p_magazzino, p_articolo)`.
- Calcoli di documento (imponibile, imposta, INPS, ritenuta, totale) fatti nel database da `_ricalcola_documento(p_documento)`, per riga: `netto = round(qta * prezzo * (1 - sconto/100))`, imposta = `round(netto * iva/100)`, INPS e ritenuta sul netto.

## 4. Permessi

`_puo(magazzino, azione)` è vero se: proprietario di un magazzino personale; oppure `membri.ruolo = 'docente'`; oppure membro studente con `ruolo_aziendale` nullo (jolly); oppure esiste `(ruolo_aziendale, azione)` in `permessi_ruolo`. La lettura è sempre permessa ai membri.

Azioni: `articoli.scrivi`, `anagrafiche.scrivi`, `lotti_ubicazioni`, `carico`, `scarico`, `reso`, `trasferimento`, `inventario`, `ordine_fornitore`, `evadi_ordine`, `preventivo`, `ordine_cliente`, `spedizione`, `fattura`, `scadenze`.

| Ruolo aziendale | Azioni |
| --- | --- |
| magazziniere | `carico`, `scarico`, `reso`, `trasferimento`, `inventario`, `evadi_ordine`, `spedizione`, `lotti_ubicazioni`, `scadenze` |
| acquisti | `ordine_fornitore`, `evadi_ordine`, `anagrafiche.scrivi`, `articoli.scrivi`, `scadenze` |
| commerciale | `preventivo`, `ordine_cliente`, `anagrafiche.scrivi`, `scadenze` |
| amministrazione | `fattura`, `anagrafiche.scrivi`, `scadenze` |

Le funzioni `api_classe_*` di gestione, `api_scenario_*` e `api_docente_*` richiedono `ruolo = 'docente'` sul magazzino. Il ruolo globale `docente` si assegna a mano da SQL: `update profili set ruolo_globale = 'docente' where username = '...'`. Solo chi ha ruolo globale docente può creare classi.

## 5. Funzioni `api_*` (catalogo)

`p_magazzino` è sempre l'uuid del magazzino attivo.

**Sessione e presenza**
- `api_inizializza()` → `{profilo, magazzini:[{id,nome,tipo,ruolo,ruolo_aziendale}]}`. Crea il magazzino personale se manca. Idempotente.
- `api_heartbeat(p_magazzino, p_pagina)` → aggiorna `presenze`.

**Classe (docente)**
- `api_classe_crea(p_nome)` → magazzino, con `codice_ingresso` di 6 caratteri `A-Z0-9` senza `0 O 1 I`.
- `api_classe_entra(p_codice)` → magazzino. Ammette solo codici attivi. Idempotente.
- `api_classe_codice(p_magazzino, p_azione)` con `rigenera|attiva|disattiva` → `{codice, attivo}`.
- `api_classe_membri(p_magazzino)`; `api_classe_imposta_ruolo(p_magazzino, p_user, p_ruolo_aziendale)`; `api_classe_rimuovi(p_magazzino, p_user)`.
- `api_classe_azzera(p_magazzino, p_conferma)`: cancella dati e scenari, tiene membri. `p_conferma` deve essere il nome della classe, altrimenti `conferma_errata`.
- `api_classe_elimina(p_magazzino, p_conferma)`: stessa conferma, cancella tutto.
- `api_magazzino_impostazioni(p_magazzino, p_blocca_giacenza_negativa)`.
- I dati della classe restano finché il docente non azzera o elimina. Niente scadenze automatiche.

**Azienda, anagrafiche, articoli, ubicazioni, lotti**
- `api_azienda_leggi(p_magazzino)`, `api_azienda_salva(p_magazzino, p_dati)`.
- `api_anagrafiche_elenco(p_magazzino, p_tipo, p_cerca)`, `api_anagrafica_salva(p_magazzino, p_dati)` (con `id` modifica, senza crea), `api_anagrafica_elimina(p_id)`, `api_anagrafica_storico(p_id, p_limite)`.
- `api_articoli_elenco(p_magazzino, p_cerca, p_categoria)` → righe con `carichi, scarichi, resi, giacenza, ordinato, stato_riga` (`verde` normale, `giallo` giacenza ≤ punto di riordino, `blu` merce già ordinata in arrivo).
- `api_articolo_leggi(p_id)` → articolo, giacenze per lotto e ubicazione, ultimi movimenti.
- `api_articolo_salva(p_magazzino, p_dati)`, `api_articolo_elimina(p_id)` (solo se senza movimenti), `api_articoli_importa(p_magazzino, p_righe)`, `api_articoli_variazione(p_magazzino, p_ids, p_tipo, p_valore)` con `prezzo_perc|ricarico_perc|sconto_perc`.
- `api_ubicazioni_elenco(p_magazzino)`, `api_ubicazione_salva(p_magazzino, p_dati)`, `api_ubicazione_elimina(p_id)`, `api_lotti_elenco(p_articolo)`, `api_lotto_salva(p_magazzino, p_dati)`.

**Documenti e magazzino**
- `api_documenti_elenco(p_magazzino, p_tipo, p_dal, p_al, p_stato, p_cerca)`.
- `api_documento_leggi(p_id)` → documento, righe, origine, derivati.
- `api_documento_salva(p_magazzino, p_documento, p_righe)`: crea o modifica una bozza (`p_documento.id` presente = modifica). Numera alla conferma, non alla bozza.
- `api_documento_conferma(p_id)`: per `carico`, `scarico`, `reso_cliente` muove giacenze (lotti FEFO se `gestione_lotti`, altrimenti FIFO; rispetta `blocca_giacenza_negativa`). Per gli altri passa a `confermato`. Poi `_valuta_compiti`.
- `api_documento_annulla(p_id)` (storna i movimenti con causale `annullo`), `api_documento_elimina(p_id)` (solo bozze), `api_documento_pagato(p_id, p_pagato)`.
- `api_documento_genera(p_origine, p_tipo)`: crea il documento successivo copiando righe: `preventivo→ordine_cliente`, `ordine_cliente→scarico`, `scarico→fattura_vendita`, `ordine_fornitore→carico`, `carico→fattura_acquisto`. Segna l'origine `evaso` quando il derivato è confermato.
- `api_ordine_evadi(p_id)`: scorciatoia di `ordine_fornitore→carico` già confermato.
- `api_spedizione_stato(p_documento, p_stato)`: solo in avanti `da_preparare→preparato→spedito→consegnato`; richiede `spedizione`.
- `api_giacenze(p_magazzino, p_articolo)`, `api_trasferimento(p_magazzino, p_articolo, p_lotto, p_da, p_a, p_qta)`.

**Inventario (con "fisico" fittizio)**
- `api_inventario_apri(p_magazzino, p_nome)` crea le righe da `giacenze`; `api_inventario_conta(p_riga, p_qta)`: senza `p_qta`, se lo scenario ha una riga in `scenario_fisico`, rivela la quantità reale fittizia; altrimenti serve `p_qta`.
- `api_inventario_rettifica(p_riga, p_causale)` scrive un movimento `rettifica` per la differenza; `api_inventario_chiudi(p_inventario)`.

**Riordino, KPI, valorizzazione**
- `api_riordino_suggerimenti(p_magazzino)`: punto di riordino = domanda × lead time + scorta di sicurezza, quantità economica EOQ = √(2·D·S/H).
- `api_kpi(p_magazzino, p_giorni)` → `{valore_giacenza, rotazione, copertura_giorni, sottoscorta, abc:[{articolo,classe,valore,perc_cum}], fermi:[…]}`.
- `api_valorizzazione(p_magazzino)` → per articolo e totali, valore con **costo medio ponderato, FIFO e LIFO** rifatto dal registro `movimenti_stock`.

**Agenda, notifiche, attività**
- `api_scadenze_elenco(p_magazzino, p_dal, p_al)`, `api_scadenza_salva`, `api_scadenza_elimina`.
- `api_notifiche(p_magazzino)` → `{non_lette, elenco}` (comuni a tutta la classe, lettura per utente), `api_notifiche_leggi(p_magazzino)`.
- `api_attivita(p_magazzino, p_dopo_id, p_limite)`: registro leggibile da tutti i membri.

**Scenari e compiti (docente)**
- `api_scenario_genera(p_magazzino, p_nome, p_config)`: `p_config = {seed, n_articoli, sottoscorta_forzata, con_inventario}`. Crea catalogo fittizio, anagrafiche, ubicazioni, giacenze iniziali (movimento `apertura`) e **compiti distinti per studente**, secondo il ruolo aziendale. Stato `bozza`.
- `api_scenario_stato(p_scenario, p_stato)` (`attivo|chiuso`), `api_scenario_riassegna(p_compito, p_user)`, `api_scenario_controlla(p_scenario)` → anomalie (giacenze negative, ordini non evasi, DDT senza fattura, fatture senza DDT, spedizioni ferme, compiti in errore).
- `api_compiti_miei(p_magazzino)`, `api_compiti_tutti(p_scenario)`.

**Vista docente**
- `api_docente_classi()` → classi con numero iscritti e online.
- `api_docente_utenti(p_magazzino)` → per iscritto: `username, ruolo_aziendale, online, pagina, magazzino_usato {tipo, nome solo se classe}, ultima_azione, ultima_azione_il, compiti {totale, completati, errori, bloccati}`. Online = battito < 45 s. Il contenuto dei magazzini personali **non** è visibile al docente, solo che l'iscritto lo sta usando.

Funzioni interne da implementare e riusare: `_registra`, `_controlla_scorte`, `_valuta_compiti`, `_sblocca_compiti`, `_ricalcola_documento`, `_movimenta(p_magazzino, p_articolo, p_lotto, p_ubicazione, p_qta, p_costo, p_causale, p_documento)`.

## 6. Motore degli scenari

1. **Generazione** (`api_scenario_genera`): pesca da liste fisse di nomi fittizi, deterministiche dal `seed`. Ogni studente riceve compiti coerenti col ruolo (magazziniere: carico, scarico, trasferimento, inventario; acquisti: ordine fornitore, evadi ordine; commerciale: preventivo, ordine cliente; amministrazione: fattura). Indice `compiti_distinti`: nessuna coppia di compiti identici (tipo, merce, controparte, quantità). Stessa quantità su merci diverse va bene.
2. **Controllo automatico**: dopo ogni conferma di documento `_valuta_compiti` confronta il documento con i compiti aperti di chi l'ha fatto. Combacia (tipo, merce, controparte, quantità) → `completato`. Non combacia → `errore` con `esito` che elenca cosa non va; lo studente corregge e la valutazione si ripete.
3. **Sottoscorta condivisa** (`sottoscorta_forzata`): alcune merci hanno due o più scarichi assegnati a studenti diversi la cui somma supera la giacenza meno il punto di riordino. Quando la giacenza scende sotto il punto di riordino `_controlla_scorte` crea una notifica `scorta_bassa` visibile a tutta la classe e un compito dinamico `riordino` a uno studente `acquisti` a turno (o libero se nessuno ha il ruolo). Gli scarichi che non trovano merce restano `bloccato` con motivo "scorta insufficiente". Quando l'ordine fornitore viene evaso, `_sblocca_compiti` li riapre e l'esercitazione prosegue.
4. **Inventario**: se `con_inventario`, `scenario_fisico` contiene quantità reali diverse dal sistema per alcune merci; chi conta le scopre e rettifica con causale; il compito si completa se la rettifica porta il sistema alla quantità reale.

## 7. Schermate

| Schermata | Rotta | Contenuto | Tabelle |
| --- | --- | --- | --- |
| Accesso | `#/accedi` | nome utente + password, registrazione, pannello Installa (solo sul sito) | `profili` |
| Scelta magazzino | `#/` | "Il mio magazzino", classi, "Entra con codice" | `magazzini`, `membri` |
| Cruscotto | `#/m/:id` | KPI, notifiche, miei compiti | vari |
| Magazzino (articoli) | `#/m/:id/articoli` | S01, dialogo S10 | `articoli`, `giacenze` |
| Documenti | `#/m/:id/documenti/:tipo` | S02-S04, S11-S13 | `documenti`, `righe_documento` |
| Anagrafiche | `#/m/:id/anagrafiche` | S05, S14 | `anagrafiche` |
| Agenda | `#/m/:id/agenda` | S06, S15 | `scadenze` |
| Inventario | `#/m/:id/inventario` | conta e rettifica | `inventari*` |
| Riordino e KPI | `#/m/:id/analisi` | riordino, ABC, valorizzazione | calcolati |
| Compiti | `#/m/:id/compiti` | elenco miei compiti, stato, esito | `compiti` |
| Attività | `#/m/:id/attivita` | registro | `attivita` |
| Docente | `#/docente`, `#/docente/:id` | classi, utenti online, cosa fanno, scenari | funzioni `api_docente_*` |
| Impostazioni classe | `#/m/:id/classe` | codice, membri, ruoli, azzera, elimina | `membri`, `magazzini` |

## 8. Le parti che mordono

- **Concorrenza nella classe**: due studenti scaricano la stessa merce insieme. `_movimenta` blocca la riga di `giacenze` con `for update` prima di verificare e scalare. Numerazione con `on conflict`. Test dedicato.
- **Accesso senza email**: serve spegnere "Confirm email" in Supabase. Registrazione aperta: chiunque conosca l'URL può creare un account, ma vede solo il proprio magazzino finché non ha un codice classe. Nessun recupero password.
- **Ruolo docente**: assegnato a mano da SQL.
- **Docente e privacy**: vede presenza, non contenuto dei magazzini personali.
- **Polling**: 30 studenti a 5 s sono circa 6 richieste al secondo, dentro il piano gratuito. Le funzioni `api_*` di polling devono costare poco (indici in `0001`).
- **PGlite**: non ha ruoli reali né estensioni. Le migrazioni non devono usarne. `local-demo/shim.sql` crea schema `auth`, `auth.uid()`, ruoli `anon` e `authenticated`.
- **Fusi orari**: `timestamptz` ovunque, le date dei documenti sono `date` nel fuso locale dell'utente.
- **Installer**: non firmati (nessun abbonamento).

## 9. Ordine di costruzione e versioni

| Versione | Contenuto | Funzioni SQL | Schermate |
| --- | --- | --- | --- |
| 0.1.0 | fetta verticale: accesso, magazzino personale, articoli, carico, scarico, giacenza | sessione, articoli, documenti base, `_movimenta` | Accesso, Scelta, Magazzino, Documenti |
| 0.2.0 | anagrafiche, ordini fornitore + evadi, fatture, agenda, stampa PDF/CSV | anagrafiche, scadenze, `api_ordine_evadi` | Anagrafiche, Agenda |
| 0.3.0 | classe: codice, membri, ruoli aziendali, registro, notifiche, presenze, vista docente | `api_classe_*`, `api_docente_*`, `api_attivita`, `api_notifiche` | Docente, Classe, Attività |
| 0.4.0 | scenari, compiti, controllo errori, sottoscorta condivisa | `api_scenario_*`, `api_compiti_*` | Compiti |
| 0.5.0 | ciclo documentale + spedizioni; inventario con fisico fittizio | `api_documento_genera`, `api_spedizione_stato`, `api_inventario_*` | Inventario |
| 0.6.0 | lotti, ubicazioni, riordino/EOQ, KPI/ABC, valorizzazione | `api_riordino_*`, `api_kpi`, `api_valorizzazione` | Analisi |
| 0.7.0 | manuale con screenshot, rifiniture, sito su GitHub Pages | | |
| 1.0.0 | dopo la prova in classe | | |

Il numero sale a ogni rilascio come descritto in `VERSIONING.md`.
