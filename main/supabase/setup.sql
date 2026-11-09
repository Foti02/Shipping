-- Shipping: schema completo per Supabase (SQL Editor). Generato dalle migrazioni 0001..0099, in ordine.

-- ===== migrations/0001_schema.sql =====
-- 0001_schema.sql
-- Contratto dei dati: tutte le tabelle vivono qui. Le funzioni (api_*) stanno nelle migrazioni successive.
-- Regole: soldi in centesimi (bigint, colonne *_cent), quantita' numeric(14,3), percentuali numeric(5,2),
-- tempi timestamptz. Ogni tabella ha RLS attiva SENZA policy: nessun accesso diretto, tutto passa
-- dalle funzioni api_* (security definer) che controllano chi chiama.
-- Gira identica su Supabase e su PGlite (local-demo): niente estensioni, niente Realtime.
-- Check numerici: 'NaN' in Postgres e' maggiore di ogni numero e supera ogni "<= 0" / ">= 0": va escluso a parte (<> 'NaN')
-- oppure con between (che lo respinge). Testi liberi principali: massimo 500 caratteri (pagina della presenza: 100).

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
  nome text not null check (char_length(nome) <= 500),
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
  ragione_sociale text not null default '' check (char_length(ragione_sociale) <= 500),
  indirizzo text, comune text, nazione text default 'Italia', fax text, cod_fisc text, p_iva text,
  telefono text, cellulare text, email text, sito_web text, capitale_sociale text, altro text,
  updated_at timestamptz not null default now()
);

-- un utente e' in un solo posto alla volta: l'ultima pagina vista (battito ogni ~20 s, online se < 45 s)
create table presenze (
  user_id uuid primary key references profili(user_id) on delete cascade,
  magazzino_id uuid references magazzini(id) on delete set null,
  pagina text check (char_length(pagina) <= 100),
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
create index on attivita (magazzino_id, user_id, id desc);  -- ultima azione per utente (api_docente_utenti)

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
  ragione_sociale text not null check (char_length(ragione_sociale) <= 500),
  indirizzo text, comune text, email text, sito_web text, banca text, iban text,
  cod_fisc text, p_iva text, telefono text, cellulare text,
  sconto_perc numeric(5,2) not null default 0 check (sconto_perc between 0 and 100),
  lead_time_giorni int not null default 3,  -- per i fornitori: giorni tra ordine e arrivo
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on anagrafiche (magazzino_id, tipo, ragione_sociale);
create unique index on anagrafiche (magazzino_id, tipo, codice) where codice is not null;

create table ubicazioni (
  id uuid primary key default gen_random_uuid(),
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  codice text not null check (char_length(codice) <= 500),  -- es. A-01-03
  zona text, corridoio text, scaffale text,
  created_at timestamptz not null default now(),
  unique (magazzino_id, codice)
);

create table articoli (
  id uuid primary key default gen_random_uuid(),
  magazzino_id uuid not null references magazzini(id) on delete cascade,
  matricola text not null check (char_length(matricola) <= 500),
  descrizione text not null check (char_length(descrizione) <= 500),
  um text not null default 'PZ.',
  categoria text not null default 'Standard',
  gruppo text,
  prezzo_acquisto_cent bigint not null default 0,
  iva_perc numeric(5,2) not null default 22 check (iva_perc between 0 and 100),
  ricarico_perc numeric(5,2) not null default 0 check (ricarico_perc between 0 and 999.99),
  sconto_perc numeric(5,2) not null default 0 check (sconto_perc between 0 and 100),
  scorta_minima numeric(14,3) not null default 0 check (scorta_minima >= 0 and scorta_minima <> 'NaN'),
  scorta_sicurezza numeric(14,3) not null default 0 check (scorta_sicurezza >= 0 and scorta_sicurezza <> 'NaN'),
  punto_riordino numeric(14,3) not null default 0 check (punto_riordino >= 0 and punto_riordino <> 'NaN'),
  lead_time_giorni int not null default 3,
  domanda_giornaliera numeric(14,3) check (domanda_giornaliera >= 0 and domanda_giornaliera <> 'NaN'),  -- nulla = calcolata dai movimenti
  costo_ordine_cent bigint not null default 0,  -- per EOQ
  costo_mantenimento_perc numeric(5,2) not null default 20 check (costo_mantenimento_perc between 0 and 100),
  barcode text,
  ubicazione_id uuid references ubicazioni(id) on delete set null,
  fornitore_abituale_id uuid references anagrafiche(id) on delete set null,
  codice_fornitore text,
  gestione_lotti boolean not null default false,
  note text check (char_length(note) <= 500),
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
  codice text not null check (char_length(codice) <= 500),
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
  qta numeric(14,3) not null default 0 check (qta <> 'NaN')
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
  titolo text check (char_length(titolo) <= 500), banca text, iban text, condizioni_pagamento text,
  pagato boolean not null default false,
  note text check (char_length(note) <= 500),
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
  descrizione text not null check (char_length(descrizione) <= 500),
  qta numeric(14,3) not null default 1 check (qta > 0 and qta <> 'NaN'),
  prezzo_cent bigint not null default 0,
  sconto_perc numeric(5,2) not null default 0 check (sconto_perc between 0 and 100),
  iva_perc numeric(5,2) not null default 22 check (iva_perc between 0 and 100),
  inps_perc numeric(5,2) not null default 0 check (inps_perc between 0 and 100),
  ritenuta_perc numeric(5,2) not null default 0 check (ritenuta_perc between 0 and 100),
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
  qta numeric(14,3) not null check (qta <> 'NaN'),  -- con segno: + entra, - esce
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
  nome text not null check (char_length(nome) <= 500),
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
  qta_sistema numeric(14,3) not null check (qta_sistema <> 'NaN'),
  qta_contata numeric(14,3) check (qta_contata >= 0 and qta_contata <> 'NaN'),
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
  oggetto text not null check (char_length(oggetto) <= 500),
  descrizione text check (char_length(descrizione) <= 500),
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
  nome text not null check (char_length(nome) <= 500),
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
  qta_reale numeric(14,3) not null check (qta_reale >= 0 and qta_reale <> 'NaN')
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
  -- restrict: eliminare una merce o un cliente dello scenario non deve cancellare i compiti degli altri studenti
  articolo_id uuid references articoli(id) on delete restrict,
  anagrafica_id uuid references anagrafiche(id) on delete restrict,
  qta numeric(14,3) check (qta <> 'NaN'),
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

-- ===== migrations/0002_base.sql =====
-- 0002_base.sql
-- Base comune: identita', permessi, registro attivita', sessione. Tutte le altre migrazioni la usano.
-- Solo plpgsql: le funzioni si risolvono a runtime, l'ordine dei file non conta per i corpi.

create function _uid() returns uuid language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'non_autenticato'; end if;
  return v;
end $$;

-- vero se la quantita' non e' utilizzabile: nulla, NaN, infinita o oltre il limite di numeric(14,3).
-- Serve perche' 'NaN' supera ogni controllo "<= 0" / "< 0" (e' maggiore di tutto) e poi avvelena giacenze e totali.
create function _qta_non_valida(n numeric) returns boolean language sql immutable as $$
  select n is null or n in ('NaN', 'Infinity', '-Infinity') or abs(n) >= 100000000000
$$;

-- riga di appartenenza di chi chiama, o permesso_negato
create function _membro(p_magazzino uuid) returns membri
language plpgsql stable security definer set search_path = public as $$
declare m membri;
begin
  select * into m from membri where magazzino_id = p_magazzino and user_id = _uid();
  if not found then raise exception 'permesso_negato'; end if;
  return m;
end $$;

create function _sono_docente(p_magazzino uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from membri where magazzino_id = p_magazzino and user_id = _uid() and ruolo = 'docente');
end $$;

-- vero per: docente della classe, proprietario del personale, jolly (ruolo aziendale nullo), o azione prevista dal ruolo
create function _puo(p_magazzino uuid, p_azione text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m membri; tipo_m text;
begin
  select * into m from membri where magazzino_id = p_magazzino and user_id = _uid();
  if not found then return false; end if;
  if m.ruolo = 'docente' then return true; end if;
  select tipo into tipo_m from magazzini where id = p_magazzino;
  if tipo_m = 'personale' or m.ruolo_aziendale is null then return true; end if;
  return exists (select 1 from permessi_ruolo where ruolo_aziendale = m.ruolo_aziendale and azione = p_azione);
end $$;

create function _richiedi(p_magazzino uuid, p_azione text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not _puo(p_magazzino, p_azione) then raise exception 'permesso_negato'; end if;
end $$;

create function _registra(p_magazzino uuid, p_azione text, p_entita text, p_entita_id uuid, p_dettagli jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into attivita (magazzino_id, user_id, azione, entita, entita_id, dettagli)
  values (p_magazzino, auth.uid(), p_azione, p_entita, p_entita_id, coalesce(p_dettagli, '{}'));
end $$;

-- ogni nuovo utente (Supabase Auth o shim locale) riceve il profilo. Lo username viene SOLO dall'email finta
-- <username>@shipping.local, mai dai metadati (modificabili da chi si registra): altrimenti chiunque potrebbe prenotare lo
-- username di un docente, che viene promosso per username.
create function _nuovo_utente() returns trigger language plpgsql security definer set search_path = public as $$
declare u text := lower(split_part(coalesce(new.email, ''), '@', 1));
begin
  insert into profili (user_id, username, nome)
  values (new.id, u, coalesce(new.raw_user_meta_data ->> 'nome', ''));
  return new;
end $$;
create trigger nuovo_utente after insert on auth.users for each row execute function _nuovo_utente();

insert into permessi_ruolo (ruolo_aziendale, azione) values
  ('magazziniere','carico'), ('magazziniere','scarico'), ('magazziniere','reso'), ('magazziniere','trasferimento'),
  ('magazziniere','inventario'), ('magazziniere','evadi_ordine'), ('magazziniere','spedizione'),
  ('magazziniere','lotti_ubicazioni'), ('magazziniere','scadenze'),
  ('acquisti','ordine_fornitore'), ('acquisti','anagrafiche.scrivi'), ('acquisti','articoli.scrivi'), ('acquisti','scadenze'),
  ('commerciale','preventivo'), ('commerciale','ordine_cliente'), ('commerciale','anagrafiche.scrivi'), ('commerciale','scadenze'),
  ('amministrazione','fattura'), ('amministrazione','anagrafiche.scrivi'), ('amministrazione','scadenze');

create function api_inizializza() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); p profili; mid uuid;
begin
  select * into p from profili where user_id = u;
  if not found then raise exception 'non_trovato'; end if;
  -- un solo magazzino personale per utente (indice unico parziale): due chiamate insieme non danno errore, la seconda non fa nulla
  insert into magazzini (nome, tipo, proprietario_id) values ('Il mio magazzino', 'personale', u)
  on conflict (proprietario_id) where tipo = 'personale' do nothing returning id into mid;
  if mid is not null then
    insert into membri (magazzino_id, user_id, ruolo) values (mid, u, 'studente');
    insert into azienda (magazzino_id) values (mid);
  end if;
  return jsonb_build_object(
    'profilo', to_jsonb(p),
    'magazzini', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'tipo', m.tipo,
                                          'ruolo', mb.ruolo, 'ruolo_aziendale', mb.ruolo_aziendale)
                       order by m.tipo, m.nome)
      from membri mb join magazzini m on m.id = mb.magazzino_id
      where mb.user_id = u), '[]'::jsonb));
end $$;

