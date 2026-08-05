-- =====================================================================
-- 0007_ingestao.sql — entrada de dados vinda do DJEN e do PDPJ
-- =====================================================================
-- Princípio de projeto: o payload cru de cada fonte é gravado primeiro,
-- intacto, e só depois normalizado para as tabelas do domínio.
--
-- Isso existe porque os contratos dessas APIs mudam e nem sempre são
-- documentados com precisão. Se o mapeamento estiver errado, o dado não
-- se perde: corrige-se o normalizador e reprocessa a partir do bruto,
-- sem precisar baixar tudo de novo.
-- =====================================================================

do $$ begin
  create type fonte_dados as enum (
    'djen',            -- Diário de Justiça Eletrônico Nacional (comunicações)
    'datajud',         -- API Pública do DataJud/CNJ (metadados e movimentos)
    'pdpj',            -- DataLake PDPJ (documentos: inicial, sentença, laudo)
    'manual'           -- cadastro feito na tela
  );
exception when duplicate_object then null; end $$;

-- Como o dado chegou até aqui. Separa o que foi conferido por humano do
-- que veio de extração automática — distinção que a estatística respeita.
do $$ begin
  create type origem_dado as enum (
    'manual',                -- digitado e conferido por pessoa
    'importado',             -- veio de API em campo estruturado, confiável
    'extraido_automatico'    -- inferido de texto livre, precisa conferência
  );
exception when duplicate_object then null; end $$;

-- =====================================================================
-- Controle de sincronização: até onde cada fonte já foi lida.
-- =====================================================================
create table if not exists sincronizacao (
  id                uuid primary key default gen_random_uuid(),
  fonte             fonte_dados not null,
  escopo            text not null default 'padrao',   -- ex.: OAB consultada, tribunal
  ultimo_sucesso    timestamptz,
  ultima_tentativa  timestamptz,
  cursor            text,               -- data ou token de continuação da fonte
  itens_recebidos   integer not null default 0,
  itens_novos       integer not null default 0,
  status            text not null default 'ocioso',
  erro              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint sincronizacao_fonte_escopo_key unique (fonte, escopo)
);

-- =====================================================================
-- Staging: payload bruto, exatamente como veio.
-- =====================================================================
create table if not exists payload_bruto (
  id            uuid primary key default gen_random_uuid(),
  fonte         fonte_dados not null,
  tipo          text not null,          -- 'comunicacao', 'processo', 'documento'
  id_externo    text not null,          -- identificador na origem
  numero_cnj    text,                   -- quando o payload traz, facilita o join
  payload       jsonb not null,
  sha256        text,
  recebido_em   timestamptz not null default now(),
  processado_em timestamptz,
  erro_processamento text,
  constraint payload_bruto_fonte_id_key unique (fonte, tipo, id_externo)
);

create index if not exists idx_payload_pendente
  on payload_bruto (fonte, tipo) where processado_em is null;
create index if not exists idx_payload_numero_cnj on payload_bruto (numero_cnj);
create index if not exists idx_payload_gin on payload_bruto using gin (payload);

-- =====================================================================
-- DJEN — comunicações e intimações publicadas
-- =====================================================================
-- O DJEN entrega o teor do ato publicado. Serve para acompanhar
-- andamento e prazo, e muitas vezes traz o dispositivo da sentença.
-- Não traz o inteiro teor nem o laudo pericial.
-- =====================================================================
create table if not exists publicacao (
  id                    uuid primary key default gen_random_uuid(),
  id_externo            text not null,
  processo_id           uuid references processo (id) on delete set null,
  numero_cnj            text,
  tribunal              text,
  orgao                 text,
  tipo_comunicacao      text,           -- Intimação, Citação, Edital...
  data_disponibilizacao date,
  data_publicacao       date,
  teor                  text,
  destinatarios         jsonb not null default '[]'::jsonb,
  advogados             jsonb not null default '[]'::jsonb,
  numero_oab            text,
  uf_oab                char(2),
  link_certidao         text,
  -- Fluxo de trabalho do escritório sobre a publicação.
  lida                  boolean not null default false,
  prazo_dias            integer,
  prazo_fatal           date,
  observacoes           text,
  tsv                   tsvector,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint publicacao_id_externo_key unique (id_externo)
);

create index if not exists idx_publicacao_processo on publicacao (processo_id);
create index if not exists idx_publicacao_data on publicacao (data_disponibilizacao desc);
create index if not exists idx_publicacao_nao_lida on publicacao (lida) where not lida;
create index if not exists idx_publicacao_prazo on publicacao (prazo_fatal) where prazo_fatal is not null;
create index if not exists idx_publicacao_numero_cnj on publicacao (numero_cnj);

create or replace function tg_publicacao_tsv()
returns trigger
language plpgsql
as $$
begin
  new.tsv :=
      setweight(to_tsvector('portugues_sem_acento', coalesce(new.tipo_comunicacao, '')), 'A')
   || setweight(to_tsvector('portugues_sem_acento', coalesce(new.teor, '')), 'B')
   || setweight(to_tsvector('portugues_sem_acento',
        concat_ws(' ', new.tribunal, new.orgao, new.numero_cnj)), 'D');
  return new;
