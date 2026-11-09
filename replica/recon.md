# Recon map: MerciGest 2026 (RGPSoft)

Data: 2026-11-06. Fonte: copia installata sul PC dell'utente, versione di prova (14 giorni rimanenti), guidata a schermo con l'utente presente. Screenshot in `screens/`, solo riferimento, non finiscono nel clone.

## 0. Regole rispettate

- Letto solo: contratto di licenza, note di rilascio, interfaccia a schermo. Niente exe, niente decompilazione, niente lettura del file `.mdb`.
- Contratto (art. su divieti): vietato modificare o decompilare il sistema di licenza, vietata copia/rivendita del software. Il clone riscrive funzioni e flussi, non codice, grafica o testi di RGPSoft.
- Dati visti a schermo (Mario Rossi, InnovaTech SPA...) sono dati di prova dell'utente. Non vanno copiati nel clone: il seed sarà inventato.

## 1. Scope

| Domanda | Risposta proposta (da confermare) |
| --- | --- |
| App / piattaforma | MerciGest 2026, desktop Windows (ribbon stile Office, database Access) |
| Slice | Gestione magazzino + movimenti + ordini + fatture + anagrafiche + agenda. Non: attivazione licenza, aggiornamenti |
| Per chi | Studenti ITS con account personale e docenti. Due modi di lavoro (decisi dall'utente 2026-11-06): **magazzino personale** (esercitazione in solitaria, dati isolati) e **magazzino di classe** (esercitazione di gruppo come in azienda, condiviso tramite codice emesso dal docente, dati persistenti fino a eliminazione decisa dal docente) |
| Core loop | Anagrafica articolo → carico da fornitore → scarico a cliente → giacenza aggiornata → fattura/ordine |

## 2. Fonti

| Fonte | Cosa dà | URL / percorso |
| --- | --- | --- |
| App installata (account dell'utente) | tutte le schermate | `C:\Program Files (x86)\RGPSoft\MerciGest\MerciGest.exe` |
| Contratto di licenza | termini, limiti | `...\MerciGest\Contratto.rtf` |
| Note di rilascio | v2.0.0 primo rilascio, 2.1.0 abbonamenti licenza, 2.1 rilevazione errori | `...\RelNotes.rtf` |
| Manuale online (F1 / Programma > Manuale utente) | funzioni complete, **non ancora letto** | link da menu Programma |

## 3. Schermate

| ID | Schermata | Come ci arrivo | Scopo | Componenti | Stati visti |
| --- | --- | --- | --- | --- | --- |
| S00 | Procedura guidata Anagrafica Azienda | primo avvio | dati azienda dell'utente | form: Rag.Soc., Indirizzo, Comune, Nazione, Fax, Cod.Fisc, P.Iva, Tel, Cell, E-mail, Sito, Cap.Sociale, Altro, Logo 100x60; Indietro/Avanti/Annulla/? | vuoto (wizard a più passi) |
| S01 | Magazzino | tab Magazzino | elenco articoli + movimenti dell'articolo selezionato | griglia articoli (Matricola, Descrizione, Categoria, Carichi, Scarichi, giacenza a destra), pannello inferiore "Movimenti di magazzino" (Numero, Data, Tipo, Cliente/Fornitore) | riga selezionata, 3 articoli |
| S02 | Movimenti / Fatture | tab Movimenti / Fatture | elenco movimenti + righe | griglia (Data, Numero, Cliente/Fornitore, Prezzo), pannello "Righe del movimento" (Articolo, Quantità, Prezzo, Sconto, Imposta, Totale), icone carico/scarico | 10 movimenti, filtro "Vedi tutti" attivo |
| S03 | Fatture (Altre Fatture) | tab Altre Fatture | fatture di acquisto e vendita | griglia (Data, Numero, Cliente/Fornitore, Prezzo, Imposta, Inps, Ritenuta), righe fattura (Descrizione, Prezzo, Imposta, Inps, Ritenuta d'acconto, Totale) | **vuoto**: 0 fatture |
| S04 | Ordini | tab Ordini | ordini a fornitore e da cliente, evasione | griglia (Data, Numero, Fornitore/Cliente, Evaso Sì/No, Prezzo, Imposta, Totale), righe ordine | 2 ordini, entrambi evasi |
| S05 | Anagrafiche | tab Anagrafiche | clienti e fornitori | griglia (Ragione Sociale, Indirizzo, Comune, Telefono, Cellulare, E-Mail, Cod. Fiscale), pannello "Ultimi 250 movimenti di magazzino" del soggetto | 5 anagrafiche, filtro Clienti / Fornitori / Vedi Tutti |
| S06 | Agenda | tab Agenda | scadenze e appuntamenti | calendario mensile (2 mesi), vista giorno con fasce orarie, banner con data e Pasqua | vuota |
| S07 | Menu Programma | Programma (alto a destra) | licenza, aggiornamenti, manuale | menu: Attivazione, Aggiornamenti, Manuale utente | aperto |

Dialoghi visti il 2026-11-09 (aperti e annullati, nessun dato salvato; screenshot S10-S15):

| ID | Dialogo | Campi |
| --- | --- | --- |
| S10 | Dati Articolo | Matricola, Descrizione, Unità di misura (KG., PZ....), Categoria, Gruppo; prezzi: Prezzo acquisto, IVA (22%), flag "acquisto comprensivo di IVA", Ricarico vendita %, Sconto fisso %, Giacenza iniziale, Scorta (minima); prezzi totali calcolati acquisto e vendita; Codice a barre (EAN8, EAN13, CODE39), immagine prodotto; Logistica: Reparto, Scaffale; Fornitore abituale: codice, codice esterno, ragione sociale; note; flag "codice a barre diverso per ogni articolo (IMEI)". Salva (F2) / Annulla / Aiuto |
| S11 | Dati Carico | Numero (progressivo N/anno automatico), Data, Fornitore (codice + ragione sociale, con nuovo/apri/cerca), stato RICEVUTA, tabella righe (Articolo, Quantità, Prezzo Un., Prezzo, Sconto, Imposta, Totale); riga: Articolo (codice, codice fornitore, barcode), unità, Quantità, giacenza attuale mostrata, Prezzo, Prz. Lordo, IVA, Sconto, Note, Altri dati; pulsanti Lettore, Inserisci, Salva, Rimuovi; totali Imponibile, Sconto, Imposta, Totale; flag Pagato. **La giacenza mostrata era -22,00: l'originale permette giacenza negativa, nessun blocco** |
| S12 | Gestione Ordine | Numero, Data, Fornitore, righe (Articolo, Quantità, Prezzo Un., Prezzo, Imposta, Totale); riga: Prodotto, Quantità, Prezzo, IVA; riquadro informativo: Giacenza attuale, Quantità minima in magazzino, Quantità in ordine, Ultimo fornitore con data |
| S13 | Gestione Fattura | Numero, Data, Cliente (codice / (PRIVATO) / ragione sociale), Banca, IBAN, Cond.Pag., Titolo (FATTURA); righe: Descrizione, Prezzo, IVA 22%, INPS %, Rit. d'Acconto %, Note; Imponibile, Imposta, Totale; flag Stampa Fattura; pulsante Scarica |
| S14 | Gestione Anagrafica | Codice, Rag.Soc. (obbligatoria), Indirizzo, Comune, E-Mail, Sito Web, Banca, IBAN, Telefono, Cellulare, Cod.Fisc, Part.IVA, Sconto %, note |
| S15 | Appuntamenti e Scadenze | Oggetto, Descrizione, Inizio (data + ora), Fine (data + ora), Tipo (Appuntamento, con colore) |

Ancora non visti: Nuovo Scarico, Reso da Cliente (probabilmente uguali a S11), Filtro, Importa, Variazioni, Offerte e Promozioni, anteprime di stampa, menu Stile.

## 4. Flussi

```
F01 Carico merce da fornitore
    S01/S02 -> "Inserisci Nuovo Carico/Acquisto" -> scegli fornitore (S05) -> righe articolo/quantità/prezzo/imposta -> salva
    effetto: Carichi dell'articolo aumenta, il movimento compare in S01 e S02
    edge: articolo nuovo, fornitore nuovo, sconto, prezzo a zero (visti movimenti da 0,00 €)

F02 Scarico / vendita a cliente
    S02 -> "Inserisci Nuovo Scarico/Vendita" -> cliente -> righe -> salva
    edge: giacenza insufficiente (da verificare), resi

F03 Reso da cliente
    S02 -> "Inserisci Nuovo Reso da Cliente" (visto "Reso di PZ. 5,00")

F04 Ordine e evasione
    S04 -> nuovo ordine a fornitore o da cliente -> righe -> "Evadi Ordine" -> genera movimento, Evaso = Sì
    (ipotesi: evadi crea il movimento. Da confermare)

F05 Fattura di acquisto / vendita
    S03 -> nuova fattura -> righe con Imposta, Inps, Ritenuta d'acconto -> stampa/anteprima
    (ipotesi: pensata anche per professionisti)

F06 Gestione anagrafica
    S05 -> nuovo cliente / nuovo fornitore -> modifica / elimina -> storico movimenti

F07 Scadenze e appuntamenti
    S06 -> scegli giorno -> inserisci scadenza -> compare nella fascia oraria

F08 Stampe e report
    qualsiasi tab -> Anteprima / Stampa (lista merce, valore merce, storico movimenti, lista fatture, rapporti, bilancio, lista anagrafiche)

F09 Cerca
    Trova Articolo / Movimento / Fattura / Ordine / Anagrafica; Ricerca con lettore barcode (disabilitato senza articolo selezionato)
```

Flussi nuovi, assenti nell'originale (richiesti dall'utente), schermate da disegnare in replica-design:

```
F10 Studente lavora da solo
    login -> selettore magazzino -> "Il mio magazzino" (creato al primo accesso) -> F01..F09 sui propri dati
    edge: azzera il mio magazzino (solo il suo), esporta CSV prima di azzerare

F11 Docente crea magazzino di classe
    login docente -> "Nuovo magazzino di classe" -> nome -> il sistema emette un codice (es. 6 caratteri) -> mostra/copia/stampa il codice
    edge: rigenera codice (i già iscritti restano), disattiva codice (nessun nuovo ingresso), scadenza codice opzionale

F12 Studente entra in una classe
    login -> "Entra con codice" -> inserisce codice -> diventa membro -> il selettore mostra "Il mio magazzino" + "Classe X"
    edge: codice errato/disattivato, già membro, studente in più classi

F13 Lavoro di gruppo nel magazzino di classe
    stessi flussi F01..F09 sullo stesso magazzino; ogni movimento mostra chi l'ha fatto e quando
    edge: due studenti scaricano lo stesso articolo insieme (giacenza coerente), numerazione senza buchi/doppioni

F14 Docente gestisce la classe
    elenco membri e attività -> rimuovi studente | "Azzera dati" (svuota movimenti/ordini/fatture, anche articoli e anagrafiche a scelta, con conferma scritta) | "Elimina magazzino" | "Ripristina dati demo"
    regola: i dati restano finché il docente non azzera o elimina. Nessuna scadenza automatica, nessuna cancellazione fatta dagli studenti sul magazzino di classe oltre le proprie righe
```

Click del percorso felice F01 nell'originale: da stimare nei dialoghi, non ancora contati. Numero da battere nel clone.

## 5. Componenti

| Componente | Varianti / stati | Dove |
| --- | --- | --- |
| Ribbon con schede e gruppi | gruppi: Articoli, Strumenti, Visualizza, Merce, Fatture, Ordini, Scadenze; pulsanti disabilitati se nessuna riga selezionata | tutte |
| Griglia dati ordinabile | righe alternate, riga selezionata blu, colonna ordinata con freccia | S01-S05 |
| Pannello dettaglio ancorabile (pin / chiudi) | Movimenti, Righe movimento, Righe fattura, Righe ordine, Ultimi 250 movimenti | S01-S05 |
| Barra di stato | conteggio righe, suggerimento F1 | tutte |
| Interruttori "Visualizza" (barra di stato, barra righe, barra ordini) | checkbox | tutte |
| Filtri rapidi | Clienti / Fornitori / Vendite / Acquisti / Vedi Tutti, Filtro Data | S02, S03, S05 |
| Wizard a passi | Indietro / Avanti / Annulla / ? | S00 |
| Calendario mensile + vista giornata | giorno corrente evidenziato | S06 |
| Icone di stato riga | carico / scarico / reso (icone diverse), evaso / non evaso | S02, S04 |
| Menu stile (tema) | non aperto | barra titolo |

## 6. Modello dati inferito

```
Profilo       user_id (Supabase Auth), nome, ruolo_globale (studente | docente)
              evidenza: richiesta utente. confidenza: alta (campi da confermare)

Magazzino     id, nome, tipo (personale | classe), proprietario_id, codice_ingresso (unico, nullo per
(workspace)   i personali), codice_attivo (bool), creato_il
              evidenza: richiesta utente. Nell'originale non esiste: un solo file, un solo magazzino.
              Ogni entità sotto ha magazzino_id e le regole di accesso (RLS) passano da Membro.

Membro        magazzino_id, user_id, ruolo (docente | studente), entrato_il
              evidenza: richiesta utente. Personale: un solo membro. Classe: 1 docente + N studenti.

Azienda       (una riga per magazzino) ragione_sociale, indirizzo, comune, nazione, fax, cod_fisc, p_iva,
              telefono, cellulare, email, sito_web, capitale_sociale, altro, logo
              evidenza: S00. confidenza: alta

Anagrafica    id, tipo (cliente | fornitore), ragione_sociale, indirizzo, comune, telefono,
              cellulare, email, sito_web, banca, iban, cod_fiscale, p_iva, sconto %, note, codice
              evidenza: S05, S14. confidenza: alta; un soggetto può essere sia cliente sia
              fornitore? ignoto (in S14 il tipo non è un campo: si sceglie dal pulsante usato)

Articolo      id, matricola (codice), descrizione, categoria, unita (PZ.), foto, barcode, posizione,
              prezzo_acquisto/vendita, iva, sconto, riordino (soglia scorta bassa),
              calcolati: carichi, scarichi, resi, giacenza, ordinato (ordini non ancora evasi)
              stato riga: verde normale | giallo scorta bassa | blu già ordinato
              evidenza: S01, S10, manuale PDF dell'utente. confidenza: alta.
              Campi da S10 aggiunti: gruppo, ricarico %, sconto fisso %, scorta minima,
              reparto, scaffale, fornitore abituale (+ codice esterno), note, flag IMEI.
              Giacenza negativa ammessa nell'originale (migliorare: avviso o blocco opzionale)

Movimento     id, numero + anno (N/2026, progressivo per anno e tipo), data,
              tipo (carico | scarico | reso_cliente), anagrafica_id, totale
              evidenza: S02, S01 pannello. confidenza: alta

RigaMovimento id, movimento_id, articolo_id, quantita, prezzo, sconto, imposta, totale
              evidenza: S02. confidenza: alta

Ordine        id, numero + anno, data, tipo (a_fornitore | da_cliente), anagrafica_id,
              evaso (bool), prezzo, imposta, totale
              evidenza: S04. confidenza: alta

RigaOrdine    ordine_id, articolo_id, quantita, prezzo, imposta, totale
              evidenza: S04. confidenza: alta

Fattura       id, numero + anno, data, tipo (acquisto | vendita), anagrafica_id, banca, iban,
              condizioni_pagamento, titolo, prezzo, imposta, inps, ritenuta_acconto, totale
              evidenza: S03, S13. confidenza: alta

RigaFattura   fattura_id, descrizione (testo libero, non articolo), prezzo, imposta, inps,
              ritenuta_acconto, totale
              evidenza: S03. confidenza: media

Scadenza      id, oggetto, descrizione, inizio (data+ora), fine (data+ora), tipo (appuntamento |
              scadenza, con colore), stato (in_sospeso | completato, dal manuale)
              evidenza: S15 + manuale. confidenza: alta
```

Aliquote visibili: 22% (17,56 su 79,80; 88 su 400; 4,62 su 21). Calcolo imposta per riga.

## 7. Matrice funzioni

Vedi `features.csv` (105 righe, `clone` = no ovunque).

## 8. Miglioramenti proposti (vecchia tecnologia → web)

| Originale | Proposta | Priorità |
| --- | --- | --- |
| Un PC, un file Access, licenza per postazione | Web app installabile (PWA) + Supabase, login per studente. Magazzino personale isolato + magazzino di classe condiviso con codice del docente, persistente fino a eliminazione del docente | must |
| Nessuno storico di chi fa cosa | Nel magazzino di classe ogni movimento/ordine/fattura registra autore e ora | must |
| Backup manuale del file | Dati nel cloud, esporta tutto in CSV/JSON | should |
| Nessuna ricerca globale | Barra di ricerca unica (articoli, anagrafiche, movimenti) | should |
| Lettore barcode esterno | Scansione da fotocamera del telefono (BarcodeDetector) | should |
| Giacenza = carichi - scarichi, nessun avviso | Scorta minima con avviso, blocco scarico oltre giacenza | should |
| Stampe locali | PDF e CSV da browser, anteprima | must |
| Fatture solo carta | Facoltativo: bozza fattura elettronica XML (SDI) | could |
| Dashboard assente | Home con valore magazzino, ultimi movimenti, scadenze di oggi, articoli sotto scorta | should |
| Ribbon desktop | Navigazione responsive: barra laterale su PC, barra in basso su telefono | must |
| Un solo utente | Ruolo docente (emette codici, gestisce membri, azzera/elimina il magazzino di classe, ripristina dati demo) e ruolo studente | must |

### 8b. Proposte dai gestionali moderni (esito del 2026-11-09, ora in `features.csv`)

Scelte pensando a cosa serve per esercitarsi in logistica. Nell'originale mancano tutte.

| # | Proposta | Perché serve in classe | Taglia | Esito |
| --- | --- | --- | --- | --- |
| P1 | **Ruoli aziendali nel magazzino di classe** (magazziniere, acquisti, commerciale, amministrazione) con permessi diversi | simula un'azienda vera: chi riceve la merce non emette fatture | S | Approvata |
| P2 | **Scenari del docente**: dati iniziali + compiti + eventi (es. "ordine urgente"), consegna dello studente e controllo automatico (giacenze negative, ordini non evasi, fatture mancanti) | esercitazione guidata e valutabile | M | Approvata |
| P3 | **Ciclo documentale collegato**: preventivo → ordine cliente → DDT → fattura, con stato di spedizione (da preparare, preparato, spedito, consegnato) | l'originale ha ordini, movimenti e fatture scollegati | M | Approvata |
| P4 | **Inventario fisico e rettifiche** con causali (conteggio, differenze, merce danneggiata) | pratica tipica di magazzino | S | Approvata come "inventario con giacenza fisica fittizia fornita dallo scenario (non esiste un magazzino fisico vero)" |
| P5 | **Punto di riordino e scorta di sicurezza** con suggerimento ordini e quantità economica (EOQ) | calcoli di logistica che si studiano | S | Approvata |
| P6 | **Cruscotto KPI**: valore giacenza, rotazione, giorni di copertura, analisi ABC, articoli fermi | lettura dei dati, non solo inserimento | M | Approvata |
| P7 | **Lotti e scadenze** (FIFO / FEFO) e **ubicazioni** (zona, corridoio, scaffale) con trasferimenti | cuore della gestione di magazzino moderna | M | Approvata |
| P8 | **Valorizzazione**: costo medio ponderato, FIFO, LIFO a confronto | contabilità di magazzino | S | Approvata |
| P9 | Registro attività e notifiche in-app (scorta bassa, scadenza vicina) | già previsto per la classe, si estende | S | Approvata |
| P10 | Etichette QR/barcode per ubicazioni e scansione da fotocamera | già previsto per gli articoli | S | Non scelta (resta fuori) |

Non proposti per ora: multi-valuta, integrazione con corrieri reali, fatturazione elettronica SDI (resta "could").

## 9. Cosa non si clona

| Voce | Perché |
| --- | --- |
| Sistema di licenza, attivazione, prova 30 giorni, abbonamenti | non serve; contratto vieta di toccare il sistema di licenza |
| Marchio, icone, bitmap, testi di RGPSoft | di proprietà RGPSoft; stile = ITS (senza loghi) |
| File `.mdb`, compressione JetComp | tecnologia da superare |
| Dati di prova (Mario Rossi, InnovaTech...) | dati dell'utente |
| Aggiornamenti automatici del programma | la web app si aggiorna da sola |

## 10. Dimensione

Schermate: 8 viste + circa 12 dialoghi di inserimento. Flussi: 9. Entità: 9. Taglia **M** (poche settimane per un clone completo; una fetta verticale carico/scarico/giacenza è S).
Parti dure: (1) coerenza giacenza e numerazione progressiva per anno (transazioni lato database); (2) fatture con imposta/INPS/ritenuta, regole fiscali da fissare con il docente; (3) RLS Supabase su due modi (personale / classe) con ruoli docente e studente, ingresso con codice, PWA installabile, stampe PDF; (4) concorrenza nel magazzino di classe: giacenza e numerazione progressiva per anno devono restare corrette con più studenti che scrivono insieme (funzioni SQL transazionali, non calcoli nel browser).
(5) installer desktop: stessa web app dentro un guscio. Windows prima (`.exe`), macOS dopo (`.dmg`, da costruire su un Mac o su GitHub Actions). Su questo PC ci sono Node 24 e Git, mancano Rust e Visual Studio Build Tools: Electron (solo Node) è la strada più corta; Tauri chiederebbe di installare Rust e MSVC. Decisione finale in replica-architect.
Entità ora 12 (+ Profilo, Magazzino, Membro). Taglia resta **M**, ma la fetta verticale S si sposta di un gradino: login + magazzino personale + carico/scarico/giacenza, poi classe e codice.

## 11. Domande aperte

Risolte (2026-11-06): dati isolati vs condivisi → **entrambi** (personale + classe con codice del docente, dati persistenti fino a eliminazione decisa dal docente). Il docente vede e gestisce i magazzini di classe che ha creato.

Risolte (2026-11-09, "sì a tutto"):
1. Docente: ruolo assegnato dall'admin dal pannello Supabase (campo nel profilo), niente registrazione libera come docente.
2. Codice classe: multiuso, il docente può disattivarlo o rigenerarlo.
3. Studenti: inseriscono e correggono i propri record, il docente può tutto.
4. Permesso di leggere il manuale online di MerciGest e aprire i dialoghi di inserimento senza salvare.
5. Cartella `APPS CLONE/Shipping/` con `main/` e `local-demo/`, repo `https://github.com/Foti02/Shipping.git`.
6. macOS non firmato accettato: l'app si installa e su macOS si apre con clic destro. Account Apple Developer (99 USD/anno) rimandato.
7. Formati: installer Windows (.exe) e macOS (.dmg). Android (.apk) solo se richiesto, dopo.

Aperte: nessuna.

## 12. Decisioni del 2026-11-09

- Accesso: nome utente e password, senza verifica email. Email finta interna, "Confirm email" spento.
- Compiti: ogni studente ha compiti personalizzati con dati fittizi. Stessa quantità su merci diverse ammessa. Nessun compito identico tra studenti.
- Sottoscorta condivisa: se la scorta scende perché un compagno ha scaricato, la notifica arriva a tutta la classe. Si fa un riordino (compito per chi ha ruolo acquisti). Poi gli scarichi bloccati ripartono.
- Docente: vede gli utenti connessi, cosa fanno e quale magazzino usano. Del magazzino personale vede solo che lo usano, non il contenuto.
- Database: credenziali Supabase fornite dall'utente quando si arriva a quella fase.
- Modelli per risparmiare token: haiku per documenti e versioni, sonnet per il codice, opus solo per una revisione di sicurezza.
- Ogni rilascio alza la versione.
- Architettura in `replica/architecture.md`: funzioni SQL `api_*`, polling, PGlite per `local-demo`.