create function api_heartbeat(p_magazzino uuid, p_pagina text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  if p_magazzino is not null then perform _membro(p_magazzino); end if;
  -- pagina: testo libero del client, troncato a 100 caratteri
  insert into presenze (user_id, magazzino_id, pagina, visto_il) values (u, p_magazzino, left(p_pagina, 100), now())
  on conflict (user_id) do update set magazzino_id = excluded.magazzino_id, pagina = excluded.pagina, visto_il = now();
  return jsonb_build_object('ok', true);
end $$;

-- ===== migrations/0003_dati.sql =====
-- 0003_dati.sql
-- Dati di base di un magazzino: azienda, anagrafiche, articoli, ubicazioni, lotti, impostazioni.
-- Lettura: basta essere membri. Scrittura: _richiedi(magazzino, azione). Ogni scrittura finisce in `attivita`.
-- Errori: permesso_negato, non_trovato, dato_non_valido, gia_esiste, stato_non_valido.

-- =====================================================================
-- Azienda
-- =====================================================================

-- ritorna: {magazzino_id, ragione_sociale, indirizzo, comune, nazione, fax, cod_fisc, p_iva, telefono, cellulare,
--           email, sito_web, capitale_sociale, altro, updated_at}  (se la riga manca: solo magazzino_id, ragione_sociale '', nazione 'Italia')
create function api_azienda_leggi(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_az azienda;
begin
  perform _membro(p_magazzino);
  select * into v_az from azienda where magazzino_id = p_magazzino;
  if not found then
    return jsonb_build_object('magazzino_id', p_magazzino, 'ragione_sociale', '', 'nazione', 'Italia');
  end if;
  return to_jsonb(v_az);
end $$;

-- p_dati: chiavi di `azienda` (le assenti restano invariate). Permesso: anagrafiche.scrivi.
-- ritorna: la stessa forma di api_azienda_leggi, dopo il salvataggio
create function api_azienda_salva(p_magazzino uuid, p_dati jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_az azienda; v_new azienda;
begin
  perform _richiedi(p_magazzino, 'anagrafiche.scrivi');
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then raise exception 'dato_non_valido'; end if;
  insert into azienda (magazzino_id) values (p_magazzino) on conflict (magazzino_id) do nothing;
  select * into v_az from azienda where magazzino_id = p_magazzino;
  begin
    v_new := jsonb_populate_record(v_az, p_dati);
    update azienda set
      ragione_sociale = btrim(coalesce(v_new.ragione_sociale, '')), indirizzo = v_new.indirizzo, comune = v_new.comune,
      nazione = v_new.nazione, fax = v_new.fax, cod_fisc = v_new.cod_fisc, p_iva = v_new.p_iva,
      telefono = v_new.telefono, cellulare = v_new.cellulare, email = v_new.email, sito_web = v_new.sito_web,
      capitale_sociale = v_new.capitale_sociale, altro = v_new.altro
    where magazzino_id = p_magazzino returning * into v_az;
  exception
    when invalid_text_representation or datatype_mismatch or not_null_violation or check_violation then raise exception 'dato_non_valido';
  end;
  perform _registra(p_magazzino, 'azienda.salva', 'azienda', p_magazzino, jsonb_build_object('ragione_sociale', v_az.ragione_sociale));
  return to_jsonb(v_az);
end $$;

-- =====================================================================
-- Anagrafiche (clienti e fornitori)
-- =====================================================================

-- p_tipo: 'cliente' | 'fornitore' | null (tutti). p_cerca: testo libero su ragione sociale, codice, comune, p_iva, email.
-- ritorna: [{id, magazzino_id, tipo, codice, ragione_sociale, indirizzo, comune, email, sito_web, banca, iban, cod_fisc,
--            p_iva, telefono, cellulare, sconto_perc, lead_time_giorni, note, created_at, updated_at}] ordinate per ragione_sociale
create function api_anagrafiche_elenco(p_magazzino uuid, p_tipo text default null, p_cerca text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_res jsonb; v_c text := nullif(btrim(coalesce(p_cerca, '')), '');
begin
  perform _membro(p_magazzino);
  if nullif(p_tipo, '') is not null and p_tipo not in ('cliente', 'fornitore') then raise exception 'dato_non_valido'; end if;
  select coalesce(jsonb_agg(to_jsonb(n) order by lower(n.ragione_sociale), n.id), '[]'::jsonb) into v_res
  from anagrafiche n
  where n.magazzino_id = p_magazzino
    and (nullif(p_tipo, '') is null or n.tipo = p_tipo)
    and (v_c is null or n.ragione_sociale ilike '%' || v_c || '%' or n.codice ilike '%' || v_c || '%'
         or n.comune ilike '%' || v_c || '%' or n.p_iva ilike '%' || v_c || '%' or n.email ilike '%' || v_c || '%');
  return v_res;
end $$;

-- p_dati: campi di `anagrafiche`. Con `id` modifica (il tipo non cambia), senza crea (tipo e ragione_sociale obbligatori).
-- Permesso: anagrafiche.scrivi. Codice duplicato nello stesso tipo: gia_esiste.
-- ritorna: la riga salvata {id, magazzino_id, tipo, codice, ragione_sociale, ..., sconto_perc, lead_time_giorni, note}
create function api_anagrafica_salva(p_magazzino uuid, p_dati jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m uuid := p_magazzino; v_old anagrafiche; v_new anagrafiche; v_crea boolean;
begin
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then raise exception 'dato_non_valido'; end if;
  v_crea := nullif(p_dati ->> 'id', '') is null;
  if not v_crea then
    select magazzino_id into v_m from anagrafiche where id = (p_dati ->> 'id')::uuid;
    if not found then raise exception 'non_trovato'; end if;
  end if;
  perform _richiedi(v_m, 'anagrafiche.scrivi');
  begin
    if v_crea then
      if btrim(coalesce(p_dati ->> 'ragione_sociale', '')) = '' or coalesce(p_dati ->> 'tipo', '') not in ('cliente', 'fornitore') then
        raise exception 'dato_non_valido';
      end if;
      insert into anagrafiche (magazzino_id, tipo, ragione_sociale)
      values (v_m, p_dati ->> 'tipo', btrim(p_dati ->> 'ragione_sociale')) returning * into v_old;
    else
      select * into v_old from anagrafiche where id = (p_dati ->> 'id')::uuid;
    end if;
    v_new := jsonb_populate_record(v_old, p_dati);
    v_new.ragione_sociale := btrim(coalesce(v_new.ragione_sociale, ''));
    v_new.codice := nullif(btrim(coalesce(v_new.codice, '')), '');
    v_new.sconto_perc := coalesce(v_new.sconto_perc, 0);
    v_new.lead_time_giorni := coalesce(v_new.lead_time_giorni, v_old.lead_time_giorni);
    if v_new.ragione_sociale = '' or v_new.sconto_perc not between 0 and 100 or v_new.lead_time_giorni < 0 then
      raise exception 'dato_non_valido';
    end if;
    update anagrafiche set
      codice = v_new.codice, ragione_sociale = v_new.ragione_sociale, indirizzo = v_new.indirizzo, comune = v_new.comune,
      email = v_new.email, sito_web = v_new.sito_web, banca = v_new.banca, iban = v_new.iban, cod_fisc = v_new.cod_fisc,
      p_iva = v_new.p_iva, telefono = v_new.telefono, cellulare = v_new.cellulare, sconto_perc = v_new.sconto_perc,
      lead_time_giorni = v_new.lead_time_giorni, note = v_new.note
    where id = v_old.id returning * into v_new;
  exception
    when unique_violation then raise exception 'gia_esiste';
    when not_null_violation or check_violation or numeric_value_out_of_range or invalid_text_representation or datatype_mismatch then
      raise exception 'dato_non_valido';
  end;
  perform _registra(v_m, case when v_crea then 'anagrafica.crea' else 'anagrafica.modifica' end, 'anagrafica', v_new.id,
                    jsonb_build_object('tipo', v_new.tipo, 'ragione_sociale', v_new.ragione_sociale));
  return to_jsonb(v_new);
end $$;

-- Permesso: anagrafiche.scrivi. Se ha documenti collegati o e' usata nei compiti di uno scenario: stato_non_valido
-- (nel secondo caso con detail 'usata_nei_compiti').
-- ritorna: {ok: true, id}
create function api_anagrafica_elimina(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ana anagrafiche;
begin
  select * into v_ana from anagrafiche where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(v_ana.magazzino_id, 'anagrafiche.scrivi');
  if exists (select 1 from compiti where anagrafica_id = p_id) then
    raise exception 'stato_non_valido' using detail = 'usata_nei_compiti', hint = 'Cliente o fornitore usato nei compiti di uno scenario: non si puo'' eliminare.';
  end if;
  begin
    delete from anagrafiche where id = p_id;
  exception when foreign_key_violation or restrict_violation then raise exception 'stato_non_valido';
  end;
  perform _registra(v_ana.magazzino_id, 'anagrafica.elimina', 'anagrafica', p_id,
                    jsonb_build_object('tipo', v_ana.tipo, 'ragione_sociale', v_ana.ragione_sociale));
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- Documenti intestati all'anagrafica, i piu' recenti per primi. p_limite predefinito 50 (massimo 500).
-- ritorna: [{id, tipo, anno, numero, data, stato, stato_spedizione, pagato, imponibile_cent, imposta_cent, totale_cent, created_at}]
create function api_anagrafica_storico(p_id uuid, p_limite int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m uuid; v_res jsonb;
begin
  select magazzino_id into v_m from anagrafiche where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(v_m);
  select coalesce(jsonb_agg(to_jsonb(t) order by t.data desc, t.created_at desc, t.id), '[]'::jsonb) into v_res
  from (select d.id, d.tipo, d.anno, d.numero, d.data, d.stato, d.stato_spedizione, d.pagato,
               d.imponibile_cent, d.imposta_cent, d.totale_cent, d.created_at
        from documenti d where d.anagrafica_id = p_id
        order by d.data desc, d.created_at desc, d.id
        limit greatest(1, least(coalesce(p_limite, 50), 500))) t;
  return v_res;
end $$;

-- =====================================================================
-- Articoli
-- =====================================================================

-- Interno, senza permessi ne' registro: crea (senza p_dati.id) o aggiorna (con id) un articolo del magazzino.
-- Chiavi modificabili: matricola, descrizione, um, categoria, gruppo, prezzo_acquisto_cent, iva_perc, ricarico_perc,
-- sconto_perc, scorta_minima, scorta_sicurezza, punto_riordino, lead_time_giorni, domanda_giornaliera, costo_ordine_cent,
-- costo_mantenimento_perc, barcode, ubicazione_id, fornitore_abituale_id, codice_fornitore, gestione_lotti, note, attivo.
-- Solo in creazione: giacenza_iniziale (> 0 crea giacenza e movimento 'apertura').
-- Se punto_riordino non e' indicato diventa almeno max(scorta_minima (solo creazione), scorta_sicurezza).
create function _articolo_scrivi(p_magazzino uuid, p_dati jsonb) returns articoli
language plpgsql security definer set search_path = public as $$
declare v_old articoli; v_new articoli; v_crea boolean; v_giac numeric := 0;
begin
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then raise exception 'dato_non_valido'; end if;
  v_crea := nullif(p_dati ->> 'id', '') is null;
  begin
    if v_crea then
      if btrim(coalesce(p_dati ->> 'matricola', '')) = '' or btrim(coalesce(p_dati ->> 'descrizione', '')) = '' then
        raise exception 'dato_non_valido';
      end if;
      v_giac := coalesce(nullif(p_dati ->> 'giacenza_iniziale', '')::numeric, 0);
      if _qta_non_valida(v_giac) or v_giac < 0 then raise exception 'dato_non_valido'; end if;
      insert into articoli (magazzino_id, matricola, descrizione)
      values (p_magazzino, btrim(p_dati ->> 'matricola'), btrim(p_dati ->> 'descrizione')) returning * into v_old;
    else
      select * into v_old from articoli where id = (p_dati ->> 'id')::uuid and magazzino_id = p_magazzino;
      if not found then raise exception 'non_trovato'; end if;
    end if;
    v_new := jsonb_populate_record(v_old, p_dati);
    v_new.matricola := btrim(coalesce(v_new.matricola, ''));
    v_new.descrizione := btrim(coalesce(v_new.descrizione, ''));
    v_new.um := coalesce(nullif(btrim(coalesce(v_new.um, '')), ''), v_old.um);
    v_new.categoria := coalesce(nullif(btrim(coalesce(v_new.categoria, '')), ''), v_old.categoria);
    v_new.prezzo_acquisto_cent := coalesce(v_new.prezzo_acquisto_cent, v_old.prezzo_acquisto_cent);
    v_new.iva_perc := coalesce(v_new.iva_perc, v_old.iva_perc);
    v_new.ricarico_perc := coalesce(v_new.ricarico_perc, v_old.ricarico_perc);
    v_new.sconto_perc := coalesce(v_new.sconto_perc, v_old.sconto_perc);
    v_new.scorta_minima := coalesce(v_new.scorta_minima, v_old.scorta_minima);
    v_new.scorta_sicurezza := coalesce(v_new.scorta_sicurezza, v_old.scorta_sicurezza);
    v_new.punto_riordino := coalesce(v_new.punto_riordino, v_old.punto_riordino);
    v_new.lead_time_giorni := coalesce(v_new.lead_time_giorni, v_old.lead_time_giorni);
    v_new.costo_ordine_cent := coalesce(v_new.costo_ordine_cent, v_old.costo_ordine_cent);
    v_new.costo_mantenimento_perc := coalesce(v_new.costo_mantenimento_perc, v_old.costo_mantenimento_perc);
    v_new.gestione_lotti := coalesce(v_new.gestione_lotti, v_old.gestione_lotti);
    v_new.attivo := coalesce(v_new.attivo, v_old.attivo);
    if not (p_dati ? 'punto_riordino') then
      v_new.punto_riordino := greatest(v_new.punto_riordino, v_new.scorta_sicurezza, case when v_crea then v_new.scorta_minima else 0 end);
    end if;
    if v_new.matricola = '' or v_new.descrizione = ''
       or v_new.prezzo_acquisto_cent < 0 or v_new.costo_ordine_cent < 0 or v_new.lead_time_giorni < 0
       or v_new.scorta_minima < 0 or v_new.scorta_sicurezza < 0 or v_new.punto_riordino < 0
       or coalesce(v_new.domanda_giornaliera, 0) < 0 or v_new.ricarico_perc < 0
       or v_new.iva_perc not between 0 and 100 or v_new.sconto_perc not between 0 and 100
       or v_new.costo_mantenimento_perc not between 0 and 100
       or v_new.punto_riordino < v_new.scorta_sicurezza then
      raise exception 'dato_non_valido';
    end if;
    if v_new.ubicazione_id is not null
       and not exists (select 1 from ubicazioni where id = v_new.ubicazione_id and magazzino_id = p_magazzino) then
      raise exception 'dato_non_valido';
    end if;
    if v_new.fornitore_abituale_id is not null
       and not exists (select 1 from anagrafiche where id = v_new.fornitore_abituale_id and magazzino_id = p_magazzino and tipo = 'fornitore') then
      raise exception 'dato_non_valido';
    end if;
    update articoli set
      matricola = v_new.matricola, descrizione = v_new.descrizione, um = v_new.um, categoria = v_new.categoria,
      gruppo = v_new.gruppo, prezzo_acquisto_cent = v_new.prezzo_acquisto_cent, iva_perc = v_new.iva_perc,
      ricarico_perc = v_new.ricarico_perc, sconto_perc = v_new.sconto_perc, scorta_minima = v_new.scorta_minima,
      scorta_sicurezza = v_new.scorta_sicurezza, punto_riordino = v_new.punto_riordino,
      lead_time_giorni = v_new.lead_time_giorni, domanda_giornaliera = v_new.domanda_giornaliera,
      costo_ordine_cent = v_new.costo_ordine_cent, costo_mantenimento_perc = v_new.costo_mantenimento_perc,
      barcode = v_new.barcode, ubicazione_id = v_new.ubicazione_id, fornitore_abituale_id = v_new.fornitore_abituale_id,
      codice_fornitore = v_new.codice_fornitore, gestione_lotti = v_new.gestione_lotti, note = v_new.note,
      attivo = v_new.attivo
    where id = v_old.id returning * into v_new;
    if v_crea and v_giac > 0 then
      insert into giacenze (magazzino_id, articolo_id, ubicazione_id, qta) values (p_magazzino, v_new.id, v_new.ubicazione_id, v_giac);
      insert into movimenti_stock (magazzino_id, articolo_id, ubicazione_id, qta, costo_unit_cent, causale, user_id)
      values (p_magazzino, v_new.id, v_new.ubicazione_id, v_giac, v_new.prezzo_acquisto_cent, 'apertura', auth.uid());
    end if;
  exception
    when unique_violation then raise exception 'gia_esiste';
    when not_null_violation or check_violation or numeric_value_out_of_range or invalid_text_representation
         or datatype_mismatch or foreign_key_violation then
      raise exception 'dato_non_valido';
  end;
  return v_new;
end $$;

-- Una riga per articolo del magazzino, per descrizione. p_cerca: matricola, descrizione, barcode o codice fornitore.
-- carichi/scarichi/resi: totali dal registro movimenti_stock (numeri positivi, al netto degli annulli);
-- giacenza: somma di giacenze; ordinato: quantita' nelle righe di ordini fornitore confermati (non evasi ne' annullati).
-- stato_riga: 'blu' se ordinato > 0, altrimenti 'giallo' se punto_riordino > 0 e giacenza <= punto_riordino, altrimenti 'verde'.
-- ritorna: [{id, magazzino_id, matricola, descrizione, um, categoria, gruppo, prezzo_acquisto_cent, iva_perc, ricarico_perc,
--            sconto_perc, scorta_minima, scorta_sicurezza, punto_riordino, lead_time_giorni, domanda_giornaliera,
--            costo_ordine_cent, costo_mantenimento_perc, barcode, ubicazione_id, fornitore_abituale_id, codice_fornitore,
--            gestione_lotti, note, attivo, scenario_id, created_at, updated_at,
--            ubicazione_codice, fornitore_nome, carichi, scarichi, resi, giacenza, ordinato, stato_riga}]
create function api_articoli_elenco(p_magazzino uuid, p_cerca text default null, p_categoria text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_res jsonb; v_c text := nullif(btrim(coalesce(p_cerca, '')), ''); v_cat text := nullif(btrim(coalesce(p_categoria, '')), '');
begin
  perform _membro(p_magazzino);
  select coalesce(jsonb_agg(to_jsonb(x) order by lower(x.descrizione), x.matricola), '[]'::jsonb) into v_res
  from (
    select a.*, u.codice as ubicazione_codice, f.ragione_sociale as fornitore_nome,
           coalesce(g.qta, 0) as giacenza,
           coalesce(mv.carichi, 0) as carichi, coalesce(mv.scarichi, 0) as scarichi, coalesce(mv.resi, 0) as resi,
           coalesce(o.qta, 0) as ordinato,
           case when coalesce(o.qta, 0) > 0 then 'blu'
                when a.punto_riordino > 0 and coalesce(g.qta, 0) <= a.punto_riordino then 'giallo'
                else 'verde' end as stato_riga
    from articoli a
    left join ubicazioni u on u.id = a.ubicazione_id
    left join anagrafiche f on f.id = a.fornitore_abituale_id
    left join lateral (select sum(gg.qta) as qta from giacenze gg where gg.articolo_id = a.id) g on true
    left join lateral (
      select sum(m.qta) filter (where m.causale = 'carico' or (m.causale = 'annullo' and d.tipo = 'carico')) as carichi,
             -sum(m.qta) filter (where m.causale = 'scarico' or (m.causale = 'annullo' and d.tipo = 'scarico')) as scarichi,
             sum(m.qta) filter (where m.causale = 'reso_cliente' or (m.causale = 'annullo' and d.tipo = 'reso_cliente')) as resi
      from movimenti_stock m left join documenti d on d.id = m.documento_id
      where m.articolo_id = a.id) mv on true
    left join lateral (
      select sum(rd.qta) as qta from righe_documento rd join documenti dd on dd.id = rd.documento_id
      where rd.articolo_id = a.id and dd.tipo = 'ordine_fornitore' and dd.stato = 'confermato') o on true
    where a.magazzino_id = p_magazzino
      and (v_cat is null or a.categoria = v_cat)
      and (v_c is null or a.matricola ilike '%' || v_c || '%' or a.descrizione ilike '%' || v_c || '%'
           or a.barcode ilike '%' || v_c || '%' or a.codice_fornitore ilike '%' || v_c || '%')
  ) x;
  return v_res;
end $$;

-- ritorna: {articolo: {...colonne di articoli..., ubicazione_codice, fornitore_nome}, giacenza,
--           giacenze: [{id, lotto_id, lotto_codice, scadenza, ubicazione_id, ubicazione_codice, qta}],
--           movimenti: [{id, causale, qta, costo_unit_cent, lotto_id, lotto_codice, ubicazione_id, ubicazione_codice,
--                        documento_id, username, created_at}]}   (ultimi 20, il piu' recente per primo)
create function api_articolo_leggi(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_art articoli;
begin
  select * into v_art from articoli where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(v_art.magazzino_id);
  return jsonb_build_object(
    'articolo', to_jsonb(v_art) || jsonb_build_object(
      'ubicazione_codice', (select codice from ubicazioni where id = v_art.ubicazione_id),
      'fornitore_nome', (select ragione_sociale from anagrafiche where id = v_art.fornitore_abituale_id)),
    'giacenza', coalesce((select sum(qta) from giacenze where articolo_id = v_art.id), 0),
    'giacenze', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.scadenza nulls last, t.lotto_codice nulls first, t.ubicazione_codice nulls first)
      from (select g.id, g.lotto_id, l.codice as lotto_codice, l.scadenza, g.ubicazione_id, u.codice as ubicazione_codice, g.qta
            from giacenze g left join lotti l on l.id = g.lotto_id left join ubicazioni u on u.id = g.ubicazione_id
            where g.articolo_id = v_art.id) t), '[]'::jsonb),
    'movimenti', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.id desc)
      from (select m.id, m.causale, m.qta, m.costo_unit_cent, m.lotto_id, l.codice as lotto_codice, m.ubicazione_id,
                   u.codice as ubicazione_codice, m.documento_id, p.username, m.created_at
            from movimenti_stock m left join lotti l on l.id = m.lotto_id left join ubicazioni u on u.id = m.ubicazione_id
            left join profili p on p.user_id = m.user_id
            where m.articolo_id = v_art.id order by m.id desc limit 20) t), '[]'::jsonb));
end $$;

-- p_dati: campi di `articoli` (vedi _articolo_scrivi). Con `id` modifica, senza crea (matricola e descrizione obbligatorie).
-- In creazione, `giacenza_iniziale` > 0 apre la giacenza. Permesso: articoli.scrivi.
-- Errori: dato_non_valido (campi vuoti, negativi, punto_riordino < scorta_sicurezza, ubicazione/fornitore di un altro magazzino),
-- gia_esiste (matricola duplicata).
-- ritorna: la riga di articoli salvata {id, magazzino_id, matricola, descrizione, ..., attivo, created_at, updated_at}
create function api_articolo_salva(p_magazzino uuid, p_dati jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m uuid := p_magazzino; v_art articoli; v_crea boolean;
begin
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then raise exception 'dato_non_valido'; end if;
  v_crea := nullif(p_dati ->> 'id', '') is null;
  if not v_crea then
    select magazzino_id into v_m from articoli where id = (p_dati ->> 'id')::uuid;
    if not found then raise exception 'non_trovato'; end if;
  end if;
  perform _richiedi(v_m, 'articoli.scrivi');
  v_art := _articolo_scrivi(v_m, p_dati);
  perform _registra(v_m, case when v_crea then 'articolo.crea' else 'articolo.modifica' end, 'articolo', v_art.id,
                    jsonb_build_object('matricola', v_art.matricola, 'descrizione', v_art.descrizione));
  return to_jsonb(v_art);
end $$;

-- Solo se l'articolo non ha movimenti, righe di documento ne' compiti di scenario, altrimenti stato_non_valido
-- (per i compiti con detail 'usato_nei_compiti'). Permesso: articoli.scrivi.
-- ritorna: {ok: true, id}
create function api_articolo_elimina(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_art articoli;
begin
  select * into v_art from articoli where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(v_art.magazzino_id, 'articoli.scrivi');
  if exists (select 1 from movimenti_stock where articolo_id = p_id)
     or exists (select 1 from righe_documento where articolo_id = p_id) then
    raise exception 'stato_non_valido';
  end if;
  if exists (select 1 from compiti where articolo_id = p_id) then
    raise exception 'stato_non_valido' using detail = 'usato_nei_compiti', hint = 'Articolo usato nei compiti di uno scenario: non si puo'' eliminare.';
  end if;
  begin
    delete from articoli where id = p_id;
  exception when foreign_key_violation or restrict_violation then raise exception 'stato_non_valido';
  end;
  perform _registra(v_art.magazzino_id, 'articolo.elimina', 'articolo', p_id,
                    jsonb_build_object('matricola', v_art.matricola, 'descrizione', v_art.descrizione));
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- p_righe: array di oggetti con le stesse chiavi di api_articolo_salva (matricola e descrizione obbligatorie).
-- Upsert per matricola: se esiste nel magazzino viene aggiornata (solo le chiavi presenti), altrimenti creata.
-- Le righe non valide sono saltate e riportate; le altre vengono importate. Permesso: articoli.scrivi.
-- ritorna: {creati, aggiornati, errori: [{riga (da 1), matricola, errore (codice)}]}
create function api_articoli_importa(p_magazzino uuid, p_righe jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_riga jsonb; v_n int := 0; v_creati int := 0; v_agg int := 0; v_errori jsonb := '[]'::jsonb;
        v_id uuid; v_mat text; v_dati jsonb;
begin
  perform _richiedi(p_magazzino, 'articoli.scrivi');
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' then raise exception 'dato_non_valido'; end if;
  for v_riga in select value from jsonb_array_elements(p_righe) loop
    v_n := v_n + 1;
    begin
      if jsonb_typeof(v_riga) <> 'object' then raise exception 'dato_non_valido'; end if;
      v_mat := btrim(coalesce(v_riga ->> 'matricola', ''));
      v_id := null;
      if v_mat <> '' then select id into v_id from articoli where magazzino_id = p_magazzino and matricola = v_mat; end if;
      v_dati := (v_riga - 'id' - 'magazzino_id') || case when v_id is null then '{}'::jsonb else jsonb_build_object('id', v_id) end;
      perform _articolo_scrivi(p_magazzino, v_dati);
      if v_id is null then v_creati := v_creati + 1; else v_agg := v_agg + 1; end if;
    exception when others then
      v_errori := v_errori || jsonb_build_object('riga', v_n, 'matricola', v_mat,
        'errore', case when sqlerrm in ('dato_non_valido', 'gia_esiste', 'non_trovato') then sqlerrm else 'dato_non_valido' end);
    end;
  end loop;
  perform _registra(p_magazzino, 'articoli.importa', 'articolo', null,
                    jsonb_build_object('creati', v_creati, 'aggiornati', v_agg, 'errori', jsonb_array_length(v_errori)));
  return jsonb_build_object('creati', v_creati, 'aggiornati', v_agg, 'errori', v_errori);
end $$;

-- p_ids: array jsonb di uuid (non vuoto; gli articoli di altri magazzini sono ignorati).
-- p_tipo: 'prezzo_perc' = prezzo di acquisto aumentato di p_valore % (negativo = sconto, minimo -100);
--         'ricarico_perc' = IMPOSTA il ricarico a p_valore % (0-999.99); 'sconto_perc' = IMPOSTA lo sconto fisso a p_valore % (0-100).
-- Permesso: articoli.scrivi.
-- ritorna: {aggiornati: n}
create function api_articoli_variazione(p_magazzino uuid, p_ids jsonb, p_tipo text, p_valore numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_n int;
begin
  perform _richiedi(p_magazzino, 'articoli.scrivi');
  if p_ids is null or jsonb_typeof(p_ids) <> 'array' or jsonb_array_length(p_ids) = 0 or _qta_non_valida(p_valore)
     or p_tipo not in ('prezzo_perc', 'ricarico_perc', 'sconto_perc') then
    raise exception 'dato_non_valido';
  end if;
  if (p_tipo = 'prezzo_perc' and p_valore < -100)
     or (p_tipo = 'ricarico_perc' and p_valore not between 0 and 999.99)
     or (p_tipo = 'sconto_perc' and p_valore not between 0 and 100) then
    raise exception 'dato_non_valido';
  end if;
  begin
    select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(p_ids);
  exception when invalid_text_representation then raise exception 'dato_non_valido';
  end;
  begin
    update articoli set
      prezzo_acquisto_cent = case when p_tipo = 'prezzo_perc' then round(prezzo_acquisto_cent * (1 + p_valore / 100))::bigint else prezzo_acquisto_cent end,
      ricarico_perc = case when p_tipo = 'ricarico_perc' then p_valore else ricarico_perc end,
      sconto_perc = case when p_tipo = 'sconto_perc' then p_valore else sconto_perc end
    where magazzino_id = p_magazzino and id = any (v_ids);
    get diagnostics v_n = row_count;
  exception when numeric_value_out_of_range or check_violation then raise exception 'dato_non_valido';  -- prezzo oltre bigint
  end;
  perform _registra(p_magazzino, 'articoli.variazione', 'articolo', null,
                    jsonb_build_object('tipo', p_tipo, 'valore', p_valore, 'aggiornati', v_n));
  return jsonb_build_object('aggiornati', v_n);
end $$;

-- =====================================================================
-- Ubicazioni
-- =====================================================================

-- ritorna: [{id, magazzino_id, codice, zona, corridoio, scaffale, created_at, n_articoli (articoli con questa ubicazione
--            abituale), qta_totale (somma giacenze li')}] ordinate per codice
create function api_ubicazioni_elenco(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_res jsonb;
begin
  perform _membro(p_magazzino);
  select coalesce(jsonb_agg(to_jsonb(t) order by t.codice), '[]'::jsonb) into v_res
  from (select u.*,
               (select count(*) from articoli a where a.ubicazione_id = u.id)::int as n_articoli,
               coalesce((select sum(g.qta) from giacenze g where g.ubicazione_id = u.id), 0) as qta_totale
        from ubicazioni u where u.magazzino_id = p_magazzino) t;
  return v_res;
end $$;

-- p_dati: {id?, codice, zona?, corridoio?, scaffale?}. Con id modifica. Permesso: lotti_ubicazioni. Codice duplicato: gia_esiste.
-- ritorna: {id, magazzino_id, codice, zona, corridoio, scaffale, created_at}
create function api_ubicazione_salva(p_magazzino uuid, p_dati jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m uuid := p_magazzino; v_ub ubicazioni; v_crea boolean; v_cod text;
begin
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then raise exception 'dato_non_valido'; end if;
  v_crea := nullif(p_dati ->> 'id', '') is null;
  if not v_crea then
    select magazzino_id into v_m from ubicazioni where id = (p_dati ->> 'id')::uuid;
    if not found then raise exception 'non_trovato'; end if;
  end if;
  perform _richiedi(v_m, 'lotti_ubicazioni');
  v_cod := btrim(coalesce(p_dati ->> 'codice', ''));
  begin
    if v_crea then
      if v_cod = '' then raise exception 'dato_non_valido'; end if;
      insert into ubicazioni (magazzino_id, codice, zona, corridoio, scaffale)
      values (v_m, v_cod, p_dati ->> 'zona', p_dati ->> 'corridoio', p_dati ->> 'scaffale') returning * into v_ub;
    else
      if p_dati ? 'codice' and v_cod = '' then raise exception 'dato_non_valido'; end if;
      update ubicazioni set
        codice = case when p_dati ? 'codice' then v_cod else codice end,
        zona = case when p_dati ? 'zona' then p_dati ->> 'zona' else zona end,
        corridoio = case when p_dati ? 'corridoio' then p_dati ->> 'corridoio' else corridoio end,
        scaffale = case when p_dati ? 'scaffale' then p_dati ->> 'scaffale' else scaffale end
      where id = (p_dati ->> 'id')::uuid returning * into v_ub;
    end if;
  exception when unique_violation then raise exception 'gia_esiste';
            when check_violation then raise exception 'dato_non_valido';
  end;
  perform _registra(v_m, case when v_crea then 'ubicazione.crea' else 'ubicazione.modifica' end, 'ubicazione', v_ub.id,
                    jsonb_build_object('codice', v_ub.codice));
  return to_jsonb(v_ub);
end $$;

-- Permesso: lotti_ubicazioni. Se vi e' ancora merce (giacenza <> 0): stato_non_valido.
-- ritorna: {ok: true, id}
create function api_ubicazione_elimina(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ub ubicazioni;
begin
  select * into v_ub from ubicazioni where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(v_ub.magazzino_id, 'lotti_ubicazioni');
  if exists (select 1 from giacenze where ubicazione_id = p_id and qta <> 0) then raise exception 'stato_non_valido'; end if;
  delete from ubicazioni where id = p_id;
  perform _registra(v_ub.magazzino_id, 'ubicazione.elimina', 'ubicazione', p_id, jsonb_build_object('codice', v_ub.codice));
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- =====================================================================
-- Lotti
-- =====================================================================

-- Lotti di un articolo, con scadenza piu' vicina per prima (FEFO), senza scadenza in fondo.
-- ritorna: [{id, magazzino_id, articolo_id, codice, scadenza (data o null), created_at, qta (giacenza totale del lotto)}]
create function api_lotti_elenco(p_articolo uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m uuid; v_res jsonb;
begin
  select magazzino_id into v_m from articoli where id = p_articolo;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(v_m);
  select coalesce(jsonb_agg(to_jsonb(t) order by t.scadenza nulls last, t.codice), '[]'::jsonb) into v_res
  from (select l.*, coalesce((select sum(g.qta) from giacenze g where g.lotto_id = l.id), 0) as qta
        from lotti l where l.articolo_id = p_articolo) t;
  return v_res;
end $$;

-- p_dati: {id?, articolo_id (obbligatorio in creazione), codice, scadenza? ('YYYY-MM-DD' o null)}. Con id modifica codice e scadenza.
-- Permesso: lotti_ubicazioni. Codice duplicato sullo stesso articolo: gia_esiste.
-- ritorna: {id, magazzino_id, articolo_id, codice, scadenza, created_at}
create function api_lotto_salva(p_magazzino uuid, p_dati jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m uuid := p_magazzino; v_lotto lotti; v_crea boolean; v_cod text; v_art uuid;
begin
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then raise exception 'dato_non_valido'; end if;
  v_crea := nullif(p_dati ->> 'id', '') is null;
  if not v_crea then
    select magazzino_id into v_m from lotti where id = (p_dati ->> 'id')::uuid;
    if not found then raise exception 'non_trovato'; end if;
  end if;
  perform _richiedi(v_m, 'lotti_ubicazioni');
  v_cod := btrim(coalesce(p_dati ->> 'codice', ''));
  begin
    if v_crea then
      v_art := nullif(p_dati ->> 'articolo_id', '')::uuid;
      if v_cod = '' or v_art is null then raise exception 'dato_non_valido'; end if;
      if not exists (select 1 from articoli where id = v_art and magazzino_id = v_m) then raise exception 'non_trovato'; end if;
      insert into lotti (magazzino_id, articolo_id, codice, scadenza)
      values (v_m, v_art, v_cod, nullif(p_dati ->> 'scadenza', '')::date) returning * into v_lotto;
    else
      if p_dati ? 'codice' and v_cod = '' then raise exception 'dato_non_valido'; end if;
      update lotti set
        codice = case when p_dati ? 'codice' then v_cod else codice end,
        scadenza = case when p_dati ? 'scadenza' then nullif(p_dati ->> 'scadenza', '')::date else scadenza end
      where id = (p_dati ->> 'id')::uuid returning * into v_lotto;
    end if;
  exception
    when unique_violation then raise exception 'gia_esiste';
    when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or check_violation then raise exception 'dato_non_valido';
  end;
  perform _registra(v_m, case when v_crea then 'lotto.crea' else 'lotto.modifica' end, 'lotto', v_lotto.id,
                    jsonb_build_object('codice', v_lotto.codice, 'articolo_id', v_lotto.articolo_id));
  return to_jsonb(v_lotto);
end $$;

-- =====================================================================
-- Impostazioni del magazzino
-- =====================================================================

-- Senza p_blocca_giacenza_negativa (null) legge soltanto (basta essere membri). Per cambiarla serve essere docente
-- della classe o proprietario del magazzino personale, altrimenti permesso_negato.
-- ritorna: {magazzino_id, blocca_giacenza_negativa}
create function api_magazzino_impostazioni(p_magazzino uuid, p_blocca_giacenza_negativa boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_mb membri; v_mag magazzini;
begin
  v_mb := _membro(p_magazzino);
  select * into v_mag from magazzini where id = p_magazzino;
  if p_blocca_giacenza_negativa is not null then
    if not (v_mb.ruolo = 'docente' or (v_mag.tipo = 'personale' and v_mag.proprietario_id = v_mb.user_id)) then
      raise exception 'permesso_negato';
    end if;
    update magazzini set blocca_giacenza_negativa = p_blocca_giacenza_negativa where id = p_magazzino
    returning * into v_mag;
    perform _registra(p_magazzino, 'magazzino.impostazioni', 'magazzino', p_magazzino,
                      jsonb_build_object('blocca_giacenza_negativa', p_blocca_giacenza_negativa));
  end if;
  return jsonb_build_object('magazzino_id', v_mag.id, 'blocca_giacenza_negativa', v_mag.blocca_giacenza_negativa);
end $$;

-- ===== migrations/0004_documenti.sql =====
-- 0004_documenti.sql
-- Documenti e magazzino: giacenze, movimenti, numerazione, ciclo documentale, spedizioni, trasferimenti.
-- Solo plpgsql. Le tabelle sono in 0001 (invariate). Convenzioni: vedi replica/architecture.md sezioni 3, 4, 5, 8.
-- Nota: le bozze hanno numero NEGATIVO (colonna not null + unique): il numero vero si assegna alla conferma.
-- Le api_* mostrano numero = null per le bozze.

create sequence documenti_bozza_seq;

-- ---------- stub (ridefiniti con create or replace in 0006_scenari.sql: stessi nomi di parametri, ritorno void) ----------
create function _riordino_dinamico(p_magazzino uuid, p_articolo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  null;
end $$;

create function _valuta_compiti(p_magazzino uuid, p_documento uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  null;
end $$;

create function _sblocca_compiti(p_magazzino uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  null;
end $$;

-- ---------- utilita' interne ----------

-- catena valida del ciclo documentale (origine -> derivato): vale per _genera e per documento_origine_id di api_documento_salva
create function _catena_valida(p_da text, p_a text) returns boolean
language sql immutable as $$
  select (p_da, p_a) in (('preventivo', 'ordine_cliente'), ('ordine_cliente', 'scarico'), ('scarico', 'fattura_vendita'),
                         ('ordine_fornitore', 'carico'), ('carico', 'fattura_acquisto'))
$$;

-- azione di permesso del tipo di documento
create function _azione_documento(p_tipo text) returns text
language plpgsql immutable as $$
begin
  return case
    when p_tipo = 'carico' then 'carico'
    when p_tipo = 'scarico' then 'scarico'
    when p_tipo = 'reso_cliente' then 'reso'
    when p_tipo = 'preventivo' then 'preventivo'
    when p_tipo = 'ordine_cliente' then 'ordine_cliente'
    when p_tipo = 'ordine_fornitore' then 'ordine_fornitore'
    when p_tipo in ('fattura_vendita', 'fattura_acquisto') then 'fattura'
    else null end;
end $$;

create function _azione_documento_o_errore(p_tipo text) returns text
language plpgsql immutable as $$
declare a text := _azione_documento(p_tipo);
begin
  if a is null then raise exception 'dato_non_valido'; end if;
  return a;
end $$;

-- costo medio ponderato corrente (centesimi) da apertura, carichi e relativi annulli; ripiega sul prezzo di acquisto
create function _costo_medio(p_articolo uuid) returns bigint
language plpgsql stable security definer set search_path = public as $$
declare v_q numeric; v_v numeric; v_p bigint;
begin
  select sum(qta), sum(qta * costo_unit_cent) into v_q, v_v
  from movimenti_stock where articolo_id = p_articolo and causale in ('apertura', 'carico', 'annullo');
  if v_q > 0 then return round(v_v / v_q)::bigint; end if;
  select prezzo_acquisto_cent into v_p from articoli where id = p_articolo;
  return coalesce(v_p, 0);
end $$;

-- applica un delta a una riga di giacenze (la crea se manca)
create function _giac_applica(p_magazzino uuid, p_articolo uuid, p_lotto uuid, p_ubicazione uuid, p_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into giacenze (magazzino_id, articolo_id, lotto_id, ubicazione_id, qta)
  values (p_magazzino, p_articolo, p_lotto, p_ubicazione, 0)
  on conflict do nothing;
  update giacenze set qta = qta + p_delta
  where articolo_id = p_articolo and lotto_id is not distinct from p_lotto and ubicazione_id is not distinct from p_ubicazione;
end $$;

-- ricalcola righe e totali: netto = round(qta*prezzo*(1-sconto/100)); imposta = round(netto*iva/100);
-- inps e ritenuta sul netto; riga.totale_cent = netto + imposta; totale = imponibile + imposta + inps - ritenuta
create function _ricalcola_documento(p_documento uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_imp numeric; v_iva numeric; v_inps numeric; v_rit numeric;
begin
  update righe_documento
  set totale_cent = (round(qta * prezzo_cent * (1 - sconto_perc / 100))
                     + round(round(qta * prezzo_cent * (1 - sconto_perc / 100)) * iva_perc / 100))::bigint
  where documento_id = p_documento;

  select coalesce(sum(n), 0), coalesce(sum(round(n * iva_perc / 100)), 0),
         coalesce(sum(round(n * inps_perc / 100)), 0), coalesce(sum(round(n * ritenuta_perc / 100)), 0)
  into v_imp, v_iva, v_inps, v_rit
  from (select round(qta * prezzo_cent * (1 - sconto_perc / 100)) as n, iva_perc, inps_perc, ritenuta_perc
        from righe_documento where documento_id = p_documento) s;

  update documenti
  set imponibile_cent = v_imp, imposta_cent = v_iva, inps_cent = v_inps, ritenuta_cent = v_rit,
      totale_cent = v_imp + v_iva + v_inps - v_rit
  where id = p_documento;
end $$;

-- controlla la scorta dell'articolo. Sotto soglia se giacenza + ordinato (ordini fornitore confermati) <= punto_riordino
-- (e punto_riordino > 0): una sola notifica scorta_bassa aperta per articolo + _riordino_dinamico.
-- Quando la giacenza torna sopra il punto: chiude le notifiche aperte e chiama _sblocca_compiti.
create function _controlla_scorte(p_magazzino uuid, p_articolo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare art articoli; v_giac numeric; v_ord numeric; v_chiuse int;
begin
  -- serializza i controlli dello stesso articolo (no key update: non blocca gli insert su giacenze)
  select * into art from articoli where id = p_articolo and magazzino_id = p_magazzino for no key update;
  if not found then return; end if;
  select coalesce(sum(qta), 0) into v_giac from giacenze where articolo_id = p_articolo;
  select coalesce(sum(r.qta), 0) into v_ord
  from righe_documento r join documenti d on d.id = r.documento_id
  where d.magazzino_id = p_magazzino and d.tipo = 'ordine_fornitore' and d.stato = 'confermato' and r.articolo_id = p_articolo;

  if art.punto_riordino > 0 and v_giac + v_ord <= art.punto_riordino then
    if not exists (select 1 from notifiche where magazzino_id = p_magazzino and articolo_id = p_articolo
                   and tipo = 'scorta_bassa' and risolta_il is null) then
      insert into notifiche (magazzino_id, tipo, articolo_id, messaggio)
      values (p_magazzino, 'scorta_bassa', p_articolo,
              format('Scorta bassa: %s (%s). Giacenza %s, punto di riordino %s.',
                     art.descrizione, art.matricola, trim_scale(v_giac), trim_scale(art.punto_riordino)));
      perform _riordino_dinamico(p_magazzino, p_articolo);
    end if;
  elsif v_giac > art.punto_riordino then
    update notifiche set risolta_il = now()
    where magazzino_id = p_magazzino and articolo_id = p_articolo and tipo = 'scorta_bassa' and risolta_il is null;
    get diagnostics v_chiuse = row_count;
    if v_chiuse > 0 then perform _sblocca_compiti(p_magazzino); end if;
  end if;
end $$;

-- muove la giacenza e scrive il registro. p_qta con segno.
-- Scarico con p_lotto e p_ubicazione nulli: lotti FEFO (scadenza piu' vicina) se articoli.gestione_lotti, altrimenti FIFO
-- (giacenza con il primo carico piu' vecchio). Con solo uno dei due valorizzato, consuma tra le righe che combaciano.
-- p_esatto = true (opzionale, aggiunto): nessuna scelta automatica, tocca esattamente la riga (lotto, ubicazione).
create function _movimenta(p_magazzino uuid, p_articolo uuid, p_lotto uuid, p_ubicazione uuid, p_qta numeric,
                           p_costo bigint, p_causale text, p_documento uuid, p_esatto boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare art articoli; v_blocca boolean; v_lotti boolean; v_tot numeric; v_resto numeric; v_prendi numeric; r record;
begin
  if _qta_non_valida(p_qta) or p_qta = 0 then raise exception 'dato_non_valido'; end if;
  select * into art from articoli where id = p_articolo and magazzino_id = p_magazzino;
  if not found then raise exception 'non_trovato'; end if;
  v_lotti := art.gestione_lotti;
  select blocca_giacenza_negativa into v_blocca from magazzini where id = p_magazzino;

  -- blocca tutte le righe dell'articolo, sempre nello stesso ordine: due scarichi insieme si mettono in fila
  perform 1 from giacenze where articolo_id = p_articolo order by id for update;

  if p_qta > 0 then
    perform _giac_applica(p_magazzino, p_articolo, p_lotto, p_ubicazione, p_qta);
    insert into movimenti_stock (magazzino_id, articolo_id, lotto_id, ubicazione_id, qta, costo_unit_cent, causale, documento_id, user_id)
    values (p_magazzino, p_articolo, p_lotto, p_ubicazione, p_qta, coalesce(p_costo, 0), p_causale, p_documento, auth.uid());
  elsif p_esatto then
    select coalesce(sum(qta), 0) into v_tot from giacenze
    where articolo_id = p_articolo and lotto_id is not distinct from p_lotto and ubicazione_id is not distinct from p_ubicazione;
    if v_blocca and v_tot + p_qta < 0 then raise exception 'giacenza_insufficiente'; end if;
    perform _giac_applica(p_magazzino, p_articolo, p_lotto, p_ubicazione, p_qta);
    insert into movimenti_stock (magazzino_id, articolo_id, lotto_id, ubicazione_id, qta, costo_unit_cent, causale, documento_id, user_id)
    values (p_magazzino, p_articolo, p_lotto, p_ubicazione, p_qta, coalesce(p_costo, 0), p_causale, p_documento, auth.uid());
  else
    select coalesce(sum(qta), 0) into v_tot from giacenze
    where articolo_id = p_articolo and (p_lotto is null or lotto_id = p_lotto) and (p_ubicazione is null or ubicazione_id = p_ubicazione);
    if v_blocca and v_tot + p_qta < 0 then raise exception 'giacenza_insufficiente'; end if;
    v_resto := -p_qta;
    for r in
      select gg.lotto_id, gg.ubicazione_id, gg.qta
      from giacenze gg left join lotti ll on ll.id = gg.lotto_id
      where gg.articolo_id = p_articolo and gg.qta > 0
        and (p_lotto is null or gg.lotto_id = p_lotto)
        and (p_ubicazione is null or gg.ubicazione_id = p_ubicazione)
      order by case when v_lotti then ll.scadenza end asc nulls last,
               (select min(m.id) from movimenti_stock m
                where m.articolo_id = gg.articolo_id and m.qta > 0
                  and m.lotto_id is not distinct from gg.lotto_id and m.ubicazione_id is not distinct from gg.ubicazione_id) asc nulls last,
               gg.id
    loop
      exit when v_resto <= 0;
      v_prendi := least(r.qta, v_resto);
      perform _giac_applica(p_magazzino, p_articolo, r.lotto_id, r.ubicazione_id, -v_prendi);
      insert into movimenti_stock (magazzino_id, articolo_id, lotto_id, ubicazione_id, qta, costo_unit_cent, causale, documento_id, user_id)
      values (p_magazzino, p_articolo, r.lotto_id, r.ubicazione_id, -v_prendi, coalesce(p_costo, 0), p_causale, p_documento, auth.uid());
      v_resto := v_resto - v_prendi;
    end loop;
    if v_resto > 0 then  -- solo con blocca_giacenza_negativa = false: il resto va in negativo
      perform _giac_applica(p_magazzino, p_articolo, p_lotto, p_ubicazione, -v_resto);
      insert into movimenti_stock (magazzino_id, articolo_id, lotto_id, ubicazione_id, qta, costo_unit_cent, causale, documento_id, user_id)
      values (p_magazzino, p_articolo, p_lotto, p_ubicazione, -v_resto, coalesce(p_costo, 0), p_causale, p_documento, auth.uid());
    end if;
  end if;

  perform _controlla_scorte(p_magazzino, p_articolo);
end $$;

-- documento come json: la riga di documenti con numero null se bozza, piu' anagrafica {id,codice,ragione_sociale,tipo}
create function _doc_json(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select (to_jsonb(d) - 'numero') || jsonb_build_object(
           'numero', case when d.stato = 'bozza' then null else d.numero end,
           'anagrafica', (select jsonb_build_object('id', a.id, 'codice', a.codice, 'ragione_sociale', a.ragione_sociale, 'tipo', a.tipo)
                          from anagrafiche a where a.id = d.anagrafica_id))
  into v from documenti d where d.id = p_id;
  return v;
end $$;

-- ritorna: {documento:{...colonne di documenti, numero null se bozza, anagrafica:{id,codice,ragione_sociale,tipo}|null},
--   righe:[{...colonne di righe_documento, netto_cent, imposta_cent, articolo_matricola, um, gestione_lotti, lotto_codice,
--           ubicazione_codice, giacenza}], origine:{id,tipo,anno,numero,stato}|null, derivati:[{id,tipo,anno,numero,stato}]}
create function _documento_completo(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d documenti;
begin
  select * into d from documenti where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  return jsonb_build_object(
    'documento', _doc_json(p_id),
    'righe', coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object(
               'netto_cent', x.n,
               'imposta_cent', round(x.n * r.iva_perc / 100),
               'articolo_matricola', a.matricola, 'um', a.um, 'gestione_lotti', a.gestione_lotti,
               'lotto_codice', l.codice, 'ubicazione_codice', u.codice,
               'giacenza', case when r.articolo_id is null then null
                                else (select coalesce(sum(g.qta), 0) from giacenze g where g.articolo_id = r.articolo_id) end)
             order by r.posizione)
      from righe_documento r
      cross join lateral (select round(r.qta * r.prezzo_cent * (1 - r.sconto_perc / 100)) as n) x
      left join articoli a on a.id = r.articolo_id
      left join lotti l on l.id = r.lotto_id
      left join ubicazioni u on u.id = r.ubicazione_id
      where r.documento_id = p_id), '[]'::jsonb),
    'origine', (select jsonb_build_object('id', o.id, 'tipo', o.tipo, 'anno', o.anno,
                                          'numero', case when o.stato = 'bozza' then null else o.numero end, 'stato', o.stato)
                from documenti o where o.id = d.documento_origine_id),
    'derivati', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'tipo', c.tipo, 'anno', c.anno,
                                          'numero', case when c.stato = 'bozza' then null else c.numero end, 'stato', c.stato)
                       order by c.created_at)
      from documenti c where c.documento_origine_id = p_id), '[]'::jsonb));
end $$;

-- conferma interna (nessun controllo permessi: lo fa il chiamante). Muove le giacenze per carico, scarico, reso_cliente.
create function _conferma(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documenti; r record; n int; v_anno int; v_orig uuid;
begin
  -- ordine dei blocchi: SEMPRE prima l'origine, poi il documento (come _genera in api_ordine_evadi): niente deadlock
  select documento_origine_id into v_orig from documenti where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  if v_orig is not null then perform 1 from documenti where id = v_orig for update; end if;
  select * into d from documenti where id = p_id for update;
  if not found then raise exception 'non_trovato'; end if;
  if d.stato <> 'bozza' then raise exception 'stato_non_valido'; end if;
  -- l'origine deve essere ancora 'confermato' (non evasa da un altro derivato, non annullata): niente doppia evasione
  if d.documento_origine_id is distinct from v_orig
     or (v_orig is not null and not exists (select 1 from documenti where id = v_orig and stato = 'confermato')) then
    raise exception 'stato_non_valido';
  end if;
  if not exists (select 1 from righe_documento where documento_id = p_id) then raise exception 'dato_non_valido'; end if;
  perform _ricalcola_documento(p_id);

  if d.tipo in ('carico', 'scarico', 'reso_cliente') then
    for r in select * from righe_documento where documento_id = p_id and articolo_id is not null order by articolo_id, posizione loop
      if d.tipo = 'carico' then
        perform _movimenta(d.magazzino_id, r.articolo_id, r.lotto_id, r.ubicazione_id, r.qta, r.prezzo_cent, 'carico', p_id);
      elsif d.tipo = 'scarico' then
        perform _movimenta(d.magazzino_id, r.articolo_id, r.lotto_id, r.ubicazione_id, -r.qta, _costo_medio(r.articolo_id), 'scarico', p_id);
      else
        perform _movimenta(d.magazzino_id, r.articolo_id, r.lotto_id, r.ubicazione_id, r.qta, _costo_medio(r.articolo_id), 'reso_cliente', p_id);
      end if;
    end loop;
  end if;

  -- numerazione atomica: mai max()+1
  v_anno := extract(year from d.data)::int;
  insert into contatori (magazzino_id, tipo, anno, ultimo) values (d.magazzino_id, d.tipo, v_anno, 1)
  on conflict (magazzino_id, tipo, anno) do update set ultimo = contatori.ultimo + 1
  returning ultimo into n;

  update documenti
  set stato = 'confermato', anno = v_anno, numero = n,
      stato_spedizione = case when d.tipo in ('ordine_cliente', 'scarico') then 'da_preparare' else null end
  where id = p_id;

  if d.documento_origine_id is not null then
    update documenti set stato = 'evaso' where id = d.documento_origine_id and stato = 'confermato';
  end if;

  perform _registra(d.magazzino_id, 'documento_conferma', 'documento', p_id,
                    jsonb_build_object('tipo', d.tipo, 'anno', v_anno, 'numero', n));
  perform _valuta_compiti(d.magazzino_id, p_id);
end $$;

-- crea la bozza derivata copiando righe (nessun permesso: lo fa il chiamante). Ritorna l'id; se esiste gia' una bozza derivata dello stesso tipo, la riusa.
create function _genera(p_origine uuid, p_tipo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o documenti; v_id uuid;
begin
  select * into o from documenti where id = p_origine for update;
  if not found then raise exception 'non_trovato'; end if;
  if not _catena_valida(o.tipo, p_tipo) then raise exception 'dato_non_valido'; end if;
  if o.stato <> 'confermato' then raise exception 'stato_non_valido'; end if;

  select id into v_id from documenti where documento_origine_id = p_origine and tipo = p_tipo and stato = 'bozza' limit 1;
  if v_id is not null then return v_id; end if;

  insert into documenti (magazzino_id, tipo, anno, numero, data, anagrafica_id, documento_origine_id, titolo, banca, iban,
                         condizioni_pagamento, note, creato_da)
  values (o.magazzino_id, p_tipo, extract(year from current_date)::int, -nextval('documenti_bozza_seq')::int, current_date,
          o.anagrafica_id, o.id, case when p_tipo like 'fattura%' then 'FATTURA' else o.titolo end,
          o.banca, o.iban, o.condizioni_pagamento, o.note, auth.uid())
  returning id into v_id;

  insert into righe_documento (documento_id, posizione, articolo_id, descrizione, qta, prezzo_cent, sconto_perc, iva_perc,
                               inps_perc, ritenuta_perc, lotto_id, ubicazione_id)
  select v_id, posizione, articolo_id, descrizione, qta, prezzo_cent, sconto_perc, iva_perc, inps_perc, ritenuta_perc,
         lotto_id, ubicazione_id
  from righe_documento where documento_id = p_origine;

  perform _ricalcola_documento(v_id);
  perform _registra(o.magazzino_id, 'documento_genera', 'documento', v_id,
                    jsonb_build_object('tipo', p_tipo, 'origine_id', p_origine));
  return v_id;
end $$;

-- ---------- API ----------

-- ritorna: [{id, tipo, anno, numero (null se bozza), data, stato, stato_spedizione, anagrafica_id, anagrafica (ragione sociale|null),
--            titolo, imponibile_cent, imposta_cent, totale_cent, pagato, documento_origine_id, n_righe, created_at}]
--          ordinato per data e creazione decrescenti. Filtri tutti opzionali (null = nessun filtro).
create function api_documenti_elenco(p_magazzino uuid, p_tipo text default null, p_dal date default null, p_al date default null,
                                     p_stato text default null, p_cerca text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform _membro(p_magazzino);
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'tipo', d.tipo, 'anno', d.anno, 'numero', case when d.stato = 'bozza' then null else d.numero end,
           'data', d.data, 'stato', d.stato, 'stato_spedizione', d.stato_spedizione,
           'anagrafica_id', d.anagrafica_id, 'anagrafica', a.ragione_sociale, 'titolo', d.titolo,
           'imponibile_cent', d.imponibile_cent, 'imposta_cent', d.imposta_cent, 'totale_cent', d.totale_cent,
           'pagato', d.pagato, 'documento_origine_id', d.documento_origine_id,
           'n_righe', (select count(*) from righe_documento r where r.documento_id = d.id), 'created_at', d.created_at)
         order by d.data desc, d.created_at desc), '[]'::jsonb)
  into v
  from documenti d left join anagrafiche a on a.id = d.anagrafica_id
  where d.magazzino_id = p_magazzino
    and (p_tipo is null or d.tipo = p_tipo)
    and (p_dal is null or d.data >= p_dal)
    and (p_al is null or d.data <= p_al)
    and (p_stato is null or d.stato = p_stato)
    and (coalesce(p_cerca, '') = ''
         or a.ragione_sociale ilike '%' || p_cerca || '%'
         or d.titolo ilike '%' || p_cerca || '%'
         or d.note ilike '%' || p_cerca || '%'
         or (d.stato <> 'bozza' and d.numero::text = p_cerca)
         or exists (select 1 from righe_documento r where r.documento_id = d.id and r.descrizione ilike '%' || p_cerca || '%'));
  return v;
end $$;

-- ritorna: {documento:{...colonne di documenti, numero null se bozza, anagrafica:{id,codice,ragione_sociale,tipo}|null},
--   righe:[{...colonne di righe_documento, netto_cent, imposta_cent, articolo_matricola, um, gestione_lotti, lotto_codice,
--           ubicazione_codice, giacenza}], origine:{id,tipo,anno,numero,stato}|null, derivati:[{id,tipo,anno,numero,stato}]}
create function api_documento_leggi(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_mag uuid;
begin
  select magazzino_id into v_mag from documenti where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(v_mag);
  return _documento_completo(p_id);
end $$;

-- p_documento: {id?, tipo (solo alla creazione), data?, anagrafica_id?, titolo?, banca?, iban?, condizioni_pagamento?, pagato?, note?,
--   documento_origine_id?}. Con id modifica una bozza; le chiavi assenti restano invariate.
--   documento_origine_id (se nuovo o cambiato): dello stesso magazzino, in una catena valida (come api_documento_genera) e
--   'confermato', altrimenti dato_non_valido / stato_non_valido. Alla conferma l'origine deve essere ancora 'confermato'.
-- p_righe (sostituiscono le precedenti): [{articolo_id?, descrizione?, qta, prezzo_cent?, sconto_perc?, iva_perc?, inps_perc?,
--   ritenuta_perc?, lotto_id?, ubicazione_id?}]. articolo_id obbligatorio tranne nelle fatture. Prezzo mancante: da articolo.
-- ritorna: lo stesso oggetto di api_documento_leggi (numero null: la bozza non e' numerata)
create function api_documento_salva(p_magazzino uuid, p_documento jsonb, p_righe jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := _uid();
  v_id uuid; d documenti; v_tipo text; v_data date; v_anag uuid; v_origine uuid; v_pagato boolean;
  v_art articoli; v_art_id uuid; v_qta numeric; v_prezzo bigint; v_iva numeric; v_sconto numeric; v_desc text;
  v_lotto uuid; v_ubi uuid; v_pos int := 0; el jsonb; n bigint; v_inps numeric; v_rit numeric; v_o_tipo text; v_o_stato text;
begin
  if p_documento is null or jsonb_typeof(p_documento) <> 'object' then raise exception 'dato_non_valido'; end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' then raise exception 'dato_non_valido'; end if;

  begin  -- numeri, uuid, date malformati e check delle tabelle diventano dato_non_valido (vedi exception in fondo)
  select * into d from documenti where false;
  v_id := nullif(p_documento ->> 'id', '')::uuid;
  if v_id is not null then
    select * into d from documenti where id = v_id and magazzino_id = p_magazzino for update;
    if not found then raise exception 'non_trovato'; end if;
    v_tipo := d.tipo;
  else
    v_tipo := p_documento ->> 'tipo';
  end if;
  perform _richiedi(p_magazzino, _azione_documento_o_errore(v_tipo));
  if v_id is not null and d.stato <> 'bozza' then raise exception 'stato_non_valido'; end if;

  v_data := case when p_documento ? 'data' then coalesce(nullif(p_documento ->> 'data', '')::date, current_date)
                 else coalesce(d.data, current_date) end;
  v_anag := case when p_documento ? 'anagrafica_id' then nullif(p_documento ->> 'anagrafica_id', '')::uuid else d.anagrafica_id end;
  if v_anag is not null and not exists (
       select 1 from anagrafiche where id = v_anag and magazzino_id = p_magazzino
         and tipo = case when v_tipo in ('carico', 'ordine_fornitore', 'fattura_acquisto') then 'fornitore' else 'cliente' end) then
    raise exception 'dato_non_valido';
  end if;
  v_origine := case when p_documento ? 'documento_origine_id' then nullif(p_documento ->> 'documento_origine_id', '')::uuid
                    else d.documento_origine_id end;
  if v_origine is not null and v_origine is distinct from d.documento_origine_id then
    select tipo, stato into v_o_tipo, v_o_stato from documenti where id = v_origine and magazzino_id = p_magazzino;
    if not found or not _catena_valida(v_o_tipo, v_tipo) then raise exception 'dato_non_valido'; end if;
    if v_o_stato <> 'confermato' then raise exception 'stato_non_valido'; end if;
  end if;
  v_pagato := case when p_documento ? 'pagato' then coalesce((p_documento ->> 'pagato')::boolean, false)
                   else coalesce(d.pagato, false) end;

  if v_id is null then
    insert into documenti (magazzino_id, tipo, anno, numero, data, anagrafica_id, documento_origine_id, titolo, banca, iban,
                           condizioni_pagamento, pagato, note, creato_da)
    values (p_magazzino, v_tipo, extract(year from v_data)::int, -nextval('documenti_bozza_seq')::int, v_data, v_anag, v_origine,
            p_documento ->> 'titolo', p_documento ->> 'banca', p_documento ->> 'iban', p_documento ->> 'condizioni_pagamento',
            v_pagato, p_documento ->> 'note', u)
    returning id into v_id;
  else
    update documenti set
      anno = extract(year from v_data)::int, data = v_data, anagrafica_id = v_anag, documento_origine_id = v_origine, pagato = v_pagato,
      titolo = case when p_documento ? 'titolo' then p_documento ->> 'titolo' else titolo end,
      banca = case when p_documento ? 'banca' then p_documento ->> 'banca' else banca end,
      iban = case when p_documento ? 'iban' then p_documento ->> 'iban' else iban end,
      condizioni_pagamento = case when p_documento ? 'condizioni_pagamento' then p_documento ->> 'condizioni_pagamento' else condizioni_pagamento end,
      note = case when p_documento ? 'note' then p_documento ->> 'note' else note end
    where id = v_id;
    delete from righe_documento where documento_id = v_id;
  end if;

  for el, n in select t.v, t.n from jsonb_array_elements(p_righe) with ordinality as t(v, n) loop
    v_pos := v_pos + 1;
    select * into v_art from articoli where false;
    v_art_id := nullif(el ->> 'articolo_id', '')::uuid;
    if v_art_id is not null then
      select * into v_art from articoli where id = v_art_id and magazzino_id = p_magazzino;
      if not found then raise exception 'dato_non_valido'; end if;
    elsif v_tipo not like 'fattura%' then
      raise exception 'dato_non_valido';
    end if;
    v_desc := coalesce(nullif(el ->> 'descrizione', ''), v_art.descrizione);
    if v_desc is null then raise exception 'dato_non_valido'; end if;
    v_qta := coalesce((el ->> 'qta')::numeric, 1);
    if _qta_non_valida(v_qta) or v_qta <= 0 then raise exception 'dato_non_valido'; end if;
    v_prezzo := coalesce(round((el ->> 'prezzo_cent')::numeric)::bigint,
                         case when v_art_id is null then 0
                              when v_tipo in ('carico', 'ordine_fornitore', 'fattura_acquisto') then v_art.prezzo_acquisto_cent
                              else round(v_art.prezzo_acquisto_cent * (1 + v_art.ricarico_perc / 100))::bigint end);
    v_sconto := coalesce((el ->> 'sconto_perc')::numeric, 0);
    v_iva := coalesce((el ->> 'iva_perc')::numeric, v_art.iva_perc, 22);
    v_inps := coalesce((el ->> 'inps_perc')::numeric, 0);
    v_rit := coalesce((el ->> 'ritenuta_perc')::numeric, 0);
    -- percentuali 0..100 (between respinge anche NaN)
    if not (v_sconto between 0 and 100 and v_iva between 0 and 100 and v_inps between 0 and 100 and v_rit between 0 and 100) then
      raise exception 'dato_non_valido';
    end if;
    v_lotto := nullif(el ->> 'lotto_id', '')::uuid;
    v_ubi := nullif(el ->> 'ubicazione_id', '')::uuid;
    if v_lotto is not null and not exists (select 1 from lotti where id = v_lotto and magazzino_id = p_magazzino
                                           and articolo_id is not distinct from v_art_id) then
      raise exception 'dato_non_valido';
    end if;
    if v_ubi is not null and not exists (select 1 from ubicazioni where id = v_ubi and magazzino_id = p_magazzino) then
      raise exception 'dato_non_valido';
    end if;
    insert into righe_documento (documento_id, posizione, articolo_id, descrizione, qta, prezzo_cent, sconto_perc, iva_perc,
                                 inps_perc, ritenuta_perc, lotto_id, ubicazione_id)
    values (v_id, v_pos, v_art_id, v_desc, v_qta, v_prezzo, v_sconto, v_iva, v_inps, v_rit, v_lotto, v_ubi);
  end loop;

  perform _ricalcola_documento(v_id);
  perform _registra(p_magazzino, 'documento_salva', 'documento', v_id, jsonb_build_object('tipo', v_tipo, 'righe', v_pos));
  return _documento_completo(v_id);
  exception when invalid_text_representation or numeric_value_out_of_range or feature_not_supported or datatype_mismatch or check_violation
                 or datetime_field_overflow or invalid_datetime_format then
    raise exception 'dato_non_valido';
  end;
end $$;

-- ritorna: lo stesso oggetto di api_documento_leggi, con stato 'confermato' e numero assegnato.
-- carico/scarico/reso_cliente muovono le giacenze (errore giacenza_insufficiente se bloccato). Poi _valuta_compiti.
create function api_documento_conferma(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d documenti;
begin
  select * into d from documenti where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(d.magazzino_id, _azione_documento_o_errore(d.tipo));
  perform _conferma(p_id);
  return _documento_completo(p_id);
end $$;

-- ritorna: lo stesso oggetto di api_documento_leggi, con stato 'annullato'. Solo da confermato/evaso.
-- Storna i movimenti (causale annullo, stesso lotto/ubicazione); se l'origine era evasa torna 'confermato'.
create function api_documento_annulla(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d documenti; m record; v_orig uuid;
begin
  perform _uid();
  -- stesso ordine di _conferma: prima l'origine, poi il documento
  select documento_origine_id into v_orig from documenti where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  if v_orig is not null then perform 1 from documenti where id = v_orig for update; end if;
  select * into d from documenti where id = p_id for update;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(d.magazzino_id, _azione_documento_o_errore(d.tipo));
  if d.stato not in ('confermato', 'evaso') then raise exception 'stato_non_valido'; end if;

  for m in select * from movimenti_stock where documento_id = p_id and causale in ('carico', 'scarico', 'reso_cliente')
           order by articolo_id, id loop
    perform _movimenta(d.magazzino_id, m.articolo_id, m.lotto_id, m.ubicazione_id, -m.qta, m.costo_unit_cent, 'annullo', p_id, true);
  end loop;

  update documenti set stato = 'annullato' where id = p_id;
  if d.documento_origine_id is not null and not exists (
       select 1 from documenti where documento_origine_id = d.documento_origine_id and id <> p_id and stato in ('confermato', 'evaso')) then
    update documenti set stato = 'confermato' where id = d.documento_origine_id and stato = 'evaso';
  end if;
  perform _registra(d.magazzino_id, 'documento_annulla', 'documento', p_id,
                    jsonb_build_object('tipo', d.tipo, 'anno', d.anno, 'numero', d.numero));
  return _documento_completo(p_id);
end $$;

-- ritorna: {ok: true, id}. Solo bozze (altrimenti stato_non_valido).
create function api_documento_elimina(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d documenti;
begin
  perform _uid();
  select * into d from documenti where id = p_id for update;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(d.magazzino_id, _azione_documento_o_errore(d.tipo));
  if d.stato <> 'bozza' then raise exception 'stato_non_valido'; end if;
  delete from documenti where id = p_id;
  perform _registra(d.magazzino_id, 'documento_elimina', 'documento', p_id, jsonb_build_object('tipo', d.tipo));
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- ritorna: lo stesso oggetto di api_documento_leggi (documento.pagato aggiornato). Non per documenti annullati.
create function api_documento_pagato(p_id uuid, p_pagato boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d documenti;
begin
  perform _uid();
  select * into d from documenti where id = p_id for update;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(d.magazzino_id, _azione_documento_o_errore(d.tipo));
  if d.stato = 'annullato' then raise exception 'stato_non_valido'; end if;
  update documenti set pagato = coalesce(p_pagato, false) where id = p_id;
  perform _registra(d.magazzino_id, 'documento_pagato', 'documento', p_id, jsonb_build_object('pagato', coalesce(p_pagato, false)));
  return _documento_completo(p_id);
end $$;

-- ritorna: lo stesso oggetto di api_documento_leggi, del NUOVO documento in bozza (con origine valorizzata).
-- Catene: preventivo->ordine_cliente, ordine_cliente->scarico, scarico->fattura_vendita, ordine_fornitore->carico,
-- carico->fattura_acquisto (altrimenti dato_non_valido). L'origine deve essere 'confermato'. Se esiste gia' una bozza derivata
-- dello stesso tipo, la ritorna. L'origine passa a 'evaso' quando il derivato viene confermato.
create function api_documento_genera(p_origine uuid, p_tipo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o documenti; v_id uuid;
begin
  perform _uid();
  select * into o from documenti where id = p_origine;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(o.magazzino_id, _azione_documento_o_errore(p_tipo));
  v_id := _genera(p_origine, p_tipo);
  return _documento_completo(v_id);
end $$;

-- ritorna: lo stesso oggetto di api_documento_leggi, del carico generato e gia' confermato (origine = ordine, che passa a 'evaso').
-- Richiede l'azione 'evadi_ordine'. Solo ordini fornitore 'confermato'.
create function api_ordine_evadi(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o documenti; v_id uuid;
begin
  perform _uid();
  select * into o from documenti where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(o.magazzino_id, 'evadi_ordine');
  if o.tipo <> 'ordine_fornitore' then raise exception 'dato_non_valido'; end if;
  v_id := _genera(p_id, 'carico');
  perform _conferma(v_id);
  return _documento_completo(v_id);
end $$;

-- ritorna: lo stesso oggetto di api_documento_leggi con documento.stato_spedizione aggiornato.
-- p_stato: da_preparare|preparato|spedito|consegnato, solo in avanti (salti ammessi). Solo ordine_cliente e scarico
-- confermati/evasi. Richiede 'spedizione'. Crea una notifica tipo 'spedizione' per la classe.
create function api_spedizione_stato(p_documento uuid, p_stato text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d documenti; v_ordine text[] := array['da_preparare', 'preparato', 'spedito', 'consegnato']; v_new int; v_old int;
begin
  perform _uid();
  select * into d from documenti where id = p_documento for update;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(d.magazzino_id, 'spedizione');
  v_new := array_position(v_ordine, p_stato);
  if v_new is null then raise exception 'dato_non_valido'; end if;
  if d.tipo not in ('ordine_cliente', 'scarico') or d.stato not in ('confermato', 'evaso') then raise exception 'stato_non_valido'; end if;
  v_old := coalesce(array_position(v_ordine, d.stato_spedizione), 1);
  if v_new <= v_old then raise exception 'stato_non_valido'; end if;

  update documenti set stato_spedizione = p_stato where id = p_documento;
  insert into notifiche (magazzino_id, tipo, messaggio)
  values (d.magazzino_id, 'spedizione',
          format('Spedizione %s n. %s/%s: %s', replace(d.tipo, '_', ' '), d.numero, d.anno, replace(p_stato, '_', ' ')));
  perform _registra(d.magazzino_id, 'spedizione_stato', 'documento', p_documento, jsonb_build_object('stato', p_stato));
  return _documento_completo(p_documento);
end $$;

-- ritorna: [{articolo_id, matricola, descrizione, um, lotto_id, lotto_codice, scadenza, ubicazione_id, ubicazione_codice, qta}]
-- righe di giacenza non nulle, ordinate per articolo; p_articolo nullo = tutti gli articoli del magazzino.
create function api_giacenze(p_magazzino uuid, p_articolo uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform _membro(p_magazzino);
  select coalesce(jsonb_agg(jsonb_build_object(
           'articolo_id', g.articolo_id, 'matricola', a.matricola, 'descrizione', a.descrizione, 'um', a.um,
           'lotto_id', g.lotto_id, 'lotto_codice', l.codice, 'scadenza', l.scadenza,
           'ubicazione_id', g.ubicazione_id, 'ubicazione_codice', u.codice, 'qta', g.qta)
         order by a.descrizione, l.scadenza nulls last, u.codice nulls last), '[]'::jsonb)
  into v
  from giacenze g
  join articoli a on a.id = g.articolo_id
  left join lotti l on l.id = g.lotto_id
  left join ubicazioni u on u.id = g.ubicazione_id
  where g.magazzino_id = p_magazzino and g.qta <> 0 and (p_articolo is null or g.articolo_id = p_articolo);
  return v;
end $$;

-- Stub ridefiniti con create or replace in 0006_scenari.sql (valutazione dei compiti trasferimento e inventario).
create function _valuta_trasferimento(p_magazzino uuid, p_articolo uuid, p_qta numeric) returns void
language plpgsql security definer set search_path = public as $$
begin return; end $$;
create function _valuta_inventario(p_magazzino uuid, p_articolo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin return; end $$;

-- ritorna: {ok: true, articolo_id, lotto_id, da, a, qta}. Due movimenti (trasferimento_in, trasferimento_out) nella stessa
-- transazione; p_da e p_a possono essere nulli = "senza ubicazione" ma devono differire. Richiede 'trasferimento'.
create function api_trasferimento(p_magazzino uuid, p_articolo uuid, p_lotto uuid, p_da uuid, p_a uuid, p_qta numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_costo bigint;
begin
  perform _uid();
  perform _richiedi(p_magazzino, 'trasferimento');
  if _qta_non_valida(p_qta) or p_qta <= 0 or p_da is not distinct from p_a then raise exception 'dato_non_valido'; end if;
  if not exists (select 1 from articoli where id = p_articolo and magazzino_id = p_magazzino) then raise exception 'non_trovato'; end if;
  if p_lotto is not null and not exists (select 1 from lotti where id = p_lotto and articolo_id = p_articolo) then raise exception 'dato_non_valido'; end if;
  if (p_da is not null and not exists (select 1 from ubicazioni where id = p_da and magazzino_id = p_magazzino))
     or (p_a is not null and not exists (select 1 from ubicazioni where id = p_a and magazzino_id = p_magazzino)) then
    raise exception 'dato_non_valido';
  end if;
  v_costo := _costo_medio(p_articolo);
  -- prima entra, poi esce: il totale non scende mai sotto il punto di riordino a meta' operazione
  perform _movimenta(p_magazzino, p_articolo, p_lotto, p_a, p_qta, v_costo, 'trasferimento_in', null, true);
  perform _movimenta(p_magazzino, p_articolo, p_lotto, p_da, -p_qta, v_costo, 'trasferimento_out', null, true);
  perform _valuta_trasferimento(p_magazzino, p_articolo, p_qta);
  perform _registra(p_magazzino, 'trasferimento', 'articolo', p_articolo,
                    jsonb_build_object('qta', p_qta, 'da', p_da, 'a', p_a, 'lotto_id', p_lotto));
  return jsonb_build_object('ok', true, 'articolo_id', p_articolo, 'lotto_id', p_lotto, 'da', p_da, 'a', p_a, 'qta', p_qta);
end $$;

-- ===== migrations/0005_classe.sql =====
-- 0005_classe.sql
-- Classe: creazione, ingresso con codice, gestione membri, azzera/elimina, vista docente, notifiche, registro attivita'.
-- Usa solo gli helper di 0002 e le tabelle di 0001.

-- codice di ingresso: 6 caratteri A-Z0-9 senza 0 O 1 I (32 simboli); la collisione e' gestita da chi inserisce
create function _codice_classe() returns text language plpgsql as $$
declare alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text := ''; i int;
begin
  for i in 1..6 loop c := c || substr(alfabeto, 1 + floor(random() * 32)::int, 1); end loop;
  return c;
end $$;

create function _richiedi_docente(p_magazzino uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not _sono_docente(p_magazzino) then raise exception 'permesso_negato'; end if;
end $$;

-- ritorna: {id, nome, tipo:'classe', codice_ingresso, codice_attivo}
-- Massimo 50 classi per docente e nome di al massimo 500 caratteri, altrimenti dato_non_valido.
create function api_classe_crea(p_nome text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); v_nome text := btrim(coalesce(p_nome, '')); mid uuid; cod text;
begin
  -- il blocco sulla riga del profilo mette in fila due creazioni insieme (il limite non si supera)
  perform 1 from profili where user_id = u and ruolo_globale = 'docente' for update;
  if not found then raise exception 'permesso_negato'; end if;
  if v_nome = '' or char_length(v_nome) > 500
     or (select count(*) from magazzini where proprietario_id = u and tipo = 'classe') >= 50 then
    raise exception 'dato_non_valido';
  end if;
  loop
    cod := _codice_classe();
    begin
      insert into magazzini (nome, tipo, proprietario_id, codice_ingresso)
      values (v_nome, 'classe', u, cod) returning id into mid;
      exit;
    exception when unique_violation then null;  -- codice gia' preso: ne genera un altro
    end;
  end loop;
  insert into membri (magazzino_id, user_id, ruolo) values (mid, u, 'docente');
  insert into azienda (magazzino_id, ragione_sociale) values (mid, v_nome);
  perform _registra(mid, 'classe_crea', 'magazzino', mid, jsonb_build_object('nome', v_nome));
  return jsonb_build_object('id', mid, 'nome', v_nome, 'tipo', 'classe', 'codice_ingresso', cod, 'codice_attivo', true);
end $$;

-- ritorna: {id, nome, tipo:'classe', ruolo:'docente'|'studente', ruolo_aziendale:string|null}
-- Idempotente: se sei gia' membro non cambia nulla. Codice disattivato o inesistente: codice_non_valido.
create function api_classe_entra(p_codice text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); m magazzini; mb membri;
begin
  select * into m from magazzini
  where tipo = 'classe' and codice_attivo and codice_ingresso = upper(btrim(coalesce(p_codice, '')));
  if not found then raise exception 'codice_non_valido'; end if;
  if not exists (select 1 from membri where magazzino_id = m.id and user_id = u) then
    insert into membri (magazzino_id, user_id, ruolo) values (m.id, u, 'studente');
    perform _registra(m.id, 'classe_entra', 'magazzino', m.id, '{}');
  end if;
  select * into mb from membri where magazzino_id = m.id and user_id = u;
  return jsonb_build_object('id', m.id, 'nome', m.nome, 'tipo', m.tipo,
                            'ruolo', mb.ruolo, 'ruolo_aziendale', mb.ruolo_aziendale);
end $$;

-- ritorna: {codice, attivo}   (p_azione: rigenera | attiva | disattiva; rigenera non cambia lo stato attivo)
create function api_classe_codice(p_magazzino uuid, p_azione text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m magazzini; cod text;
begin
  perform _richiedi_docente(p_magazzino);
  if p_azione not in ('rigenera', 'attiva', 'disattiva') then raise exception 'dato_non_valido'; end if;
  if p_azione = 'rigenera' then
    loop
      cod := _codice_classe();
      begin
        update magazzini set codice_ingresso = cod where id = p_magazzino and tipo = 'classe';
        exit;
      exception when unique_violation then null;
      end;
    end loop;
  else
    update magazzini set codice_attivo = (p_azione = 'attiva') where id = p_magazzino and tipo = 'classe';
  end if;
  select * into m from magazzini where id = p_magazzino;
  perform _registra(p_magazzino, 'classe_codice_' || p_azione, 'magazzino', p_magazzino, '{}');
  return jsonb_build_object('codice', m.codice_ingresso, 'attivo', m.codice_attivo);
end $$;

-- ritorna: [{user_id, username, nome, ruolo:'docente'|'studente', ruolo_aziendale:string|null, entrato_il}]  (ordinati per ruolo e username)
create function api_classe_membri(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _richiedi_docente(p_magazzino);
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', pr.user_id, 'username', pr.username, 'nome', pr.nome,
                                        'ruolo', mb.ruolo, 'ruolo_aziendale', mb.ruolo_aziendale,
                                        'entrato_il', mb.entrato_il)
                     order by mb.ruolo, pr.username)
    from membri mb join profili pr on pr.user_id = mb.user_id
    where mb.magazzino_id = p_magazzino), '[]'::jsonb);
end $$;

-- ritorna: {user_id, ruolo_aziendale:string|null}   (p_ruolo_aziendale: magazziniere|acquisti|commerciale|amministrazione|null = jolly; solo per studenti)
create function api_classe_imposta_ruolo(p_magazzino uuid, p_user uuid, p_ruolo_aziendale text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mb membri;
begin
  perform _richiedi_docente(p_magazzino);
  if p_ruolo_aziendale is not null
     and p_ruolo_aziendale not in ('magazziniere', 'acquisti', 'commerciale', 'amministrazione') then
    raise exception 'dato_non_valido';
  end if;
  select * into mb from membri where magazzino_id = p_magazzino and user_id = p_user;
  if not found then raise exception 'non_trovato'; end if;
  if mb.ruolo <> 'studente' then raise exception 'dato_non_valido'; end if;
  update membri set ruolo_aziendale = p_ruolo_aziendale where magazzino_id = p_magazzino and user_id = p_user;
  perform _registra(p_magazzino, 'classe_ruolo', 'membro', p_user, jsonb_build_object('ruolo_aziendale', p_ruolo_aziendale));
  return jsonb_build_object('user_id', p_user, 'ruolo_aziendale', p_ruolo_aziendale);
end $$;

-- ritorna: {ok:true}   (il docente non puo' rimuovere se stesso: permesso_negato)
create function api_classe_rimuovi(p_magazzino uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _richiedi_docente(p_magazzino);
  if p_user = _uid() then raise exception 'permesso_negato'; end if;
  delete from membri where magazzino_id = p_magazzino and user_id = p_user;
  if not found then raise exception 'non_trovato'; end if;
  perform _registra(p_magazzino, 'classe_rimuovi', 'membro', p_user, '{}');
  return jsonb_build_object('ok', true);
end $$;

-- ritorna: {ok:true}   (p_conferma = nome della classe, altrimenti conferma_errata; tiene magazzino, membri, azienda)
-- Azzera anche i contatori: la numerazione dei documenti riparte da 1.
create function api_classe_azzera(p_magazzino uuid, p_conferma text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m magazzini;
begin
  perform _richiedi_docente(p_magazzino);
  select * into m from magazzini where id = p_magazzino and tipo = 'classe';
  if not found then raise exception 'non_trovato'; end if;
  if p_conferma is distinct from m.nome then raise exception 'conferma_errata'; end if;
  delete from compiti where magazzino_id = p_magazzino;
  delete from scenari where magazzino_id = p_magazzino;      -- porta via scenario_fisico
  delete from documenti where magazzino_id = p_magazzino;    -- porta via righe_documento
  delete from inventari where magazzino_id = p_magazzino;    -- porta via inventario_righe
  delete from movimenti_stock where magazzino_id = p_magazzino;
  delete from giacenze where magazzino_id = p_magazzino;
  delete from lotti where magazzino_id = p_magazzino;
  delete from articoli where magazzino_id = p_magazzino;
  delete from anagrafiche where magazzino_id = p_magazzino;
  delete from ubicazioni where magazzino_id = p_magazzino;
  delete from scadenze where magazzino_id = p_magazzino;
  delete from notifiche where magazzino_id = p_magazzino;    -- porta via notifiche_lette
  delete from contatori where magazzino_id = p_magazzino;
  delete from attivita where magazzino_id = p_magazzino;
  perform _registra(p_magazzino, 'classe_azzera', 'magazzino', p_magazzino, '{}');
  return jsonb_build_object('ok', true);
end $$;

-- ritorna: {ok:true}   (p_conferma = nome della classe, altrimenti conferma_errata; cancella tutto, membri compresi)
create function api_classe_elimina(p_magazzino uuid, p_conferma text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m magazzini;
begin
  perform _richiedi_docente(p_magazzino);
  select * into m from magazzini where id = p_magazzino and tipo = 'classe';
  if not found then raise exception 'non_trovato'; end if;
  if p_conferma is distinct from m.nome then raise exception 'conferma_errata'; end if;
  -- compiti e documenti prima: compiti e righe_documento hanno fk "restrict" verso articoli e anagrafiche
  delete from compiti where magazzino_id = p_magazzino;
  delete from documenti where magazzino_id = p_magazzino;
  delete from magazzini where id = p_magazzino;
  return jsonb_build_object('ok', true);
end $$;

-- ritorna: [{id, nome, codice_ingresso, codice_attivo, n_iscritti, n_online, created_at}]  (classi in cui sono docente; n_iscritti/n_online contano solo gli studenti, online = battito < 45 s)
create function api_docente_classi() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'nome', m.nome, 'codice_ingresso', m.codice_ingresso, 'codice_attivo', m.codice_attivo,
      'n_iscritti', (select count(*) from membri s where s.magazzino_id = m.id and s.ruolo = 'studente'),
      'n_online', (select count(*) from membri s join presenze pz on pz.user_id = s.user_id
                   where s.magazzino_id = m.id and s.ruolo = 'studente' and pz.visto_il > now() - interval '45 seconds'),
      'created_at', m.created_at) order by m.nome, m.created_at)
    from membri d join magazzini m on m.id = d.magazzino_id
    where d.user_id = u and d.ruolo = 'docente' and m.tipo = 'classe'), '[]'::jsonb);
end $$;

-- ritorna: [{user_id, username, nome, ruolo_aziendale:string|null, online:boolean, pagina:string|null,
--            magazzino_usato:null|{tipo:'classe',id,nome}|{tipo:'personale'},
--            ultima_azione:string|null, ultima_azione_il:string|null,
--            compiti:{totale, completati, errori, bloccati}}]   (solo studenti, ordinati per username)
-- Privacy: per un magazzino personale si vede solo il tipo (e la pagina e' nascosta); id, nome e pagina solo per le classi
-- di cui CHI CHIAMA e' docente: per la classe di un altro docente si vede solo {tipo:'classe'} e la pagina e' nascosta.
-- magazzino_usato e' l'ultimo noto, anche se l'iscritto e' offline. ultima_azione: ultima riga di attivita' nella classe.
create function api_docente_utenti(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _richiedi_docente(p_magazzino);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', pr.user_id, 'username', pr.username, 'nome', pr.nome,
      'ruolo_aziendale', mb.ruolo_aziendale,
      'online', coalesce(pz.visto_il > now() - interval '45 seconds', false),
      'pagina', case when pm.tipo = 'classe' and _sono_docente(pm.id) then pz.pagina end,
      'magazzino_usato', case when pm.tipo = 'classe' and _sono_docente(pm.id)
                                then jsonb_build_object('tipo', 'classe', 'id', pm.id, 'nome', pm.nome)
                              when pm.tipo is not null then jsonb_build_object('tipo', pm.tipo)
                         end,
      'ultima_azione', ua.azione,
      'ultima_azione_il', ua.created_at,
      'compiti', jsonb_build_object('totale', c.totale, 'completati', c.completati,
                                    'errori', c.errori, 'bloccati', c.bloccati)
    ) order by pr.username)
    from membri mb
    join profili pr on pr.user_id = mb.user_id
    left join presenze pz on pz.user_id = mb.user_id
    left join magazzini pm on pm.id = pz.magazzino_id
    left join lateral (select a.azione, a.created_at from attivita a
                       where a.magazzino_id = p_magazzino and a.user_id = mb.user_id
                       order by a.id desc limit 1) ua on true
    cross join lateral (select count(*) as totale,
                               count(*) filter (where k.stato = 'completato') as completati,
                               count(*) filter (where k.stato = 'errore') as errori,
                               count(*) filter (where k.stato = 'bloccato') as bloccati
                        from compiti k where k.magazzino_id = p_magazzino and k.assegnato_a = mb.user_id) c
    where mb.magazzino_id = p_magazzino and mb.ruolo = 'studente'), '[]'::jsonb);
end $$;

-- ritorna: {non_lette:int, elenco:[{id, tipo, articolo_id, messaggio, risolta_il, created_at, letta:boolean}]}   (ultime 50, piu' recenti prima; non_lette conta tutte)
create function api_notifiche(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  perform _membro(p_magazzino);
  return jsonb_build_object(
    'non_lette', (select count(*) from notifiche n
                  where n.magazzino_id = p_magazzino
                    and not exists (select 1 from notifiche_lette l where l.notifica_id = n.id and l.user_id = u)),
    'elenco', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'articolo_id', x.articolo_id,
                                          'messaggio', x.messaggio, 'risolta_il', x.risolta_il,
                                          'created_at', x.created_at, 'letta', x.letta)
                       order by x.created_at desc, x.id)
      from (select n.*, exists (select 1 from notifiche_lette l where l.notifica_id = n.id and l.user_id = u) as letta
            from notifiche n where n.magazzino_id = p_magazzino
            order by n.created_at desc, n.id limit 50) x), '[]'::jsonb));
end $$;

-- ritorna: {segnate:int}   (segna come lette per chi chiama tutte le notifiche della classe)
create function api_notifiche_leggi(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); n int;
begin
  perform _membro(p_magazzino);
  insert into notifiche_lette (notifica_id, user_id)
  select id, u from notifiche where magazzino_id = p_magazzino
  on conflict do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('segnate', n);
end $$;

-- ritorna: [{id, azione, entita, entita_id, dettagli, created_at, user_id, username}]   (dal piu' recente; p_dopo_id: solo righe con id maggiore, per il polling; p_limite 1-200, default 50)
create function api_attivita(p_magazzino uuid, p_dopo_id bigint default null, p_limite int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _membro(p_magazzino);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'azione', x.azione, 'entita', x.entita, 'entita_id', x.entita_id,
                                        'dettagli', x.dettagli, 'created_at', x.created_at,
                                        'user_id', x.user_id, 'username', x.username)
                     order by x.id desc)
    from (select a.*, pr.username from attivita a left join profili pr on pr.user_id = a.user_id
          where a.magazzino_id = p_magazzino and (p_dopo_id is null or a.id > p_dopo_id)
          order by a.id desc limit greatest(1, least(coalesce(p_limite, 50), 200))) x), '[]'::jsonb);
end $$;

-- ===== migrations/0006_scenari.sql =====
-- 0006_scenari.sql
-- Motore degli scenari: generazione deterministica dei compiti per studente, controllo automatico degli errori,
-- sottoscorta condivisa con riordino dinamico, inventario con "fisico" fittizio.
-- Ridefinisce (create or replace, stessa firma) i tre stub di 0004: _riordino_dinamico, _valuta_compiti, _sblocca_compiti.
-- Solo plpgsql, niente estensioni, niente random(): tutto deriva dal seed con hashtext.

-- ---------- permessi ----------
-- Il progetto assegna evadi_ordine anche al ruolo acquisti (compiti "evadi ordine" dell'acquirente).
insert into permessi_ruolo (ruolo_aziendale, azione) values ('acquisti', 'evadi_ordine') on conflict do nothing;

-- ---------- generatore deterministico ----------
-- intero pseudo-casuale in [0, p_mod) stabile per (seed, chiave)
create function _scn_h(p_seed int, p_chiave text, p_mod int) returns int
language plpgsql immutable as $$
begin
  return ((hashtext(p_seed::text || ':' || p_chiave)::bigint & 2147483647) % greatest(p_mod, 1))::int;
end $$;

-- "descrizione|categoria|um|prezzo_cent"
create function _scn_catalogo() returns text[] language plpgsql immutable as $$
begin
  return array[
    'Notebook 15" Core i5 16GB|Informatica|PZ.|62000', 'Notebook 14" Ryzen 5 8GB|Informatica|PZ.|54900',
    'Monitor 24" Full HD|Informatica|PZ.|13900', 'Monitor 27" QHD|Informatica|PZ.|22900',
    'Tastiera USB italiana|Periferiche|PZ.|1490', 'Mouse ottico USB|Periferiche|PZ.|690',
    'Mouse wireless ergonomico|Periferiche|PZ.|2490', 'Webcam Full HD|Periferiche|PZ.|3990',
    'Cuffie con microfono USB|Periferiche|PZ.|2990', 'Docking station USB-C|Informatica|PZ.|8900',
    'Hard disk esterno 1TB|Archiviazione|PZ.|5490', 'SSD interno 500GB|Archiviazione|PZ.|4690',
    'SSD interno 1TB|Archiviazione|PZ.|7990', 'Chiavetta USB 64GB|Archiviazione|PZ.|790',
    'Scheda SD 128GB|Archiviazione|PZ.|1290', 'Router Wi-Fi 6|Reti|PZ.|11900',
    'Switch 8 porte Gigabit|Reti|PZ.|2990', 'Switch 24 porte PoE|Reti|PZ.|27900',
    'Access point Wi-Fi|Reti|PZ.|8490', 'Cavo di rete Cat6 2m|Reti|PZ.|390',
    'Cavo HDMI 2m|Periferiche|PZ.|590', 'Alimentatore universale 65W|Informatica|PZ.|3490',
    'Gruppo di continuita 800VA|Informatica|PZ.|9900', 'Stampante laser monocromatica|Stampa|PZ.|14900',
    'Toner nero compatibile|Stampa|PZ.|3290', 'Cartuccia inchiostro colore|Stampa|PZ.|2190',
    'Tablet 10" 64GB|Informatica|PZ.|21900', 'Smartphone aziendale 128GB|Informatica|PZ.|29900',
    'Lettore barcode USB|Lettori|PZ.|4900', 'Lettore barcode wireless|Lettori|PZ.|8900',
    'Stampante etichette termica|Stampa|PZ.|17900', 'Palmare con lettore RFID|Lettori|PZ.|45900',
    'Etichette termiche 100x150 rotolo|Imballaggio|RT|890', 'Nastro adesivo da imballo|Imballaggio|RT|190',
    'Scatola di cartone 40x30x30|Imballaggio|PZ.|120', 'Pallet EPAL 120x80|Imballaggio|PZ.|1450',
    'Film estensibile 500mm|Imballaggio|RT|790', 'Reggetta in PP rotolo|Imballaggio|RT|1890',
    'Bancale in plastica|Imballaggio|PZ.|2790', 'Carrello a mano pieghevole|Attrezzature|PZ.|6900',
    'Transpallet manuale 2500kg|Attrezzature|PZ.|32900', 'Cassetta plastica impilabile|Attrezzature|PZ.|690',
    'Scaffale metallico 4 ripiani|Attrezzature|PZ.|8900', 'Casco di sicurezza|Sicurezza|PZ.|1490',
    'Guanti antitaglio|Sicurezza|PZ.|590', 'Giubbino alta visibilita|Sicurezza|PZ.|790',
    'Taglierino di sicurezza|Attrezzature|PZ.|390', 'Pistola prezzatrice|Attrezzature|PZ.|2490',
    'Bilancia da banco 30kg|Attrezzature|PZ.|7900', 'Nastro segnaletico giallo-nero|Sicurezza|RT|490'];
end $$;

-- "ragione sociale|comune"
create function _scn_clienti() returns text[] language plpgsql immutable as $$
begin
  return array['Rossi Impianti Srl|Brescia', 'Bianchi Logistica Spa|Verona', 'Ferrari Uffici Srl|Modena', 'Esposito Forniture Snc|Napoli',
    'Romano Ristorazione Srl|Bari', 'Colombo Studio Associato|Milano', 'Ricci Trasporti Srl|Parma', 'Marino Costruzioni Spa|Torino',
    'Greco Farmacie Srl|Palermo', 'Bruno Elettronica Snc|Bergamo', 'Gallo Arredi Srl|Treviso', 'Conti Autofficine Srl|Bologna',
    'De Luca Hotel Spa|Firenze', 'Mancini Cartolibreria Snc|Perugia'];
end $$;

-- "ragione sociale|comune"
create function _scn_fornitori() returns text[] language plpgsql immutable as $$
begin
  return array['TechSupply Italia Spa|Milano', 'Logistica Nord Srl|Padova', 'Distribuzione Informatica Srl|Roma', 'ImballItalia Spa|Cremona',
    'Reti e Sistemi Srl|Torino', 'Ufficio Facile Srl|Bologna', 'Sicurezza Lavoro Snc|Vicenza', 'PrintService Srl|Genova'];
end $$;

-- inserisce un compito; ritorna l'id
create function _scn_compito(p_scenario uuid, p_magazzino uuid, p_user uuid, p_ruolo text, p_tipo text, p_titolo text,
                             p_istruzioni text, p_articolo uuid, p_anagrafica uuid, p_qta numeric, p_param jsonb,
                             p_ordine int, p_stato text default 'da_fare', p_motivo text default null,
                             p_origine text default 'generato') returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  insert into compiti (scenario_id, magazzino_id, assegnato_a, ruolo_aziendale, tipo, titolo, istruzioni, articolo_id,
                       anagrafica_id, qta, parametri, origine, stato, motivo, ordine)
  values (p_scenario, p_magazzino, p_user, p_ruolo, p_tipo, p_titolo, p_istruzioni, p_articolo,
          p_anagrafica, p_qta, coalesce(p_param, '{}'), p_origine, p_stato, p_motivo, p_ordine)
  returning id into v;
  return v;
end $$;

-- documento gia' confermato preesistente nello scenario (DDT, carico o ordine fornitore da fatturare/evadere).
-- Scrive direttamente righe, totali e (per carico/scarico) movimento e giacenza, senza passare da 0004.
create function _scn_doc(p_magazzino uuid, p_tipo text, p_anagrafica uuid, p_articolo uuid, p_qta numeric, p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a articoli; v_anno int := extract(year from current_date)::int; v_num int; v_id uuid;
        v_prezzo bigint; v_netto bigint; v_iva bigint; v_segno int;
begin
  select * into a from articoli where id = p_articolo;
  v_prezzo := case when p_tipo in ('scarico', 'ordine_cliente', 'preventivo', 'fattura_vendita')
                   then round(a.prezzo_acquisto_cent * (100 + a.ricarico_perc) / 100.0) else a.prezzo_acquisto_cent end;
  v_netto := round(p_qta * v_prezzo);
  v_iva := round(v_netto * 22 / 100.0);
  insert into contatori (magazzino_id, tipo, anno, ultimo) values (p_magazzino, p_tipo, v_anno, 1)
  on conflict (magazzino_id, tipo, anno) do update set ultimo = contatori.ultimo + 1
  returning ultimo into v_num;
  insert into documenti (magazzino_id, tipo, anno, numero, anagrafica_id, stato, imponibile_cent, imposta_cent, totale_cent, creato_da)
  values (p_magazzino, p_tipo, v_anno, v_num, p_anagrafica, 'confermato', v_netto, v_iva, v_netto + v_iva, p_user)
  returning id into v_id;
  insert into righe_documento (documento_id, posizione, articolo_id, descrizione, qta, prezzo_cent, iva_perc, ubicazione_id, totale_cent)
  values (v_id, 1, p_articolo, a.descrizione, p_qta, v_prezzo, 22, a.ubicazione_id, v_netto);
  if p_tipo in ('carico', 'scarico') then
    v_segno := case when p_tipo = 'carico' then 1 else -1 end;
    update giacenze set qta = qta + v_segno * p_qta where articolo_id = p_articolo;
    insert into movimenti_stock (magazzino_id, articolo_id, ubicazione_id, qta, costo_unit_cent, causale, documento_id, user_id)
    values (p_magazzino, p_articolo, a.ubicazione_id, v_segno * p_qta, a.prezzo_acquisto_cent, p_tipo, v_id, p_user);
  end if;
  return v_id;
end $$;

-- ---------- generazione ----------
-- ritorna: {scenario_id, nome, stato:'bozza', seed, n_articoli, n_studenti, n_compiti}
-- p_config = {seed, n_articoli, sottoscorta_forzata, con_inventario}. n_articoli effettivo = max(config, 2 x studenti
-- + merci della sottoscorta + merci dell'inventario), cosi' ogni studente ha merci tutte sue e i compiti non si ripetono.
create function api_scenario_genera(p_magazzino uuid, p_nome text, p_config jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := _uid();
  cfg jsonb := coalesce(p_config, '{}'::jsonb);
  sd int := coalesce((cfg ->> 'seed')::int, 1);
  sotto boolean := coalesce((cfg ->> 'sottoscorta_forzata')::boolean, false);
  inv boolean := coalesce((cfg ->> 'con_inventario')::boolean, false);
  sid uuid; pref int; v uuid; tipo_m text;
  stud uuid[]; rol text[]; pool uuid[] := '{}';
  ns int; np int; nm int := 0; ni int := 0; na int;
  cat text[]; nl int; it text; nC int; nF int;
  cli uuid[] := '{}'; clit text[] := '{}'; frn uuid[] := '{}'; frnt text[] := '{}'; frl int[] := '{}';
  ubi uuid[] := '{}'; ubc text[] := '{}';
  art uuid[] := '{}'; atx text[] := '{}'; ui int[] := '{}';
  g0 numeric[] := '{}'; ss numeric[] := '{}'; rr numeric[] := '{}';
  s1 numeric[] := '{}'; s2 numeric[] := '{}'; s3 numeric[] := '{}'; rl numeric[] := '{}';
  i int; j int; k int; m int; rem numeric; dlt numeric; fi int; vi text;
  a1 uuid; a2 uuid; c1 int; c2 int; f1 int; f2 int; q1 numeric; q2 numeric; r text; o int; ik int := 0; uj int; base int;
  asg uuid; qj numeric; n_comp int;
  p_ubi_da uuid; p_ubi_a uuid; doc uuid;
begin
  perform _membro(p_magazzino);
  if not _sono_docente(p_magazzino) then raise exception 'permesso_negato'; end if;
  select tipo into tipo_m from magazzini where id = p_magazzino;
  if tipo_m <> 'classe' or coalesce(trim(p_nome), '') = '' or char_length(trim(p_nome)) > 500 then raise exception 'dato_non_valido'; end if;

  -- studenti in ordine di username: l'assegnazione dipende solo da seed e classe, non dagli uuid
  select array_agg(m.user_id order by pr.username), array_agg(m.ruolo_aziendale order by pr.username)
    into stud, rol
    from membri m join profili pr on pr.user_id = m.user_id
   where m.magazzino_id = p_magazzino and m.ruolo = 'studente';
  ns := coalesce(array_length(stud, 1), 0);
  if ns = 0 then raise exception 'dato_non_valido'; end if;
  for i in 1..ns loop
    if rol[i] is null or rol[i] = 'magazziniere' then pool := pool || stud[i]; end if;
  end loop;
  np := coalesce(array_length(pool, 1), 0);
  if sotto then nm := least(1 + ns / 6, 4); end if;
  if inv then ni := greatest(np, 1); end if;
  na := greatest(coalesce((cfg ->> 'n_articoli')::int, 12), 2 * ns + nm + ni);
  if na > 500 then raise exception 'dato_non_valido'; end if;

  insert into scenari (magazzino_id, nome, stato, seed, config, creato_da)
  values (p_magazzino, trim(p_nome), 'bozza', sd, cfg || jsonb_build_object('n_articoli', na), u)
  returning id into sid;

  -- prefisso libero per matricole e codici anagrafica (piu' scenari nello stesso magazzino)
  select min(x) into pref from generate_series(1, 1000) x
   where not exists (select 1 from articoli where magazzino_id = p_magazzino and matricola like 'S' || x || '-%')
     and not exists (select 1 from anagrafiche where magazzino_id = p_magazzino and (codice like 'C' || x || '-%' or codice like 'F' || x || '-%'));

  -- ubicazioni (12 fisse, riusate se ci sono gia')
  for i in 0..11 loop
    vi := chr(65 + i / 4) || '-0' || (1 + (i % 4) / 2) || '-0' || (1 + i % 2);
    insert into ubicazioni (magazzino_id, codice, zona, corridoio, scaffale)
    values (p_magazzino, vi, 'Zona ' || chr(65 + i / 4), '0' || (1 + (i % 4) / 2), '0' || (1 + i % 2))
    on conflict (magazzino_id, codice) do nothing;
    select id into v from ubicazioni where magazzino_id = p_magazzino and codice = vi;
    ubi := ubi || v; ubc := ubc || vi;
  end loop;

  -- clienti e fornitori
  nC := array_length(_scn_clienti(), 1);
  for i in 1..nC loop
    it := (_scn_clienti())[i];
    insert into anagrafiche (magazzino_id, tipo, codice, ragione_sociale, indirizzo, comune, p_iva, sconto_perc)
    values (p_magazzino, 'cliente', 'C' || pref || '-' || lpad(i::text, 2, '0'), split_part(it, '|', 1),
            'Via ' || (array['Roma','Garibaldi','Mazzini','Verdi','Dante','Marconi'])[1 + _scn_h(sd, 'via' || i, 6)] || ' ' || (1 + _scn_h(sd, 'civ' || i, 90)),
            split_part(it, '|', 2), lpad((10000000 + _scn_h(sd, 'iva' || i, 80000000))::text, 11, '0'),
            (array[0, 5, 10])[1 + _scn_h(sd, 'sc' || i, 3)])
    returning id into v;
    cli := cli || v; clit := clit || split_part(it, '|', 1);
  end loop;
  nF := array_length(_scn_fornitori(), 1);
  for i in 1..nF loop
    it := (_scn_fornitori())[i];
    insert into anagrafiche (magazzino_id, tipo, codice, ragione_sociale, indirizzo, comune, p_iva, lead_time_giorni)
    values (p_magazzino, 'fornitore', 'F' || pref || '-' || lpad(i::text, 2, '0'), split_part(it, '|', 1),
            'Via ' || (array['Industria','Artigiani','Commercio','Stazione','Europa','Liberta'])[1 + _scn_h(sd, 'viaf' || i, 6)] || ' ' || (1 + _scn_h(sd, 'civf' || i, 90)),
            split_part(it, '|', 2), lpad((10000000 + _scn_h(sd, 'ivaf' || i, 80000000))::text, 11, '0'),
            2 + _scn_h(sd, 'lt' || i, 6))
    returning id, lead_time_giorni into v, k;
    frn := frn || v; frnt := frnt || split_part(it, '|', 1); frl := frl || k;
  end loop;

  -- quantita' iniziali, scorta di sicurezza e punto di riordino per merce; poi le merci speciali
  for i in 1..na loop
    g0[i] := 40 + _scn_h(sd, 'g' || i, 81);
    ss[i] := 6 + _scn_h(sd, 's' || i, 4);
    rr[i] := ss[i] + 8 + _scn_h(sd, 'r' || i, 6);
    ui[i] := 1 + _scn_h(sd, 'u' || i, 12);
  end loop;
  -- sottoscorta: tre scarichi (s1, s2, s3). Dopo s1+s2 restano 'rem' pezzi, sotto il punto di riordino rr;
  -- s3 > rem, quindi senza un riordino non si puo' fare
  for m in 1..nm loop
    k := 2 * ns + m;
    rem := 5 + _scn_h(sd, 'rem' || m, 5);
    s1[m] := 10 + _scn_h(sd, 'a' || m, 5);
    s2[m] := 10 + (s1[m] - 10 + 1 + _scn_h(sd, 'b' || m, 4)) % 5;  -- sempre diversa da s1
    s3[m] := rem + 2 + _scn_h(sd, 'c' || m, 4);
    while s3[m] = s1[m] or s3[m] = s2[m] loop s3[m] := s3[m] + 1; end loop;  -- tre quantita' diverse
    g0[k] := s1[m] + s2[m] + rem;
    rr[k] := rem + 3 + _scn_h(sd, 'd' || m, 3);
    ss[k] := 3 + _scn_h(sd, 'e' || m, 3);
  end loop;
  -- inventario: quantita' reale diversa dal sistema (da -5 a +5, mai zero)
  for j in 1..ni loop
    k := 2 * ns + nm + j;
    dlt := 1 + _scn_h(sd, 'i' || j, 5);
    rl[j] := case when _scn_h(sd, 'is' || j, 2) = 0 then g0[k] - dlt else g0[k] + dlt end;
  end loop;

  -- articoli, giacenze iniziali con movimento di apertura
  select array_agg(x order by _scn_h(sd, x, 1000000), x) into cat from unnest(_scn_catalogo()) x;
  nl := array_length(cat, 1);
  for i in 1..na loop
    it := cat[((i - 1) % nl) + 1];
    fi := 1 + _scn_h(sd, 'f' || i, nF);
    vi := 'S' || pref || '-' || lpad(i::text, 3, '0');
    insert into articoli (magazzino_id, matricola, descrizione, um, categoria, prezzo_acquisto_cent, ricarico_perc,
                          scorta_minima, scorta_sicurezza, punto_riordino, lead_time_giorni, domanda_giornaliera,
                          costo_ordine_cent, ubicazione_id, fornitore_abituale_id, scenario_id)
    values (p_magazzino, vi,
            split_part(it, '|', 1) || case when (i - 1) / nl > 0 then ' (serie ' || ((i - 1) / nl + 1) || ')' else '' end,
            split_part(it, '|', 3), split_part(it, '|', 2),
            split_part(it, '|', 4)::bigint * (90 + _scn_h(sd, 'p' || i, 21)) / 100,
            25 + _scn_h(sd, 'k' || i, 26), ss[i], ss[i], rr[i], frl[fi], 2 + _scn_h(sd, 'dd' || i, 5),
            1500 + _scn_h(sd, 'co' || i, 2001), ubi[ui[i]], frn[fi], sid)
    returning id into v;
    art := art || v;
    atx := atx || (vi || ' ' || split_part(it, '|', 1));
    insert into giacenze (magazzino_id, articolo_id, ubicazione_id, qta) values (p_magazzino, v, ubi[ui[i]], g0[i]);
    insert into movimenti_stock (magazzino_id, articolo_id, ubicazione_id, qta, costo_unit_cent, causale, user_id)
    select p_magazzino, v, ubi[ui[i]], g0[i], prezzo_acquisto_cent, 'apertura', u from articoli where id = v;
  end loop;

  -- compiti per studente, coerenti col ruolo; ogni studente lavora su due merci tutte sue (2i-1, 2i)
  for i in 1..ns loop
    a1 := art[2 * i - 1]; a2 := art[2 * i]; r := rol[i]; o := 0;
    c1 := 1 + _scn_h(sd, 'c1' || i, nC);  c2 := 1 + (c1 + _scn_h(sd, 'c2' || i, nC - 1)) % nC;
    f1 := 1 + _scn_h(sd, 'f1' || i, nF);  f2 := 1 + (f1 + _scn_h(sd, 'f2' || i, nF - 1)) % nF;
    q1 := 3 + _scn_h(sd, 'q1' || i, 12);  q2 := 3 + _scn_h(sd, 'q2' || i, 12);

    if r is null or r = 'magazziniere' then
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'magazziniere', 'carico', 'Carico: ' || atx[2 * i - 1],
        'Registra un carico di ' || q1 || ' pezzi di ' || atx[2 * i - 1] || ' dal fornitore ' || frnt[f1] || '.',
        a1, frn[f1], q1, '{}', o);
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'magazziniere', 'scarico', 'Scarico: ' || atx[2 * i],
        'Registra uno scarico di ' || q2 || ' pezzi di ' || atx[2 * i] || ' per il cliente ' || clit[c1] || '.',
        a2, cli[c1], q2, '{}', o);
    end if;
    if r = 'magazziniere' then
      uj := 1 + (ui[2 * i - 1] - 1 + 1 + _scn_h(sd, 't' || i, 11)) % 12;
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'magazziniere', 'trasferimento', 'Trasferimento: ' || atx[2 * i - 1],
        'Sposta ' || q1 || ' pezzi di ' || atx[2 * i - 1] || ' dall''ubicazione ' || ubc[ui[2 * i - 1]] || ' alla ' || ubc[uj] || '.',
        a1, null, q1, jsonb_build_object('da_ubicazione_id', ubi[ui[2 * i - 1]], 'da', ubc[ui[2 * i - 1]],
                                         'a_ubicazione_id', ubi[uj], 'a', ubc[uj]), o);
    end if;
    if r = 'acquisti' then
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'acquisti', 'ordine_fornitore', 'Ordine fornitore: ' || atx[2 * i - 1],
        'Emetti un ordine di ' || q1 || ' pezzi di ' || atx[2 * i - 1] || ' al fornitore ' || frnt[f1] || '.',
        a1, frn[f1], q1, '{}', o);
      doc := _scn_doc(p_magazzino, 'ordine_fornitore', frn[f2], a2, q2, u);
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'acquisti', 'evadi_ordine', 'Evadi ordine: ' || atx[2 * i],
        'Evadi l''ordine al fornitore ' || frnt[f2] || ' per ' || q2 || ' pezzi di ' || atx[2 * i] || ' (conferma il carico).',
        a2, frn[f2], q2, jsonb_build_object('ordine_id', doc), o);
    end if;
    if r = 'commerciale' then
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'commerciale', 'preventivo', 'Preventivo: ' || atx[2 * i - 1],
        'Prepara un preventivo di ' || q1 || ' pezzi di ' || atx[2 * i - 1] || ' per il cliente ' || clit[c1] || '.',
        a1, cli[c1], q1, '{}', o);
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'commerciale', 'ordine_cliente', 'Ordine cliente: ' || atx[2 * i],
        'Registra un ordine di ' || q2 || ' pezzi di ' || atx[2 * i] || ' del cliente ' || clit[c2] || '.',
        a2, cli[c2], q2, '{}', o);
    end if;
    if r = 'amministrazione' then
      doc := _scn_doc(p_magazzino, 'scarico', cli[c1], a1, q1, u);
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'amministrazione', 'fattura_vendita', 'Fattura di vendita: ' || atx[2 * i - 1],
        'Emetti la fattura per il DDT di ' || q1 || ' pezzi di ' || atx[2 * i - 1] || ' al cliente ' || clit[c1] || '.',
        a1, cli[c1], q1, jsonb_build_object('ddt_id', doc), o);
      doc := _scn_doc(p_magazzino, 'carico', frn[f1], a2, q2, u);
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'amministrazione', 'fattura_acquisto', 'Fattura di acquisto: ' || atx[2 * i],
        'Registra la fattura del fornitore ' || frnt[f1] || ' per il carico di ' || q2 || ' pezzi di ' || atx[2 * i] || '.',
        a2, frn[f1], q2, jsonb_build_object('carico_id', doc), o);
    end if;
    if r is null then
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], null, 'preventivo', 'Preventivo: ' || atx[2 * i],
        'Prepara un preventivo di ' || q1 || ' pezzi di ' || atx[2 * i] || ' per il cliente ' || clit[c2] || '.',
        a2, cli[c2], q1, '{}', o);
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], null, 'ordine_fornitore', 'Ordine fornitore: ' || atx[2 * i - 1],
        'Emetti un ordine di ' || q2 || ' pezzi di ' || atx[2 * i - 1] || ' al fornitore ' || frnt[f2] || '.',
        a1, frn[f2], q2, '{}', o);
    end if;
    if inv and (r is null or r = 'magazziniere') then
      ik := ik + 1; k := 2 * ns + nm + ik; o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'magazziniere', 'inventario', 'Inventario: ' || atx[k],
        'Conta ' || atx[k] || ' in magazzino e, se la quantita'' reale e'' diversa da quella del sistema, rettifica la giacenza indicando la causale.',
        art[k], null, null, '{}', o);
    end if;
  end loop;

  -- inventario senza nessun magazziniere: un solo compito libero
  if inv and np = 0 then
    k := 2 * ns + nm + 1;
    perform _scn_compito(sid, p_magazzino, null, 'magazziniere', 'inventario', 'Inventario: ' || atx[k],
      'Conta ' || atx[k] || ' in magazzino e rettifica la giacenza se serve.', art[k], null, null, '{}', 1);
  end if;
  for j in 1..ni loop
    k := 2 * ns + nm + j;
    insert into scenario_fisico (scenario_id, articolo_id, ubicazione_id, qta_reale) values (sid, art[k], ubi[ui[k]], greatest(rl[j], 0));
  end loop;

  -- sottoscorta condivisa: tre scarichi della stessa merce a studenti (e clienti) diversi
  for m in 1..nm loop
    k := 2 * ns + m;
    base := _scn_h(sd, 'sc' || m, nC);
    for j in 0..2 loop
      qj := case j when 0 then s1[m] when 1 then s2[m] else s3[m] end;
      asg := case when np > 0 then pool[1 + (m + j) % np] end;
      perform _scn_compito(sid, p_magazzino, asg, 'magazziniere', 'scarico', 'Scarico: ' || atx[k],
        'Registra uno scarico di ' || qj || ' pezzi di ' || atx[k] || ' per il cliente ' || clit[1 + (base + 3 * j) % nC] || '.',
        art[k], cli[1 + (base + 3 * j) % nC], qj, '{}', 100 + m * 3 + j,
        case when j = 2 then 'bloccato' else 'da_fare' end,
        case when j = 2 then 'scorta insufficiente' end);
    end loop;
  end loop;

  select count(*) into n_comp from compiti where scenario_id = sid;
  perform _registra(p_magazzino, 'scenario_genera', 'scenario', sid,
                    jsonb_build_object('nome', trim(p_nome), 'seed', sd, 'articoli', na, 'studenti', ns, 'compiti', n_comp));
  return jsonb_build_object('scenario_id', sid, 'nome', trim(p_nome), 'stato', 'bozza', 'seed', sd,
                            'n_articoli', na, 'n_studenti', ns, 'n_compiti', n_comp);
end $$;

-- ritorna: {id, stato}
create function api_scenario_stato(p_scenario uuid, p_stato text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s scenari;
begin
  select * into s from scenari where id = p_scenario;
  if not found then raise exception 'non_trovato'; end if;
  if not _sono_docente(s.magazzino_id) then raise exception 'permesso_negato'; end if;
  if p_stato not in ('attivo', 'chiuso') then raise exception 'dato_non_valido'; end if;
  if s.stato = p_stato then return jsonb_build_object('id', s.id, 'stato', s.stato); end if;
  update scenari set stato = p_stato where id = p_scenario;
  if p_stato = 'attivo' then
    insert into notifiche (magazzino_id, tipo, messaggio)
    values (s.magazzino_id, 'sistema', 'Scenario "' || s.nome || '" attivo: apri la pagina Compiti.');
  end if;
  perform _registra(s.magazzino_id, 'scenario_' || p_stato, 'scenario', s.id, jsonb_build_object('nome', s.nome));
  return jsonb_build_object('id', s.id, 'stato', p_stato);
end $$;

-- ritorna: {id, assegnato_a}   (p_user nullo = compito libero)
create function api_scenario_riassegna(p_compito uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c compiti;
begin
  select * into c from compiti where id = p_compito;
  if not found then raise exception 'non_trovato'; end if;
  if not _sono_docente(c.magazzino_id) then raise exception 'permesso_negato'; end if;
  if p_user is not null and not exists (select 1 from membri where magazzino_id = c.magazzino_id and user_id = p_user and ruolo = 'studente') then
    raise exception 'dato_non_valido';
  end if;
  update compiti set assegnato_a = p_user where id = p_compito;
  perform _registra(c.magazzino_id, 'compito_riassegna', 'compito', c.id, jsonb_build_object('a', p_user));
  return jsonb_build_object('id', c.id, 'assegnato_a', p_user);
end $$;

-- ritorna: {totale, giacenze_negative:[{articolo_id,matricola,descrizione,qta}],
--           ordini_non_evasi:[{documento_id,tipo,anno,numero,controparte}], ddt_senza_fattura:[{documento_id,anno,numero,controparte}],
--           fatture_senza_ddt:[{documento_id,tipo,anno,numero,controparte}], spedizioni_ferme:[{documento_id,tipo,anno,numero,stato_spedizione,aggiornato_il}],
--           compiti_in_errore:[{compito_id,titolo,username,esito}]}
-- Documenti considerati: quelli del magazzino creati dopo lo scenario. Spedizione ferma = non avanzata da oltre 30 minuti.
create function api_scenario_controlla(p_scenario uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s scenari; v_neg jsonb; v_ord jsonb; v_ddt jsonb; v_fat jsonb; v_sp jsonb; v_err jsonb;
begin
  select * into s from scenari where id = p_scenario;
  if not found then raise exception 'non_trovato'; end if;
  if not _sono_docente(s.magazzino_id) then raise exception 'permesso_negato'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('articolo_id', a.id, 'matricola', a.matricola, 'descrizione', a.descrizione, 'qta', g.qta)
                            order by a.matricola), '[]') into v_neg
    from giacenze g join articoli a on a.id = g.articolo_id where g.magazzino_id = s.magazzino_id and g.qta < 0;

  select coalesce(jsonb_agg(jsonb_build_object('documento_id', d.id, 'tipo', d.tipo, 'anno', d.anno, 'numero', d.numero,
                            'controparte', an.ragione_sociale) order by d.tipo, d.anno, d.numero), '[]') into v_ord
    from documenti d left join anagrafiche an on an.id = d.anagrafica_id
   where d.magazzino_id = s.magazzino_id and d.created_at >= s.created_at
     and d.tipo in ('ordine_fornitore', 'ordine_cliente') and d.stato = 'confermato';

  select coalesce(jsonb_agg(jsonb_build_object('documento_id', d.id, 'anno', d.anno, 'numero', d.numero,
                            'controparte', an.ragione_sociale) order by d.anno, d.numero), '[]') into v_ddt
    from documenti d left join anagrafiche an on an.id = d.anagrafica_id
   where d.magazzino_id = s.magazzino_id and d.created_at >= s.created_at
     and d.tipo = 'scarico' and d.stato in ('confermato', 'evaso')
     and not exists (select 1 from documenti f where f.documento_origine_id = d.id and f.tipo = 'fattura_vendita' and f.stato <> 'annullato');

  select coalesce(jsonb_agg(jsonb_build_object('documento_id', d.id, 'tipo', d.tipo, 'anno', d.anno, 'numero', d.numero,
                            'controparte', an.ragione_sociale) order by d.tipo, d.anno, d.numero), '[]') into v_fat
    from documenti d left join anagrafiche an on an.id = d.anagrafica_id
   where d.magazzino_id = s.magazzino_id and d.created_at >= s.created_at
     and d.tipo in ('fattura_vendita', 'fattura_acquisto') and d.stato in ('confermato', 'evaso')
     and not exists (select 1 from documenti o where o.id = d.documento_origine_id
                       and o.tipo = case d.tipo when 'fattura_vendita' then 'scarico' else 'carico' end);

  select coalesce(jsonb_agg(jsonb_build_object('documento_id', d.id, 'tipo', d.tipo, 'anno', d.anno, 'numero', d.numero,
                            'stato_spedizione', d.stato_spedizione, 'aggiornato_il', d.updated_at) order by d.updated_at), '[]') into v_sp
    from documenti d
   where d.magazzino_id = s.magazzino_id and d.stato <> 'annullato'
     and d.stato_spedizione in ('da_preparare', 'preparato') and d.updated_at < now() - interval '30 minutes';

  select coalesce(jsonb_agg(jsonb_build_object('compito_id', c.id, 'titolo', c.titolo, 'username', pr.username, 'esito', c.esito)
                            order by pr.username, c.ordine), '[]') into v_err
    from compiti c left join profili pr on pr.user_id = c.assegnato_a
   where c.scenario_id = s.id and c.stato = 'errore';

  return jsonb_build_object('totale', jsonb_array_length(v_neg) + jsonb_array_length(v_ord) + jsonb_array_length(v_ddt)
                                      + jsonb_array_length(v_fat) + jsonb_array_length(v_sp) + jsonb_array_length(v_err),
    'giacenze_negative', v_neg, 'ordini_non_evasi', v_ord, 'ddt_senza_fattura', v_ddt,
    'fatture_senza_ddt', v_fat, 'spedizioni_ferme', v_sp, 'compiti_in_errore', v_err);
end $$;

-- ritorna: [{id, scenario_id, tipo, titolo, istruzioni, articolo_id, articolo_matricola, articolo_descrizione,
--            controparte_id, controparte, controparte_tipo, qta, parametri, origine, stato, motivo, esito,
--            documento_id, completato_il, created_at}]   (solo scenari attivi, ordinati per ordine e creazione)
create function api_compiti_miei(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _membro(p_magazzino);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'scenario_id', c.scenario_id, 'tipo', c.tipo, 'titolo', c.titolo, 'istruzioni', c.istruzioni,
      'articolo_id', c.articolo_id, 'articolo_matricola', a.matricola, 'articolo_descrizione', a.descrizione,
      'controparte_id', c.anagrafica_id, 'controparte', an.ragione_sociale, 'controparte_tipo', an.tipo,
      'qta', c.qta, 'parametri', c.parametri, 'origine', c.origine, 'stato', c.stato, 'motivo', c.motivo,
      'esito', c.esito, 'documento_id', c.documento_id, 'completato_il', c.completato_il, 'created_at', c.created_at)
      order by c.ordine, c.created_at, c.id)
    from compiti c
    join scenari s on s.id = c.scenario_id and s.stato = 'attivo'
    left join articoli a on a.id = c.articolo_id
    left join anagrafiche an on an.id = c.anagrafica_id
    where c.magazzino_id = p_magazzino and c.assegnato_a = _uid()), '[]'::jsonb);
end $$;

-- ritorna: [{id, assegnato_a, username, ruolo_aziendale, tipo, titolo, articolo_matricola, articolo_descrizione,
--            controparte, qta, origine, stato, motivo, esito, documento_id, completato_il}]   (ordinati per username e ordine)
create function api_compiti_tutti(p_scenario uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s scenari;
begin
  select * into s from scenari where id = p_scenario;
  if not found then raise exception 'non_trovato'; end if;
  if not _sono_docente(s.magazzino_id) then raise exception 'permesso_negato'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'assegnato_a', c.assegnato_a, 'username', pr.username, 'ruolo_aziendale', c.ruolo_aziendale,
      'tipo', c.tipo, 'titolo', c.titolo, 'articolo_matricola', a.matricola, 'articolo_descrizione', a.descrizione,
      'controparte', an.ragione_sociale, 'qta', c.qta, 'origine', c.origine, 'stato', c.stato, 'motivo', c.motivo,
      'esito', c.esito, 'documento_id', c.documento_id, 'completato_il', c.completato_il)
      order by pr.username nulls last, c.ordine, c.created_at, c.id)
    from compiti c
    left join profili pr on pr.user_id = c.assegnato_a
    left join articoli a on a.id = c.articolo_id
    left join anagrafiche an on an.id = c.anagrafica_id
    where c.scenario_id = p_scenario), '[]'::jsonb);
end $$;

-- ---------- funzioni interne (ridefiniscono gli stub di 0004) ----------
-- Giacenza sotto il punto di riordino: compito dinamico "riordino" a uno studente acquisti (a turno; nessuno = libero)
-- e notifica per tutta la classe. Una sola volta finche' il riordino resta aperto.
create or replace function _riordino_dinamico(p_magazzino uuid, p_articolo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sc scenari; a articoli; v_giac numeric; acq uuid[]; v_n int; v_ass uuid; v_qta numeric; v_ord int; v_nome text;
begin
  select * into sc from scenari where magazzino_id = p_magazzino and stato = 'attivo' order by created_at desc limit 1;
  if not found then return; end if;
  select * into a from articoli where id = p_articolo and magazzino_id = p_magazzino;
  if not found or a.punto_riordino <= 0 then return; end if;
  select coalesce(sum(qta), 0) into v_giac from giacenze where articolo_id = p_articolo;
  if v_giac > a.punto_riordino then return; end if;
  if exists (select 1 from compiti where scenario_id = sc.id and articolo_id = p_articolo and tipo = 'riordino'
               and origine = 'dinamico' and stato in ('da_fare', 'errore')) then return; end if;

  select array_agg(m.user_id order by pr.username) into acq
    from membri m join profili pr on pr.user_id = m.user_id
   where m.magazzino_id = p_magazzino and m.ruolo = 'studente' and m.ruolo_aziendale = 'acquisti';
  select count(*) into v_n from compiti where scenario_id = sc.id and tipo = 'riordino' and origine = 'dinamico';
  select coalesce(max(ordine), 0) + 1 into v_ord from compiti where scenario_id = sc.id;
  if coalesce(array_length(acq, 1), 0) > 0 then v_ass := acq[1 + v_n % array_length(acq, 1)]; end if;
  v_qta := greatest(ceil(2 * a.punto_riordino - v_giac), 1);
  v_nome := a.matricola || ' ' || a.descrizione;

  perform _scn_compito(sc.id, p_magazzino, v_ass, 'acquisti', 'riordino', 'Riordino: ' || v_nome,
    'La giacenza di ' || v_nome || ' (' || v_giac || ') e'' sotto il punto di riordino (' || a.punto_riordino
      || '). Emetti un ordine fornitore di almeno ' || v_qta || ' pezzi.',
    p_articolo, a.fornitore_abituale_id, v_qta, jsonb_build_object('giacenza', v_giac, 'punto_riordino', a.punto_riordino),
    v_ord, 'da_fare', null, 'dinamico');
  insert into notifiche (magazzino_id, tipo, articolo_id, messaggio)
  values (p_magazzino, 'compito', p_articolo, 'Scorta bassa su ' || v_nome || ': nuovo compito di riordino'
          || case when v_ass is null then ' (libero).' else ' assegnato a ' || (select username from profili where user_id = v_ass) || '.' end);
end $$;

-- Dopo ogni conferma: riapre i compiti bloccati se la merce c'e' (al netto degli altri scarichi gia' assegnati)
-- e completa i riordini dinamici la cui giacenza e' tornata sopra il punto di riordino.
create or replace function _sblocca_compiti(p_magazzino uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update compiti c set stato = 'da_fare', motivo = null
   where c.magazzino_id = p_magazzino and c.stato = 'bloccato' and c.articolo_id is not null and c.qta is not null
     and (select coalesce(sum(g.qta), 0) from giacenze g where g.articolo_id = c.articolo_id)
       - (select coalesce(sum(x.qta), 0) from compiti x where x.scenario_id = c.scenario_id and x.articolo_id = c.articolo_id
            and x.tipo = c.tipo and x.stato in ('da_fare', 'errore') and x.id <> c.id) >= c.qta;

  update compiti c set stato = 'completato', completato_il = now(), esito = jsonb_build_object('giacenza_ripristinata', true)
    from articoli a
   where a.id = c.articolo_id and c.magazzino_id = p_magazzino and c.tipo = 'riordino' and c.origine = 'dinamico'
     and c.stato in ('da_fare', 'errore')
     and (select coalesce(sum(g.qta), 0) from giacenze g where g.articolo_id = c.articolo_id) > a.punto_riordino;

  update notifiche n set risolta_il = now()
   where n.magazzino_id = p_magazzino and n.tipo = 'compito' and n.risolta_il is null and n.articolo_id is not null
     and not exists (select 1 from compiti c where c.magazzino_id = p_magazzino and c.articolo_id = n.articolo_id
                       and c.tipo = 'riordino' and c.stato in ('da_fare', 'errore'));
end $$;

-- Confronta il documento confermato con i compiti aperti di chi l'ha creato. Candidati: stesso tipo e merce nel documento.
-- Tutto giusto (controparte, quantita') -> completato; altrimenti errore con esito {errori:[{campo, atteso, trovato}]}.
-- Un carico generato da un ordine fornitore vale come compito evadi_ordine.
create or replace function _valuta_compiti(p_magazzino uuid, p_documento uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documenti; u uuid; v_tipo text; c compiti; v_err jsonb; v_trovata numeric; v_ok boolean := false;
        v_primo uuid; v_primo_err jsonb;
begin
  select * into d from documenti where id = p_documento and magazzino_id = p_magazzino;
  if not found or d.stato not in ('confermato', 'evaso') then return; end if;
  u := coalesce(d.creato_da, auth.uid());
  if u is null then return; end if;
  v_tipo := d.tipo;
  if d.tipo = 'carico' and exists (select 1 from documenti o where o.id = d.documento_origine_id and o.tipo = 'ordine_fornitore') then
    v_tipo := 'evadi_ordine';
  end if;

  for c in
    select k.* from compiti k join scenari s on s.id = k.scenario_id and s.stato = 'attivo'
     where k.magazzino_id = p_magazzino and k.assegnato_a = u and k.tipo = v_tipo
       and k.stato in ('da_fare', 'errore', 'bloccato') and k.articolo_id is not null
       and exists (select 1 from righe_documento r where r.documento_id = d.id and r.articolo_id = k.articolo_id)
     order by k.ordine, k.created_at
  loop
    v_err := '[]'::jsonb;
    if c.anagrafica_id is not null and d.anagrafica_id is distinct from c.anagrafica_id then
      v_err := v_err || jsonb_build_object('campo', 'controparte',
        'atteso', (select ragione_sociale from anagrafiche where id = c.anagrafica_id),
        'trovato', (select ragione_sociale from anagrafiche where id = d.anagrafica_id));
    end if;
    select coalesce(sum(qta), 0) into v_trovata from righe_documento where documento_id = d.id and articolo_id = c.articolo_id;
    if c.qta is not null and v_trovata <> c.qta then
      v_err := v_err || jsonb_build_object('campo', 'quantita', 'atteso', c.qta, 'trovato', v_trovata);
    end if;
    if v_tipo = 'evadi_ordine' and c.parametri ? 'ordine_id' and (c.parametri ->> 'ordine_id')::uuid is distinct from d.documento_origine_id then
      v_err := v_err || jsonb_build_object('campo', 'ordine', 'atteso', c.parametri ->> 'ordine_id', 'trovato', d.documento_origine_id);
    end if;

    if jsonb_array_length(v_err) = 0 then
      update compiti set stato = 'completato', motivo = null, esito = jsonb_build_object('ok', true),
                         documento_id = d.id, completato_il = now() where id = c.id;
      perform _registra(p_magazzino, 'compito_completato', 'compito', c.id, jsonb_build_object('tipo', c.tipo));
      v_ok := true; exit;
    elsif v_primo is null then
      v_primo := c.id; v_primo_err := v_err;
    end if;
  end loop;

  if not v_ok and v_primo is not null then
    update compiti set stato = 'errore', motivo = 'dati non corretti', esito = jsonb_build_object('errori', v_primo_err),
                       documento_id = d.id where id = v_primo;
    perform _registra(p_magazzino, 'compito_errore', 'compito', v_primo, jsonb_build_object('errori', v_primo_err));
  end if;

  -- _controlla_scorte chiama _sblocca_compiti solo se chiude una notifica: qui lo si fa a ogni conferma
  perform _sblocca_compiti(p_magazzino);
end $$;

-- Da chiamare dopo un trasferimento: completa il compito "trasferimento" di chi chiama se la quantita' coincide, altrimenti errore.
create or replace function _valuta_trasferimento(p_magazzino uuid, p_articolo uuid, p_qta numeric) returns void
language plpgsql security definer set search_path = public as $$
declare c compiti;
begin
  select k.* into c from compiti k join scenari s on s.id = k.scenario_id and s.stato = 'attivo'
   where k.magazzino_id = p_magazzino and k.assegnato_a = auth.uid() and k.tipo = 'trasferimento' and k.articolo_id = p_articolo
     and k.stato in ('da_fare', 'errore') order by k.ordine limit 1;
  if not found then return; end if;
  if c.qta = p_qta then
    update compiti set stato = 'completato', motivo = null, esito = jsonb_build_object('ok', true), completato_il = now() where id = c.id;
  else
    update compiti set stato = 'errore', motivo = 'dati non corretti',
      esito = jsonb_build_object('errori', jsonb_build_array(jsonb_build_object('campo', 'quantita', 'atteso', c.qta, 'trovato', p_qta))) where id = c.id;
  end if;
end $$;

-- Da chiamare dopo una rettifica d'inventario: il compito "inventario" si completa se la giacenza di sistema
-- coincide con la quantita' reale dello scenario (scenario_fisico), altrimenti errore.
create or replace function _valuta_inventario(p_magazzino uuid, p_articolo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c compiti; v_reale numeric; v_sis numeric;
begin
  select k.* into c from compiti k join scenari s on s.id = k.scenario_id and s.stato = 'attivo'
   where k.magazzino_id = p_magazzino and k.assegnato_a = auth.uid() and k.tipo = 'inventario' and k.articolo_id = p_articolo
     and k.stato in ('da_fare', 'errore') order by k.ordine limit 1;
  if not found then return; end if;
  select sum(qta_reale) into v_reale from scenario_fisico where scenario_id = c.scenario_id and articolo_id = p_articolo;
  if v_reale is null then return; end if;
  select coalesce(sum(qta), 0) into v_sis from giacenze where articolo_id = p_articolo;
  if v_sis = v_reale then
    update compiti set stato = 'completato', motivo = null, esito = jsonb_build_object('ok', true), completato_il = now() where id = c.id;
  else
    update compiti set stato = 'errore', motivo = 'dati non corretti',
      esito = jsonb_build_object('errori', jsonb_build_array(jsonb_build_object('campo', 'giacenza', 'atteso', v_reale, 'trovato', v_sis))) where id = c.id;
  end if;
end $$;

-- ===== migrations/0007_analisi.sql =====
-- 0007_analisi.sql
-- Inventario (con "fisico" fittizio), riordino/EOQ, KPI/ABC, valorizzazione CMP/FIFO/LIFO.
-- Soldi in centesimi. Le giacenze si cambiano SOLO con _movimenta (0004): qui la usa solo la rettifica.
-- Letture: basta essere membri. Scritture (inventario): permesso 'inventario' + _registra.

-- ---------- interna: valore di un articolo rifatto dal registro movimenti_stock ----------
-- Tre metodi sullo stesso registro in ordine cronologico (id). I trasferimenti si ignorano: in totale non cambiano la quantita'.
-- shortcut: se un'uscita supera gli strati disponibili (giacenza negativa) l'eccedenza non ha valore in FIFO/LIFO; ok per le esercitazioni.
create function _valorizza_articolo(p_articolo uuid, p_fino timestamptz default null)
returns table (qta numeric, cmp numeric, fifo numeric, lifo numeric)
language plpgsql stable set search_path = public as $$
declare
  m record; r numeric; take numeric; i int;
  q numeric := 0; v numeric := 0; costo_medio numeric;
  fq numeric[] := '{}'; fc numeric[] := '{}'; fh int := 1;      -- FIFO: strati, testa = piu' vecchio
  lq numeric[] := '{}'; lc numeric[] := '{}'; lp int := 0;      -- LIFO: pila, cima = piu' recente
begin
  for m in select s.qta as q, s.costo_unit_cent as c from movimenti_stock s
           where s.articolo_id = p_articolo
             and s.causale not in ('trasferimento_out', 'trasferimento_in')
             and (p_fino is null or s.created_at <= p_fino)
           order by s.id loop
    if m.q > 0 then
      v := v + m.q * m.c; q := q + m.q;
      fq := fq || m.q; fc := fc || m.c::numeric;
      lp := lp + 1; lq[lp] := m.q; lc[lp] := m.c;
    elsif m.q < 0 then
      costo_medio := case when q > 0 then v / q else m.c end;
      v := v + m.q * costo_medio; q := q + m.q;
      if q = 0 then v := 0; end if;
      r := -m.q;
      while r > 0 and fh <= coalesce(array_length(fq, 1), 0) loop
        take := least(r, fq[fh]); fq[fh] := fq[fh] - take; r := r - take;
        if fq[fh] = 0 then fh := fh + 1; end if;
      end loop;
      r := -m.q;
      while r > 0 and lp > 0 loop
        take := least(r, lq[lp]); lq[lp] := lq[lp] - take; r := r - take;
        if lq[lp] = 0 then lp := lp - 1; end if;
      end loop;
    end if;
  end loop;
  qta := q; cmp := v; fifo := 0; lifo := 0;
  for i in fh .. coalesce(array_length(fq, 1), 0) loop fifo := fifo + fq[i] * fc[i]; end loop;
  for i in 1 .. lp loop lifo := lifo + lq[i] * lc[i]; end loop;
  return next;
end $$;

-- ---------- inventario ----------

-- ritorna: {id, nome, stato, righe}   (righe = numero di righe create da giacenze)
create function api_inventario_apri(p_magazzino uuid, p_nome text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int;
begin
  perform _membro(p_magazzino);
  perform _richiedi(p_magazzino, 'inventario');
  if nullif(trim(coalesce(p_nome, '')), '') is null or char_length(trim(p_nome)) > 500 then raise exception 'dato_non_valido'; end if;
  insert into inventari (magazzino_id, nome, creato_da) values (p_magazzino, trim(p_nome), _uid()) returning id into v_id;
  insert into inventario_righe (inventario_id, articolo_id, lotto_id, ubicazione_id, qta_sistema)
  select v_id, g.articolo_id, g.lotto_id, g.ubicazione_id, g.qta from giacenze g where g.magazzino_id = p_magazzino;
  get diagnostics n = row_count;
  perform _registra(p_magazzino, 'inventario_apri', 'inventario', v_id, jsonb_build_object('nome', trim(p_nome), 'righe', n));
  return jsonb_build_object('id', v_id, 'nome', trim(p_nome), 'stato', 'aperto', 'righe', n);
end $$;

-- ritorna: {riga, articolo_id, matricola, qta_sistema, qta_contata, differenza, rivelata}
--   rivelata = true se la quantita' viene dal fisico fittizio dello scenario (p_qta nullo), false se data da chi conta
create function api_inventario_conta(p_riga uuid, p_qta numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_qta numeric; v_riv boolean := false; v_matr text;
begin
  select ir.*, i.magazzino_id as mag, i.stato as inv_stato into r
  from inventario_righe ir join inventari i on i.id = ir.inventario_id where ir.id = p_riga for update of ir;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(r.mag);
  perform _richiedi(r.mag, 'inventario');
  if r.inv_stato <> 'aperto' or r.rettificata then raise exception 'stato_non_valido'; end if;
  if p_qta is null then
    select f.qta_reale into v_qta from scenario_fisico f join scenari s on s.id = f.scenario_id
    where s.magazzino_id = r.mag and f.articolo_id = r.articolo_id and f.ubicazione_id is not distinct from r.ubicazione_id
    order by s.created_at desc limit 1;
    if not found then raise exception 'dato_non_valido'; end if;
    v_riv := true;
  else
    v_qta := p_qta;
  end if;
  if _qta_non_valida(v_qta) or v_qta < 0 then raise exception 'dato_non_valido'; end if;  -- NaN supera "< 0"
  update inventario_righe set qta_contata = v_qta, user_id = _uid() where id = p_riga;
  select matricola into v_matr from articoli where id = r.articolo_id;
  perform _registra(r.mag, 'inventario_conta', 'inventario', r.inventario_id,
                    jsonb_build_object('riga', p_riga, 'matricola', v_matr, 'qta_contata', v_qta));
  return jsonb_build_object('riga', p_riga, 'articolo_id', r.articolo_id, 'matricola', v_matr,
                            'qta_sistema', r.qta_sistema, 'qta_contata', v_qta,
                            'differenza', v_qta - r.qta_sistema, 'rivelata', v_riv);
end $$;

-- ritorna: {riga, differenza, movimento}   (movimento = false se la differenza e' zero: nessuna rettifica scritta)
-- p_causale: conteggio | danneggiato | smarrito | errore_registrazione.
-- differenza = qta_contata - giacenza ATTUALE della riga (articolo, lotto, ubicazione), non quella fotografata all'apertura:
-- cosi' la giacenza finale e' sempre quella contata anche se nel frattempo ci sono stati movimenti. qta_sistema viene
-- aggiornata alla giacenza trovata al momento della rettifica (differenza = qta_contata - qta_sistema resta coerente).
create function api_inventario_rettifica(p_riga uuid, p_causale text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_diff numeric; v_mov boolean := false; v_matr text; v_cur numeric;
begin
  select ir.*, i.magazzino_id as mag, i.stato as inv_stato into r
  from inventario_righe ir join inventari i on i.id = ir.inventario_id where ir.id = p_riga for update of ir;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(r.mag);
  perform _richiedi(r.mag, 'inventario');
  if p_causale is null or p_causale not in ('conteggio', 'danneggiato', 'smarrito', 'errore_registrazione') then
    raise exception 'dato_non_valido';
  end if;
  if r.inv_stato <> 'aperto' or r.rettificata or r.qta_contata is null then raise exception 'stato_non_valido'; end if;
  -- stesso blocco di _movimenta (tutte le righe dell'articolo, per id): la giacenza letta qui non cambia fino alla fine
  perform 1 from giacenze where articolo_id = r.articolo_id order by id for update;
  select coalesce(sum(qta), 0) into v_cur from giacenze
  where articolo_id = r.articolo_id and lotto_id is not distinct from r.lotto_id and ubicazione_id is not distinct from r.ubicazione_id;
  v_diff := r.qta_contata - v_cur;
  select matricola into v_matr from articoli where id = r.articolo_id;
  if v_diff <> 0 then
    -- esatto = true: tocca proprio la riga (lotto, ubicazione) contata, senza FEFO/FIFO
    perform _movimenta(r.mag, r.articolo_id, r.lotto_id, r.ubicazione_id, v_diff, _costo_medio(r.articolo_id), 'rettifica', null, true);
    v_mov := true;
  end if;
  update inventario_righe set causale = p_causale, rettificata = true, user_id = _uid(), qta_sistema = v_cur where id = p_riga;
  perform _valuta_inventario(r.mag, r.articolo_id);
  perform _registra(r.mag, 'inventario_rettifica', 'inventario', r.inventario_id,
                    jsonb_build_object('riga', p_riga, 'matricola', v_matr, 'differenza', v_diff, 'causale', p_causale));
  return jsonb_build_object('riga', p_riga, 'differenza', v_diff, 'movimento', v_mov);
end $$;

-- ritorna: {id, stato, righe, rettificate, non_rettificate:[{riga, articolo_id, matricola, differenza}]}
--   non_rettificate = righe contate con differenza diversa da zero e senza rettifica (restano segnalate, il sistema non cambia)
create function api_inventario_chiudi(p_inventario uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i inventari; v_non jsonb; v_righe int; v_rett int;
begin
  select * into i from inventari where id = p_inventario for update;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(i.magazzino_id);
  perform _richiedi(i.magazzino_id, 'inventario');
  if i.stato <> 'aperto' then raise exception 'stato_non_valido'; end if;
  if exists (select 1 from inventario_righe where inventario_id = p_inventario and qta_contata is null) then
    raise exception 'stato_non_valido';
  end if;
  select count(*), count(*) filter (where rettificata) into v_righe, v_rett from inventario_righe where inventario_id = p_inventario;
  select coalesce(jsonb_agg(jsonb_build_object('riga', r.id, 'articolo_id', r.articolo_id, 'matricola', a.matricola,
                                               'differenza', r.qta_contata - r.qta_sistema) order by a.matricola), '[]')
    into v_non
  from inventario_righe r join articoli a on a.id = r.articolo_id
  where r.inventario_id = p_inventario and not r.rettificata and r.qta_contata <> r.qta_sistema;
  update inventari set stato = 'chiuso', chiuso_il = now() where id = p_inventario;
  perform _registra(i.magazzino_id, 'inventario_chiudi', 'inventario', p_inventario,
                    jsonb_build_object('righe', v_righe, 'rettificate', v_rett, 'non_rettificate', jsonb_array_length(v_non)));
  return jsonb_build_object('id', p_inventario, 'stato', 'chiuso', 'righe', v_righe, 'rettificate', v_rett, 'non_rettificate', v_non);
end $$;

-- ritorna: [{id, nome, stato, created_at, chiuso_il, n_righe, n_contate, n_rettificate,
--            righe:[{id, articolo_id, matricola, descrizione, lotto_id, lotto, ubicazione_id, ubicazione,
--                    qta_sistema, qta_contata, differenza, causale, rettificata}]}]   (piu' recente prima; differenza nulla se non contata)
create function api_inventari_elenco(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _membro(p_magazzino);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'nome', i.nome, 'stato', i.stato, 'created_at', i.created_at, 'chiuso_il', i.chiuso_il,
             'n_righe', x.n, 'n_contate', x.contate, 'n_rettificate', x.rett, 'righe', x.righe) order by i.created_at desc, i.id)
    from inventari i
    cross join lateral (
      select count(*) as n, count(r.qta_contata) as contate, count(*) filter (where r.rettificata) as rett,
             coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'articolo_id', r.articolo_id, 'matricola', a.matricola, 'descrizione', a.descrizione,
               'lotto_id', r.lotto_id, 'lotto', l.codice, 'ubicazione_id', r.ubicazione_id, 'ubicazione', u.codice,
               'qta_sistema', r.qta_sistema, 'qta_contata', r.qta_contata,
               'differenza', r.qta_contata - r.qta_sistema, 'causale', r.causale, 'rettificata', r.rettificata)
               order by a.matricola, u.codice nulls first, l.codice nulls first), '[]'::jsonb) as righe
      from inventario_righe r
      join articoli a on a.id = r.articolo_id
      left join lotti l on l.id = r.lotto_id
      left join ubicazioni u on u.id = r.ubicazione_id
      where r.inventario_id = i.id) x
    where i.magazzino_id = p_magazzino), '[]'::jsonb);
end $$;

-- ---------- riordino ----------

-- ritorna: [{articolo_id, matricola, descrizione, um, giacenza, ordinato, domanda_giornaliera, lead_time_giorni,
--            scorta_sicurezza, punto_riordino, punto_riordino_consigliato, eoq, qta_suggerita, urgenza, fornitore_abituale_id}]
--   articoli attivi, ordinati per urgenza ('alta' poi 'media' poi 'nessuna') e matricola.
--   domanda_giornaliera = articoli.domanda_giornaliera se presente, altrimenti scarichi degli ultimi 30 giorni / 30.
--   punto_riordino_consigliato = domanda x lead_time + scorta_sicurezza. ordinato = righe di ordini fornitore confermati.
--   eoq = ceil(sqrt(2 x domanda annua x costo_ordine / (prezzo_acquisto x costo_mantenimento_perc/100))), 0 se mancano i dati.
--   urgenza: soglia = max(punto_riordino, consigliato); se giacenza+ordinato <= soglia: 'alta' se giacenza <= scorta_sicurezza,
--   altrimenti 'media'; se sopra soglia 'nessuna'. qta_suggerita = max(eoq, soglia - (giacenza+ordinato)) (almeno 1), 0 se 'nessuna'.
create function api_riordino_suggerimenti(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _membro(p_magazzino);
  return coalesce((
    with b as (
      select a.id, a.matricola, a.descrizione, a.um, a.scorta_sicurezza, a.punto_riordino, a.lead_time_giorni,
             a.prezzo_acquisto_cent, a.costo_ordine_cent, a.costo_mantenimento_perc, a.fornitore_abituale_id,
             coalesce((select sum(g.qta) from giacenze g where g.articolo_id = a.id), 0) as giacenza,
             coalesce((select sum(rd.qta) from righe_documento rd join documenti d on d.id = rd.documento_id
                       where rd.articolo_id = a.id and d.tipo = 'ordine_fornitore' and d.stato = 'confermato'), 0) as ordinato,
             coalesce(a.domanda_giornaliera,
                      coalesce((select -sum(m.qta) from movimenti_stock m
                                where m.articolo_id = a.id and m.causale = 'scarico'
                                  and m.created_at >= now() - interval '30 days'), 0) / 30.0) as domanda
      from articoli a where a.magazzino_id = p_magazzino and a.attivo
    ), c as (
      select b.*,
             round(b.domanda * b.lead_time_giorni + b.scorta_sicurezza, 3) as consigliato,
             case when b.domanda > 0 and b.costo_ordine_cent > 0 and b.prezzo_acquisto_cent > 0 and b.costo_mantenimento_perc > 0
                  then ceil(sqrt(2 * b.domanda * 365 * b.costo_ordine_cent
                                 / (b.prezzo_acquisto_cent * b.costo_mantenimento_perc / 100)))
                  else 0 end as eoq
      from b
    ), d as (
      select c.*, greatest(c.punto_riordino, c.consigliato) as soglia, c.giacenza + c.ordinato as posizione from c
    ), e as (
      select d.*,
             case when d.soglia > 0 and d.posizione <= d.soglia
                  then (case when d.giacenza <= d.scorta_sicurezza then 'alta' else 'media' end)
                  else 'nessuna' end as urgenza
      from d
    )
    select jsonb_agg(jsonb_build_object(
             'articolo_id', e.id, 'matricola', e.matricola, 'descrizione', e.descrizione, 'um', e.um,
             'giacenza', e.giacenza, 'ordinato', e.ordinato, 'domanda_giornaliera', round(e.domanda, 3),
             'lead_time_giorni', e.lead_time_giorni, 'scorta_sicurezza', e.scorta_sicurezza,
             'punto_riordino', e.punto_riordino, 'punto_riordino_consigliato', e.consigliato,
             'eoq', e.eoq,
             'qta_suggerita', case when e.urgenza = 'nessuna' then 0 else greatest(e.eoq, ceil(e.soglia - e.posizione), 1) end,
             'urgenza', e.urgenza, 'fornitore_abituale_id', e.fornitore_abituale_id)
           order by case e.urgenza when 'alta' then 0 when 'media' then 1 else 2 end, e.matricola)
    from e), '[]'::jsonb);
end $$;

-- ---------- KPI ----------

-- ritorna: {giorni, valore_giacenza, costo_venduto, rotazione, copertura_giorni, sottoscorta,
--           abc:[{articolo, articolo_id, descrizione, classe, valore, perc_cum}],
--           fermi:[{articolo_id, matricola, descrizione, giacenza, valore, ultimo_scarico}]}
--   Soldi in centesimi. valore_giacenza = costo medio ponderato dal registro movimenti. costo_venduto = scarichi del periodo x costo.
--   rotazione = costo_venduto / giacenza media (media dei valori a inizio e fine periodo), nulla se la giacenza media e' zero.
--   copertura_giorni = valore_giacenza / (costo_venduto / giorni), nulla se non ci sono scarichi. sottoscorta = articoli attivi
--   con punto_riordino > 0 e giacenza <= punto_riordino. abc: valore = consumo del periodo (costo), classe A finche' il
--   cumulato prima dell'articolo e' < 80%, B < 95%, C il resto; perc_cum include l'articolo; articolo = matricola.
--   fermi: articoli attivi con giacenza > 0 e nessuno scarico nel periodo (ultimo_scarico nullo se non ce ne sono mai stati).
create function api_kpi(p_magazzino uuid, p_giorni int default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_giorni int := coalesce(p_giorni, 30); v_inizio timestamptz;
  v_fine_val numeric; v_ini_val numeric; v_cogs numeric; v_media numeric;
  v_sotto int; v_abc jsonb; v_fermi jsonb;
begin
  perform _membro(p_magazzino);
  if v_giorni < 1 or v_giorni > 3650 then raise exception 'dato_non_valido'; end if;
  v_inizio := now() - make_interval(days => v_giorni);

  select coalesce(sum(v.cmp), 0) into v_fine_val
  from articoli a cross join lateral _valorizza_articolo(a.id, null) v where a.magazzino_id = p_magazzino;
  select coalesce(sum(v.cmp), 0) into v_ini_val
  from articoli a cross join lateral _valorizza_articolo(a.id, v_inizio) v where a.magazzino_id = p_magazzino;
  select coalesce(sum(-m.qta * m.costo_unit_cent), 0) into v_cogs from movimenti_stock m
  where m.magazzino_id = p_magazzino and m.causale = 'scarico' and m.created_at >= v_inizio;
  v_media := (v_ini_val + v_fine_val) / 2;

  select count(*) into v_sotto from articoli a
  where a.magazzino_id = p_magazzino and a.attivo and a.punto_riordino > 0
    and coalesce((select sum(g.qta) from giacenze g where g.articolo_id = a.id), 0) <= a.punto_riordino;

  with c as (
    select a.id, a.matricola, a.descrizione, sum(-m.qta * m.costo_unit_cent) as v
    from movimenti_stock m join articoli a on a.id = m.articolo_id
    where m.magazzino_id = p_magazzino and m.causale = 'scarico' and m.created_at >= v_inizio
    group by a.id, a.matricola, a.descrizione having sum(-m.qta * m.costo_unit_cent) > 0
  ), t as (
    select c.*, sum(c.v) over () as tot, sum(c.v) over (order by c.v desc, c.matricola) as cum from c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'articolo', t.matricola, 'articolo_id', t.id, 'descrizione', t.descrizione,
           'classe', case when (t.cum - t.v) * 100 < 80 * t.tot then 'A' when (t.cum - t.v) * 100 < 95 * t.tot then 'B' else 'C' end,
           'valore', round(t.v), 'perc_cum', round(t.cum * 100 / t.tot, 2)) order by t.v desc, t.matricola), '[]'::jsonb)
    into v_abc from t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'articolo_id', a.id, 'matricola', a.matricola, 'descrizione', a.descrizione, 'giacenza', g.q,
           'valore', round(v.cmp),
           'ultimo_scarico', (select max(m.created_at) from movimenti_stock m where m.articolo_id = a.id and m.causale = 'scarico'))
           order by a.matricola), '[]'::jsonb)
    into v_fermi
  from articoli a
  cross join lateral (select coalesce(sum(x.qta), 0) as q from giacenze x where x.articolo_id = a.id) g
  cross join lateral _valorizza_articolo(a.id, null) v
  where a.magazzino_id = p_magazzino and a.attivo and g.q > 0
    and not exists (select 1 from movimenti_stock m where m.articolo_id = a.id and m.causale = 'scarico' and m.created_at >= v_inizio);

  return jsonb_build_object(
    'giorni', v_giorni,
    'valore_giacenza', round(v_fine_val),
    'costo_venduto', round(v_cogs),
    'rotazione', case when v_media > 0 then round(v_cogs / v_media, 2) end,
    'copertura_giorni', case when v_cogs > 0 then round(v_fine_val / (v_cogs / v_giorni), 1) end,
    'sottoscorta', v_sotto, 'abc', v_abc, 'fermi', v_fermi);
end $$;

-- ---------- valorizzazione ----------

-- ritorna: {righe:[{articolo_id, matricola, descrizione, um, qta, valore_cmp, valore_fifo, valore_lifo,
--                   diff_fifo_cmp, diff_lifo_cmp, diff_fifo_lifo}],
--           totali:{valore_cmp, valore_fifo, valore_lifo, diff_fifo_cmp, diff_lifo_cmp, diff_fifo_lifo}}
--   Soldi in centesimi, rifatti dal registro movimenti_stock (solo articoli con movimenti, ordinati per matricola).
--   qta = somma del registro. diff_x_y = valore_x - valore_y. Trasferimenti ignorati.
create function api_valorizzazione(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _membro(p_magazzino);
  return (
    with r as (
      select a.id, a.matricola, a.descrizione, a.um, v.qta, round(v.cmp) as c, round(v.fifo) as f, round(v.lifo) as l
      from articoli a cross join lateral _valorizza_articolo(a.id, null) v
      where a.magazzino_id = p_magazzino and exists (select 1 from movimenti_stock m where m.articolo_id = a.id)
    )
    select jsonb_build_object(
      'righe', coalesce((select jsonb_agg(jsonb_build_object(
                 'articolo_id', r.id, 'matricola', r.matricola, 'descrizione', r.descrizione, 'um', r.um, 'qta', r.qta,
                 'valore_cmp', r.c, 'valore_fifo', r.f, 'valore_lifo', r.l,
                 'diff_fifo_cmp', r.f - r.c, 'diff_lifo_cmp', r.l - r.c, 'diff_fifo_lifo', r.f - r.l)
                 order by r.matricola) from r), '[]'::jsonb),
      'totali', (select jsonb_build_object(
                 'valore_cmp', coalesce(sum(r.c), 0), 'valore_fifo', coalesce(sum(r.f), 0), 'valore_lifo', coalesce(sum(r.l), 0),
                 'diff_fifo_cmp', coalesce(sum(r.f - r.c), 0), 'diff_lifo_cmp', coalesce(sum(r.l - r.c), 0),
                 'diff_fifo_lifo', coalesce(sum(r.f - r.l), 0)) from r)));
end $$;

-- ===== migrations/0008_agenda.sql =====
-- 0008_agenda.sql
-- Agenda personale: scadenze e appuntamenti dell'utente dentro un magazzino.
-- Ognuno vede e modifica solo le proprie (anche il docente: l'agenda e' personale).

-- ritorna: [{id, oggetto, descrizione, inizio, fine, tipo, stato, anagrafica_id, ragione_sociale}] ordinate per inizio;
--          p_dal / p_al (timestamptz, opzionali) delimitano per data di inizio (p_al escluso)
create function api_scadenze_elenco(p_magazzino uuid, p_dal timestamptz default null, p_al timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  perform _membro(p_magazzino);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'oggetto', s.oggetto, 'descrizione', s.descrizione, 'inizio', s.inizio, 'fine', s.fine,
      'tipo', s.tipo, 'stato', s.stato, 'anagrafica_id', s.anagrafica_id, 'ragione_sociale', a.ragione_sociale
    ) order by s.inizio)
    from scadenze s left join anagrafiche a on a.id = s.anagrafica_id
    where s.magazzino_id = p_magazzino and s.user_id = u
      and (p_dal is null or s.inizio >= p_dal) and (p_al is null or s.inizio < p_al)
  ), '[]'::jsonb);
end $$;

-- p_dati: {id?, oggetto, descrizione?, inizio, fine, tipo?, stato?, anagrafica_id?}; con id modifica, senza crea
-- ritorna: {id, oggetto, descrizione, inizio, fine, tipo, stato, anagrafica_id}
create function api_scadenza_salva(p_magazzino uuid, p_dati jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); r scadenze; v_id uuid := nullif(p_dati ->> 'id', '')::uuid;
        v_ini timestamptz; v_fine timestamptz; v_ana uuid := nullif(p_dati ->> 'anagrafica_id', '')::uuid;
begin
  perform _richiedi(p_magazzino, 'scadenze');
  if coalesce(trim(p_dati ->> 'oggetto'), '') = '' or char_length(p_dati ->> 'oggetto') > 500
     or char_length(coalesce(p_dati ->> 'descrizione', '')) > 500 then
    raise exception 'dato_non_valido';
  end if;
  begin
    v_ini := (p_dati ->> 'inizio')::timestamptz;
    v_fine := coalesce((p_dati ->> 'fine')::timestamptz, v_ini);
  exception when others then raise exception 'dato_non_valido';
  end;
  if v_ini is null or v_fine < v_ini then raise exception 'dato_non_valido'; end if;
  if coalesce(p_dati ->> 'tipo', 'appuntamento') not in ('appuntamento', 'scadenza')
     or coalesce(p_dati ->> 'stato', 'in_sospeso') not in ('in_sospeso', 'completato') then
    raise exception 'dato_non_valido';
  end if;
  if v_ana is not null and not exists (select 1 from anagrafiche where id = v_ana and magazzino_id = p_magazzino) then
    raise exception 'non_trovato';
  end if;

  if v_id is null then
    insert into scadenze (magazzino_id, user_id, oggetto, descrizione, inizio, fine, tipo, stato, anagrafica_id)
    values (p_magazzino, u, trim(p_dati ->> 'oggetto'), p_dati ->> 'descrizione', v_ini, v_fine,
            coalesce(p_dati ->> 'tipo', 'appuntamento'), coalesce(p_dati ->> 'stato', 'in_sospeso'), v_ana)
    returning * into r;
  else
    update scadenze set oggetto = trim(p_dati ->> 'oggetto'), descrizione = p_dati ->> 'descrizione',
           inizio = v_ini, fine = v_fine, tipo = coalesce(p_dati ->> 'tipo', tipo),
           stato = coalesce(p_dati ->> 'stato', stato), anagrafica_id = v_ana
    where id = v_id and magazzino_id = p_magazzino and user_id = u
    returning * into r;
    if not found then raise exception 'non_trovato'; end if;
  end if;
  perform _registra(p_magazzino, case when v_id is null then 'scadenza_crea' else 'scadenza_modifica' end,
                    'scadenza', r.id, jsonb_build_object('oggetto', r.oggetto));
  return jsonb_build_object('id', r.id, 'oggetto', r.oggetto, 'descrizione', r.descrizione, 'inizio', r.inizio,
                            'fine', r.fine, 'tipo', r.tipo, 'stato', r.stato, 'anagrafica_id', r.anagrafica_id);
end $$;

-- ritorna: {ok: true}
create function api_scadenza_elimina(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); r scadenze;
begin
  select * into r from scadenze where id = p_id and user_id = u;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(r.magazzino_id, 'scadenze');
  delete from scadenze where id = p_id;
  perform _registra(r.magazzino_id, 'scadenza_elimina', 'scadenza', p_id, jsonb_build_object('oggetto', r.oggetto));
  return jsonb_build_object('ok', true);
end $$;

-- ===== migrations/0009_scenari_elenco.sql =====
-- 0009_scenari_elenco.sql
-- Elenco degli scenari di una classe (mancava nel catalogo): serve alla schermata del docente.

-- ritorna: [{id, nome, descrizione, stato, seed, config, created_at, compiti:{totale, completati, errori, bloccati}}], dal piu' recente
-- Solo il docente della classe.
create function api_scenari_elenco(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _uid();
  if not _sono_docente(p_magazzino) then raise exception 'permesso_negato'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'nome', s.nome, 'descrizione', s.descrizione, 'stato', s.stato, 'seed', s.seed,
      'config', s.config, 'created_at', s.created_at,
      'compiti', jsonb_build_object(
        'totale', (select count(*) from compiti c where c.scenario_id = s.id),
        'completati', (select count(*) from compiti c where c.scenario_id = s.id and c.stato = 'completato'),
        'errori', (select count(*) from compiti c where c.scenario_id = s.id and c.stato = 'errore'),
        'bloccati', (select count(*) from compiti c where c.scenario_id = s.id and c.stato = 'bloccato'))
    ) order by s.created_at desc)
    from scenari s where s.magazzino_id = p_magazzino
  ), '[]'::jsonb);
end $$;

-- ===== migrations/0099_grants.sql =====
-- 0099_grants.sql  (resta sempre l'ultima migrazione)
-- Nessun accesso diretto alle tabelle. Il client puo' chiamare solo le funzioni api_*.
-- Le funzioni interne (_nome) non sono chiamabili dal client: per questo si toglie tutto a PUBLIC.

-- Oggetti creati DOPO questa migrazione (nuove migrazioni): niente privilegi di default.
-- 1) EXECUTE a PUBLIC e' il default globale di Postgres: va tolto a livello globale (un revoke "in schema" non lo toglie).
-- 2) Su Supabase i default privileges danno ALL ad anon/authenticated: si tolgono per lo schema public.
-- Valgono per il ruolo che esegue la migrazione (su Supabase: postgres, quello delle migrazioni).
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Ogni tabella nuova in public riceve RLS attiva (senza policy = nessun accesso diretto), come quelle di 0001.
create function _rls_automatico() returns event_trigger language plpgsql as $$
declare r record;
begin
  for r in select object_identity from pg_event_trigger_ddl_commands()
           where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') and schema_name = 'public' loop
    execute format('alter table %s enable row level security', r.object_identity);
  end loop;
end $$;
create event trigger rls_automatico on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') execute function _rls_automatico();

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

do $$
declare f record;
begin
  for f in select oid::regprocedure as sig from pg_proc
           where pronamespace = 'public'::regnamespace and proname like 'api\_%' loop
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
