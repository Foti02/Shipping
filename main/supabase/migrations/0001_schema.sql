-- 0001_schema.sql
-- Contratto dei dati: tutte le tabelle vivono qui. Le funzioni (api_*) stanno nelle migrazioni successive.
-- Regole: soldi in centesimi (bigint, colonne *_cent), quantita' numeric(14,3), percentuali numeric(5,2),
-- tempi timestamptz. Ogni tabella ha RLS attiva SENZA policy: nessun accesso diretto, tutto passa
-- dalle funzioni api_* (security definer) che controllano chi chiama.
-- Gira identica su Supabase e su PGlite (local-demo): niente estensioni, niente Realtime.

-- ---------- identita' ----------
create table profili (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,20}$'),
  nome text not null default '',
  ruolo_globale text not null default 'studente' check (ruolo_globale in ('studente','docente')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table magazzini (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('personale','classe')),
  proprietario_id uuid not null references profili(user_id) on delete cascade,
  codice_ingresso text unique check (codice_ingresso ~ '^[A-Z0-9]{6}$'),
  codice_attivo boolean not null default true,
  blocca_giacenza_negativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tipo = 'classe' or codice_ingresso is null)
);
create unique index magazzini_un_personale on magazzini (proprietario_id) where tipo = 'personale';
create index on magazzini (proprietario_id);

create table membri (
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  user_id uuid not null references profili(user_id) on delete cascade,
  ruolo text not null default 'studente' check (ruolo in ('docente','studente')),
  ruolo_aziendale text check (ruolo_aziendale in ('magazziniere','acquisti','commerciale','amministrazione')),
  entrato_il timestamptz not null default now(),
  primary key (magazzino_id, user_id)
);
create index on membri (user_id);

-- Azioni consentite per ruolo aziendale. Ruolo nullo = jolly (tutte). Docente e proprietario del personale: tutte.
create table permessi_ruolo (
  ruolo_aziendale text not null check (ruolo_aziendale in ('magazziniere','acquisti','commerciale','amministrazione')),
  azione text not null,
  primary key (ruolo_aziendale, azione)
);

create table azienda (
  magazzino_id uuid primary key references magazzini(id) on delete cascade,
  ragione_sociale text not null default '',
  indirizzo text, comune text, nazione text default 'Italia', fax text, cod_fisc text, p_iva text,
  telefono text, cellulare text, email text, sito_web text, capitale_sociale text, altro text,
  updated_at timestamptz not null default now()
);

-- un utente e' in un solo posto alla volta: l'ultima pagina vista (battito ogni ~20 s, online se < 45 s)
create table presenze (
  user_id uuid primary key references profili(user_id) on delete cascade,
  magazzino_id uuid references magazzini(id) on delete set null,
  pagina text,
  visto_il timestamptz not null default now()
);