end;
$$;

drop trigger if exists set_tsv on publicacao;
create trigger set_tsv
  before insert or update of tipo_comunicacao, teor, tribunal, orgao, numero_cnj
  on publicacao
  for each row execute function tg_publicacao_tsv();

create index if not exists idx_publicacao_tsv on publicacao using gin (tsv);

-- =====================================================================
-- DataJud — movimentos processuais (tabela de movimentos do CNJ)
-- =====================================================================
-- O DataJud devolve metadados e movimentos codificados pela TPU. Não
-- devolve texto de documento.
-- =====================================================================
create table if not exists movimento (
  id            uuid primary key default gen_random_uuid(),
  processo_id   uuid not null references processo (id) on delete cascade,
  codigo_cnj    integer,
  nome          text,
  data_hora     timestamptz,
  complementos  jsonb not null default '[]'::jsonb,
  fonte         fonte_dados not null default 'datajud',
  created_at    timestamptz not null default now(),
  -- Um mesmo movimento não deve entrar duas vezes em ressincronizações.
  constraint movimento_unico unique (processo_id, codigo_cnj, data_hora)
);

create index if not exists idx_movimento_processo_data
  on movimento (processo_id, data_hora desc);
create index if not exists idx_movimento_codigo on movimento (codigo_cnj);

-- =====================================================================
-- PDPJ — documentos do processo (é daqui que sai o laudo)
-- =====================================================================
create table if not exists documento_externo (
  id             uuid primary key default gen_random_uuid(),
  fonte          fonte_dados not null default 'pdpj',
  id_externo     text not null,
  processo_id    uuid references processo (id) on delete set null,
  numero_cnj     text,
  nome           text,
  tipo_origem    text,            -- rótulo do documento na origem
  categoria      text,            -- 'laudo', 'sentenca', 'inicial', 'contestacao'...
  data_juntada   date,
  texto          text,
  paginas        integer,
  via_ocr        boolean not null default false,
  metadados      jsonb not null default '{}'::jsonb,
  sha256         text,
  baixado_em     timestamptz not null default now(),
  tsv            tsvector,
  constraint documento_externo_fonte_id_key unique (fonte, id_externo)
);

create index if not exists idx_doc_ext_processo on documento_externo (processo_id);
create index if not exists idx_doc_ext_categoria on documento_externo (categoria);
create index if not exists idx_doc_ext_numero_cnj on documento_externo (numero_cnj);

create or replace function tg_documento_externo_tsv()
returns trigger
language plpgsql
as $$
begin
  new.tsv :=
      setweight(to_tsvector('portugues_sem_acento', coalesce(new.nome, '')), 'A')
   || setweight(to_tsvector('portugues_sem_acento', coalesce(new.texto, '')), 'C');
  return new;
end;
$$;

drop trigger if exists set_tsv on documento_externo;
create trigger set_tsv
  before insert or update of nome, texto on documento_externo
  for each row execute function tg_documento_externo_tsv();

create index if not exists idx_doc_ext_tsv on documento_externo using gin (tsv);

-- =====================================================================
-- Proveniência nas tabelas de domínio
-- =====================================================================

alter table processo
  add column if not exists fonte            fonte_dados not null default 'manual',
  add column if not exists id_externo       text,
  add column if not exists classe_cnj       text,
  add column if not exists codigo_classe    integer,
  add column if not exists assuntos         jsonb not null default '[]'::jsonb,
  add column if not exists grau             text,
  add column if not exists tribunal_sigla   text,
  add column if not exists sincronizado_em  timestamptz;

create index if not exists idx_processo_sincronizado on processo (sincronizado_em);

alter table decisao
  add column if not exists documento_externo_id uuid references documento_externo (id) on delete set null,
  add column if not exists publicacao_id        uuid references publicacao (id) on delete set null,
  add column if not exists fonte                fonte_dados not null default 'manual',
  add column if not exists origem_dado          origem_dado not null default 'manual';

create index if not exists idx_decisao_doc_ext on decisao (documento_externo_id);

-- O laudo é o ponto sensível: perito e conclusão não vêm em campo
-- estruturado de nenhuma das APIs. São inferidos do texto, então
-- carregam grau de confiança e passam por conferência humana antes de
-- entrar na estatística.
alter table laudo_pericial
  add column if not exists documento_externo_id uuid references documento_externo (id) on delete set null,
  add column if not exists origem_dado          origem_dado not null default 'manual',
  add column if not exists confianca            numeric(3, 2),
  add column if not exists revisado_em          timestamptz,
  add column if not exists revisado_por         text,
  add column if not exists trecho_conclusao     text;

create index if not exists idx_laudo_pendente_revisao
  on laudo_pericial (origem_dado) where revisado_em is null;

-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sincronizacao', 'publicacao']
  loop
    execute format(
      'drop trigger if exists set_updated_at on %I;
       create trigger set_updated_at before update on %I
         for each row execute function tg_set_updated_at();', t, t);
  end loop;
end $$;
