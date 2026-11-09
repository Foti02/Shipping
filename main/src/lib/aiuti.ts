// Testi dei suggerimenti (riquadro che compare dopo 1,5 s di puntatore fermo, o con il "?" sul telefono).
// Un solo file, in italiano semplice, max 240 caratteri ciascuno: servono agli studenti e si possono riusare nel manuale.
// Si usano con la prop `aiuto="chiave"` di Field, Select, Button e delle colonne di DataTable.

export const AIUTI = {
  // Articoli e scorte
  scorta_minima: 'La quantità sotto cui non vuoi scendere. Quando la giacenza è più bassa, l\'articolo risulta "sotto scorta" e va riordinato.',
  scorta_sicurezza: 'Un margine in più per gli imprevisti: il fornitore che ritarda o clienti che comprano più del solito. Si somma al consumo previsto.',
  punto_riordino: 'La giacenza a cui conviene ordinare di nuovo. Si calcola così: domanda al giorno × lead time + scorta di sicurezza.',
  lead_time: 'I giorni che passano da quando ordini al fornitore a quando la merce arriva in magazzino.',
  domanda_giornaliera: 'Quanti pezzi si vendono in media in un giorno. Se la lasci vuota la calcola il programma dai movimenti.',
  costo_ordine: 'Quanto costa fare un ordine, qualunque sia la quantità: trasporto, tempo, pratiche. Serve a calcolare il lotto economico (EOQ).',
  costo_mantenimento: 'Quanto costa in un anno tenere la merce ferma, in % del suo valore: spazio, assicurazione, merce che invecchia. Serve all\'EOQ.',
  gestione_lotti: 'Con i lotti ogni carico ha un suo codice e una sua scadenza. Utile per cibo e farmaci: sai sempre quale merce è più vecchia.',
  scadenza_lotto: 'Data oltre cui il lotto non va più venduto. Nello scarico esce prima il lotto che scade prima (FEFO).',
  ubicazione: 'Il posto fisico dove tieni l\'articolo: scaffale, ripiano, casella. Aiuta a ritrovarlo e a preparare gli ordini.',
  stato_riga: 'Verde: disponibile. Giallo: sotto la scorta minima, da riordinare. Blu: c\'è merce ordinata in arrivo dal fornitore.',
  giacenza_ordinato: 'Giacenza è ciò che hai ora sullo scaffale. Ordinato è ciò che hai chiesto ai fornitori e non è ancora arrivato.',
  ricarico: 'Percentuale che aggiungi al prezzo di acquisto per ottenere il prezzo di vendita. Con acquisto 10 € e ricarico 30% vendi a 13 €.',
  sconto_fisso: 'Percentuale tolta dal prezzo di vendita di questo articolo in ogni documento. Si può comunque cambiare riga per riga.',

  // Documenti
  inps: 'Contributo previdenziale per professionisti e collaboratori, calcolato in % sull\'imponibile e aggiunto in fattura.',
  ritenuta_acconto: 'Una parte dell\'importo che chi paga trattiene e versa allo Stato al posto tuo. Si toglie dal totale da pagare.',
  condizioni_pagamento: 'Quando e come va pagato il documento, per esempio "30 giorni data fattura" o "bonifico a vista".',
  stato_documento: 'Bozza: si può ancora cambiare. Confermato: ha un numero e muove il magazzino. Evaso: completato. Annullato: non vale più.',
  stato_spedizione: 'Dove si trova la merce: da preparare, preparata, spedita o consegnata al cliente.',
  evadi_ordine: 'Segna l\'ordine come completato. Di solito lo fai dopo aver generato il documento successivo (carico o scarico).',
  genera_successivo: 'Crea in automatico il documento che segue nella catena (da preventivo a ordine, da ordine a scarico, da scarico a fattura) copiando le righe.',
  annulla_elimina: 'Annulla: il documento resta in archivio e non vale più. Elimina: sparisce del tutto, ed è possibile solo per le bozze.',

  // Valorizzazione e analisi
  fefo_fifo: 'FIFO: esce prima la merce arrivata prima. FEFO: esce prima la merce che scade prima. Servono a non lasciare invecchiare i pezzi.',
  costo_medio: 'Costo medio ponderato: ogni carico a prezzo diverso si mescola e il costo del magazzino è la media pesata sulle quantità.',
  valorizzazione_fifo: 'FIFO: la merce uscita si valuta al costo dei carichi più vecchi, quella rimasta al costo degli ultimi arrivati.',
  valorizzazione_lifo: 'LIFO: la merce uscita si valuta al costo dei carichi più recenti, quella rimasta al costo dei più vecchi.',
  rotazione: 'Quante volte in un periodo il magazzino si rinnova: vendite diviso giacenza media. Più è alta, meno merce resta ferma.',
  copertura_giorni: 'Per quanti giorni la giacenza attuale basta, al ritmo di vendita medio. Sotto il lead time rischi di restare senza.',
  analisi_abc: 'Divide gli articoli per valore dei consumi. A: pochi articoli che pesano di più. B: intermedi. C: tanti articoli che pesano poco.',
  eoq: 'Lotto economico di riordino: la quantità per ordine che rende minima la somma tra costo degli ordini e costo di tenere la merce.',
  urgenza_riordino: 'Quanto è vicino l\'articolo a finire: confronta giacenza, punto di riordino e consumo previsto. Gli urgenti vanno ordinati subito.',

  // Inventario
  inventario_fisico: 'Nell\'esercitazione il magazzino è finto: "Conta" mostra la quantità fisica simulata, da confrontare con quella del sistema.',
  causale_rettifica: 'Il motivo della differenza tra fisico e sistema (errore di carico, rottura, furto...). Resta scritto nel movimento di rettifica.',

  // Classe
  ruolo_aziendale: 'Magazziniere: carichi e scarichi. Acquisti: ordini ai fornitori. Commerciale: preventivi e ordini cliente. Amministrazione: fatture.',
  codice_ingresso: 'Il codice di 6 caratteri che gli studenti scrivono in "Entra con codice". Finché è attivo, chiunque lo conosca può entrare.',
  blocca_giacenza_negativa: 'Se attivo, uno scarico che porta la giacenza sotto zero viene rifiutato. Se spento, il programma lo accetta e la giacenza va in negativo.',
  scenario: 'Un\'esercitazione già pronta: articoli, fornitori, giacenze e compiti. Si genera con un clic e si può ripetere o cancellare.',
  seed: 'Un numero che fissa il caso: con lo stesso seed esce sempre lo stesso scenario, utile per far fare l\'esercizio identico a tutti.',
  sottoscorta_forzata: 'Prepara scarichi che superano la giacenza di alcuni articoli, così la classe deve accorgersi e fare un ordine al fornitore.',
  stato_compito: 'Da fare: aspetta te. Bloccato: manca un passaggio precedente. Errore: il controllo ha trovato qualcosa da correggere. Completato: fatto.',
} as const;

export type ChiaveAiuto = keyof typeof AIUTI;