create table attivita (
  id bigint generated always as identity primary key,
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  user_id uuid references profili(user_id) on delete set null,
  azione text not null,
  entita text,
  entita_id uuid,
  dettagli jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on attivita (magazzino_id, id desc);

create table notifiche (
  id uuid primary key default gen_random_uuid(),
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  tipo text not null check (tipo in ('scorta_bassa','compito','scadenza','spedizione','sistema')),
  articolo_id uuid,  -- fk aggiunta sotto, dopo la tabella articoli
  messaggio text not null,
  risolta_il timestamptz,
  created_at timestamptz not null default now()
);
create index on notifiche (magazzino_id, created_at desc);

create table notifiche_lette (
  notifica_id uuid not null references notifiche(id) on delete cascade,
  user_id uuid not null references profili(user_id) on delete cascade,
  primary key (notifica_id, user_id)
);

-- ---------- anagrafiche, articoli, ubicazioni, lotti ----------
create table anagrafiche (
  id uuid primary key default gen_random_uuid(),
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  tipo text not null check (tipo in ('cliente','fornitore')),
  codice text,
  ragione_sociale text not null,
  indirizzo text, comune text, email text, sito_web text, banca text, iban text,
  cod_fisc text, p_iva text, telefono text, cellulare text,
  sconto_perc numeric(5,2) not null default 0,
  lead_time_giorni int not null default 3,  -- per i fornitori: giorni tra ordine e arrivo
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on anagrafiche (magazzino_id, tipo, ragione_sociale);
create unique index on anagrafiche (magazzino_id, tipo, codice) where codice is not null;

create table ubicazioni (
  id uuid primary key default gen_random_uuid(),
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  codice text not null,  -- es. A-01-03
  zona text, corridoio text, scaffale text,
  created_at timestamptz not null default now(),
  unique (magazzino_id, codice)
);

create table articoli (
  id uuid primary key default gen_random_uuid(),
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  matricola text not null,
  descrizione text not null,
  um text not null default 'PZ.',
  categoria text not null default 'Standard',
  gruppo text,
  prezzo_acquisto_cent bigint not null default 0,
  iva_perc numeric(5,2) not null default 22,
  ricarico_perc numeric(5,2) not null default 0,
  sconto_perc numeric(5,2) not null default 0,
  scorta_minima numeric(14,3) not null default 0,
  scorta_sicurezza numeric(14,3) not null default 0,
  punto_riordino numeric(14,3) not null default 0,
  lead_time_giorni int not null default 3,
  domanda_giornaliera numeric(14,3),           -- nulla = calcolata dai movimenti
  costo_ordine_cent bigint not null default 0,  -- per EOQ
  costo_mantenimento_perc numeric(5,2) not null default 20,
  barcode text,
  ubicazione_id uuid references ubicazioni(id) on delete set null,
  fornitore_abituale_id uuid references anagrafiche(id) on delete set null,
  codice_fornitore text,
  gestione_lotti boolean not null default false,
  note text,
  attivo boolean not null default true,
  scenario_id uuid,  -- fk aggiunta sotto: articoli creati da uno scenario
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (magazzino_id, matricola)
);
create index on articoli (magazzino_id, descrizione);
create index on articoli (ubicazione_id);
create index on articoli (fornitore_abituale_id);

alter table notifiche add foreign key (articolo_id) references articoli(id) on delete cascade;

create table lotti (
  id uuid primary key default gen_random_uuid(),
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  articolo_id uuid not null references articoli(id) on delete cascade,
  codice text not null,
  scadenza date,
  created_at timestamptz not null default now(),
  unique (articolo_id, codice)
);
create index on lotti (magazzino_id, scadenza);

-- giacenza per (articolo, lotto, ubicazione). lotto/ubicazione nulli = "senza lotto" / "senza ubicazione".
create table giacenze (
  id uuid primary key default gen_random_uuid(),
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  articolo_id uuid not null references articoli(id) on delete cascade,
  lotto_id uuid references lotti(id) on delete cascade,
  ubicazione_id uuid references ubicazioni(id) on delete cascade,
  qta numeric(14,3) not null default 0
);
create unique index giacenze_chiave on giacenze (
  articolo_id,
  coalesce(lotto_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(ubicazione_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index on giacenze (magazzino_id, articolo_id);

-- ---------- documenti ----------
-- Un'unica tabella per i documenti del ciclo:
--   preventivo -> ordine_cliente -> scarico (= DDT/vendita) -> fattura_vendita
--   ordine_fornitore -> carico (ricezione) -> fattura_acquisto        reso_cliente: carica merce
-- Muovono il magazzino solo carico, scarico, reso_cliente (quando passano a 'confermato').
create table documenti (
  id uuid primary key default gen_random_uuid(),
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  tipo text not null check (tipo in ('preventivo','ordine_cliente','ordine_fornitore','carico','scarico','reso_cliente','fattura_vendita','fattura_acquisto')),
  anno int not null,
  numero int not null,
  data date not null default current_date,
  anagrafica_id uuid references anagrafiche(id) on delete restrict,
  stato text not null default 'bozza' check (stato in ('bozza','confermato','evaso','annullato')),
  stato_spedizione text check (stato_spedizione in ('da_preparare','preparato','spedito','consegnato')),
  documento_origine_id uuid references documenti(id) on delete set null,
  titolo text, banca text, iban text, condizioni_pagamento text,
  pagato boolean not null default false,
  note text,
  imponibile_cent bigint not null default 0,
  imposta_cent bigint not null default 0,
  inps_cent bigint not null default 0,
  ritenuta_cent bigint not null default 0,
  totale_cent bigint not null default 0,
  creato_da uuid references profili(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (magazzino_id, tipo, anno, numero),
  check (stato_spedizione is null or tipo in ('ordine_cliente','scarico'))
);
create index on documenti (magazzino_id, tipo, data desc);
create index on documenti (anagrafica_id);
create index on documenti (documento_origine_id);

create table righe_documento (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documenti(id) on delete cascade,
  posizione int not null,
  articolo_id uuid references articoli(id) on delete restrict,  -- nullo nelle righe libere delle fatture
  descrizione text not null,
  qta numeric(14,3) not null default 1,
  prezzo_cent bigint not null default 0,
  sconto_perc numeric(5,2) not null default 0,
  iva_perc numeric(5,2) not null default 22,
  inps_perc numeric(5,2) not null default 0,
  ritenuta_perc numeric(5,2) not null default 0,
  lotto_id uuid references lotti(id) on delete set null,
  ubicazione_id uuid references ubicazioni(id) on delete set null,
  totale_cent bigint not null default 0,
  unique (documento_id, posizione)
);
create index on righe_documento (articolo_id);

-- registro di ogni variazione di giacenza (immutabile): da qui si rifanno CMP, FIFO, LIFO e i KPI
create table movimenti_stock (
  id bigint generated always as identity primary key,
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  articolo_id uuid not null references articoli(id) on delete cascade,
  lotto_id uuid references lotti(id) on delete set null,
  ubicazione_id uuid references ubicazioni(id) on delete set null,
  qta numeric(14,3) not null,  -- con segno: + entra, - esce
  costo_unit_cent bigint not null default 0,
  causale text not null check (causale in ('apertura','carico','scarico','reso_cliente','rettifica','trasferimento_out','trasferimento_in','annullo')),
  documento_id uuid references documenti(id) on delete set null,
  user_id uuid references profili(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index on movimenti_stock (magazzino_id, articolo_id, id);
create index on movimenti_stock (documento_id);

-- numerazione progressiva per magazzino, tipo e anno (aggiornata con insert ... on conflict, atomica)
create table contatori (
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  tipo text not null,
  anno int not null,
  ultimo int not null default 0,
  primary key (magazzino_id, tipo, anno)
);

-- ---------- inventario ----------
create table inventari (
  id uuid primary key default gen_random_uuid(),
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  nome text not null,
  stato text not null default 'aperto' check (stato in ('aperto','chiuso')),
  creato_da uuid references profili(user_id) on delete set null,
  created_at timestamptz not null default now(),
  chiuso_il timestamptz
);
create index on inventari (magazzino_id, created_at desc);

create table inventario_righe (
  id uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references inventari(id) on delete cascade,
  articolo_id uuid not null references articoli(id) on delete cascade,
  lotto_id uuid references lotti(id) on delete set null,
  ubicazione_id uuid references ubicazioni(id) on delete set null,
  qta_sistema numeric(14,3) not null,
  qta_contata numeric(14,3),
  causale text check (causale in ('conteggio','danneggiato','smarrito','errore_registrazione')),
  rettificata boolean not null default false,
  user_id uuid references profili(user_id) on delete set null
);
create index on inventario_righe (inventario_id);

-- ---------- agenda ----------
create table scadenze (
  id uuid primary key default gen_random_uuid(),
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  user_id uuid not null references profili(user_id) on delete cascade,  -- agenda personale
  oggetto text not null,
  descrizione text,
  inizio timestamptz not null,
  fine timestamptz not null,
  tipo text not null default 'appuntamento' check (tipo in ('appuntamento','scadenza')),
  stato text not null default 'in_sospeso' check (stato in ('in_sospeso','completato')),
  anagrafica_id uuid references anagrafiche(id) on delete set null,
  created_at timestamptz not null default now(),
  check (fine >= inizio)
);
create index on scadenze (magazzino_id, user_id, inizio);

-- ---------- scenari e compiti ----------
create table scenari (
  id uuid primary key default gen_random_uuid(),
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  nome text not null,
  descrizione text,
  stato text not null default 'bozza' check (stato in ('bozza','attivo','chiuso')),
  seed int not null default 1,
  config jsonb not null default '{}',
  creato_da uuid references profili(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index on scenari (magazzino_id, created_at desc);

alter table articoli add foreign key (scenario_id) references scenari(id) on delete set null;

-- giacenza fisica "reale" fittizia, che lo studente scopre contando nell'inventario
create table scenario_fisico (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenari(id) on delete cascade,
  articolo_id uuid not null references articoli(id) on delete cascade,
  ubicazione_id uuid references ubicazioni(id) on delete cascade,
  qta_reale numeric(14,3) not null
);
create index on scenario_fisico (scenario_id);

create table compiti (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenari(id) on delete cascade,
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  assegnato_a uuid references profili(user_id) on delete set null,
  ruolo_aziendale text check (ruolo_aziendale in ('magazziniere','acquisti','commerciale','amministrazione')),
  tipo text not null check (tipo in ('carico','scarico','reso_cliente','ordine_fornitore','evadi_ordine','preventivo','ordine_cliente','spedizione','fattura_vendita','fattura_acquisto','inventario','trasferimento','riordino')),
  titolo text not null,
  istruzioni text,
  articolo_id uuid references articoli(id) on delete cascade,
  anagrafica_id uuid references anagrafiche(id) on delete cascade,
  qta numeric(14,3),
  parametri jsonb not null default '{}',
  dipende_da uuid references compiti(id) on delete set null,
  origine text not null default 'generato' check (origine in ('generato','dinamico')),
  stato text not null default 'da_fare' check (stato in ('da_fare','bloccato','completato','errore')),
  motivo text,
  esito jsonb not null default '{}',
  documento_id uuid references documenti(id) on delete set null,
  ordine int not null default 0,
  completato_il timestamptz,
  created_at timestamptz not null default now()
);
create index on compiti (scenario_id, assegnato_a);
create index on compiti (magazzino_id, stato);
-- due compiti non possono essere identici (stesso tipo, merce, controparte e quantita')
create unique index compiti_distinti on compiti (
  scenario_id, tipo,
  coalesce(articolo_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(anagrafica_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(qta, 0)
) where origine = 'generato';

-- ---------- sicurezza e manutenzione ----------
do $$
declare t text;
begin
  -- RLS attiva senza policy = nessun accesso diretto alle tabelle
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- updated_at automatico
create function _tocca_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  for t in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'updated_at' loop
    execute format('create trigger tocca_updated_at before update on %I for each row execute function _tocca_updated_at()', t);
  end loop;
end $$;
