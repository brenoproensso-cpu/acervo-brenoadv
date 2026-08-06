-- =====================================================================
-- instalar.sql — instalação completa do Acervo Jurídico
-- =====================================================================
-- GERADO AUTOMATICAMENTE por scripts/gerar-instalador.mjs.
-- Não edite este arquivo: altere as migrations em db/migrations/ e gere
-- de novo, senão a próxima geração descarta suas mudanças.
--
-- COMO USAR NO SUPABASE
--   1. Painel do projeto -> SQL Editor -> New query
--   2. Cole este arquivo inteiro
--   3. Run
--
-- Roda numa transação: ou aplica tudo, ou não aplica nada.
--
-- É seguro rodar de novo. Cada migration usa "create table if not
-- exists" e "create or replace", então reaplicar não duplica nem apaga
-- nada — apenas reafirma o estado atual.
--
-- Contém 10 migrations. NÃO inclui dados de demonstração.
-- =====================================================================

begin;

create table if not exists schema_migrations (
  versao      text primary key,
  aplicada_em timestamptz not null default now()
);


-- =====================================================================
-- 0001_base.sql
-- =====================================================================
-- =====================================================================
-- 0001_base.sql — extensões, tipos e funções de apoio
-- Acervo Jurídico — Breno Proenço Advogado
-- =====================================================================
-- Compatível com Postgres 14+ e com Supabase.
-- =====================================================================

-- gen_random_uuid() é nativo do Postgres desde a versão 13, então não há
-- dependência de uuid-ossp nem de pgcrypto.
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ---------------------------------------------------------------------
-- f_unaccent: wrapper estável sobre unaccent().
-- Usado apenas dentro de triggers e de queries, nunca em colunas
-- geradas, então não precisa ser IMMUTABLE.
-- ---------------------------------------------------------------------
create or replace function f_unaccent(txt text)
returns text
language sql
stable
parallel safe
as $$
  select unaccent(coalesce(txt, ''));
$$;

-- ---------------------------------------------------------------------
-- Tipos enumerados do domínio
-- ---------------------------------------------------------------------

-- Natureza do documento decisório.
do $$ begin
  create type tipo_documento as enum (
    'sentenca',
    'acordao',
    'decisao_monocratica',
    'decisao_interlocutoria',
    'despacho',
    'ementa',
    'sumula',
    'tese_repetitiva',
    'parecer'
  );
exception when duplicate_object then null; end $$;

-- De onde veio o documento. Só o acervo próprio alimenta as
-- estatísticas de êxito; jurisprudência externa é material de consulta.
do $$ begin
  create type origem_documento as enum (
    'acervo_proprio',
    'jurisprudencia_externa'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type instancia as enum (
    'primeiro_grau',
    'turma_recursal',
    'segundo_grau',
    'tnu',
    'superior',
    'supremo'
  );
exception when duplicate_object then null; end $$;

-- Desfecho do julgamento. Cobre 1º grau e recursos.
do $$ begin
  create type resultado_julgamento as enum (
    'procedente',
    'parcialmente_procedente',
    'improcedente',
    'extinto_sem_merito',
    'homologacao_acordo',
    'provido',
    'parcialmente_provido',
    'desprovido',
    'nao_conhecido'
  );
exception when duplicate_object then null; end $$;

-- Conclusão do laudo. Cobre incapacidade (auxílio-doença, aposentadoria
-- por incapacidade, auxílio-acidente) e impedimento de longo prazo (BPC/LOAS).
do $$ begin
  create type conclusao_pericial as enum (
    'incapacidade_total_permanente',
    'incapacidade_total_temporaria',
    'incapacidade_parcial_permanente',
    'incapacidade_parcial_temporaria',
    'impedimento_longo_prazo',
    'sem_impedimento',
    'sem_incapacidade',
    'inconclusivo'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_perito as enum (
    'judicial',
    'assistente_tecnico',
    'administrativo_inss'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_peca as enum (
    'peticao_inicial',
    'contestacao',
    'replica',
    'quesitos',
    'impugnacao_laudo',
    'memoriais',
    'recurso_inominado',
    'apelacao',
    'agravo',
    'embargos_declaracao',
    'contrarrazoes',
    'recurso_especial',
    'recurso_extraordinario',
    'peticao_simples',
    'parecer',
    'outros'
  );
exception when duplicate_object then null; end $$;

-- Polo ocupado pelo escritório. Define a leitura de "favorável".
do $$ begin
  create type polo as enum ('ativo', 'passivo');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Mapeamento padrão resultado -> favorável, na ótica do polo ativo.
-- Serve apenas como palpite inicial: a coluna decisao.favoravel pode
-- ser sobrescrita manualmente (ex.: recurso do INSS desprovido é
-- favorável ao segurado, mas o enum não sabe quem recorreu).
-- ---------------------------------------------------------------------
create or replace function resultado_e_favoravel(r resultado_julgamento, p polo default 'ativo')
returns boolean
language sql
immutable
parallel safe
as $$
  select case
    when r is null then null
    when p = 'ativo' then r in (
      'procedente',
      'parcialmente_procedente',
      'homologacao_acordo',
      'provido',
      'parcialmente_provido'
    )
    else r in (
      'improcedente',
      'extinto_sem_merito',
      'homologacao_acordo',
      'desprovido',
      'nao_conhecido'
    )
  end;
$$;

-- ---------------------------------------------------------------------
-- A conclusão pericial reconheceu incapacidade / impedimento?
-- ---------------------------------------------------------------------
create or replace function conclusao_reconhece_incapacidade(c conclusao_pericial)
returns boolean
language sql
immutable
parallel safe
as $$
  select case
    when c is null then null
    when c in ('sem_incapacidade', 'sem_impedimento', 'inconclusivo') then false
    else true
  end;
$$;

-- ---------------------------------------------------------------------
-- Toque de atualização em updated_at
-- ---------------------------------------------------------------------
create or replace function tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

insert into schema_migrations (versao) values ('0001_base.sql')
  on conflict (versao) do nothing;


-- =====================================================================
-- 0002_catalogos.sql
-- =====================================================================
-- =====================================================================
-- 0002_catalogos.sql — tabelas de referência
-- =====================================================================
-- São as dimensões pelas quais o acervo é cruzado no painel de padrões:
-- órgão julgador, magistrado, perito, benefício e tese.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Órgão julgador: vara, juizado, turma recursal, câmara, seção.
-- ---------------------------------------------------------------------
create table if not exists orgao_julgador (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  tipo         text,                       -- 'Vara Federal', 'JEF', 'Turma Recursal', ...
  tribunal     text,                       -- 'TRF3', 'TJSP', 'STJ', ...
  comarca      text,
  uf           char(2),
  instancia    instancia not null default 'primeiro_grau',
  observacoes  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint orgao_julgador_nome_uf_key unique (nome, uf)
);

create index if not exists idx_orgao_julgador_tribunal on orgao_julgador (tribunal);
create index if not exists idx_orgao_julgador_uf on orgao_julgador (uf);
create index if not exists idx_orgao_julgador_nome_trgm
  on orgao_julgador using gin (nome gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Magistrado (juiz ou relator).
-- ---------------------------------------------------------------------
create table if not exists magistrado (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  orgao_julgador_id  uuid references orgao_julgador (id) on delete set null,
  cargo              text,                 -- 'Juiz Federal', 'Desembargador', ...
  observacoes        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint magistrado_nome_key unique (nome)
);

create index if not exists idx_magistrado_orgao on magistrado (orgao_julgador_id);
create index if not exists idx_magistrado_nome_trgm
  on magistrado using gin (nome gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Perito. O eixo central da pergunta "quantas sentenças favoráveis
-- saíram quando o perito X reconheceu incapacidade".
-- ---------------------------------------------------------------------
create table if not exists perito (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  tipo          tipo_perito not null default 'judicial',
  especialidade text,                      -- 'Ortopedia', 'Psiquiatria', ...
  crm           text,
  uf            char(2),
  observacoes   text,                      -- anotações do escritório sobre o perito
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint perito_nome_tipo_key unique (nome, tipo)
);

create index if not exists idx_perito_especialidade on perito (especialidade);
create index if not exists idx_perito_nome_trgm
  on perito using gin (nome gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Benefício previdenciário / assistencial.
-- ---------------------------------------------------------------------
create table if not exists beneficio (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null,               -- 'B31', 'B32', 'B91', 'B87', ...
  nome        text not null,
  descricao   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint beneficio_codigo_key unique (codigo)
);

-- ---------------------------------------------------------------------
-- Tese / tópico jurídico. Vinculável a decisões e a peças, permitindo
-- medir aceitação de cada tese e reaproveitar a redação que funcionou.
-- ---------------------------------------------------------------------
create table if not exists tese (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descricao   text,
  ramo        text default 'Previdenciário',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tese_nome_key unique (nome)
);

create index if not exists idx_tese_nome_trgm
  on tese using gin (nome gin_trgm_ops);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['orgao_julgador', 'magistrado', 'perito', 'beneficio', 'tese']
  loop
    execute format(
      'drop trigger if exists set_updated_at on %I;
       create trigger set_updated_at before update on %I
         for each row execute function tg_set_updated_at();', t, t);
  end loop;
end $$;

insert into schema_migrations (versao) values ('0002_catalogos.sql')
  on conflict (versao) do nothing;


-- =====================================================================
-- 0003_acervo.sql
-- =====================================================================
-- =====================================================================
-- 0003_acervo.sql — processo, laudo, decisão, peça
-- =====================================================================

-- ---------------------------------------------------------------------
-- Processo. Versão enxuta: é a âncora que liga laudo e decisão do mesmo
-- caso, o que a estatística exige. O módulo completo de andamentos e
-- prazos entra em fase posterior.
-- ---------------------------------------------------------------------
create table if not exists processo (
  id                 uuid primary key default gen_random_uuid(),
  numero_cnj         text,
  cliente_nome       text,
  cliente_iniciais   text,                 -- para casos em segredo de justiça
  segredo_justica    boolean not null default false,
  polo_escritorio    polo not null default 'ativo',
  orgao_julgador_id  uuid references orgao_julgador (id) on delete set null,
  magistrado_id      uuid references magistrado (id) on delete set null,
  beneficio_id       uuid references beneficio (id) on delete set null,
  uf                 char(2),
  data_distribuicao  date,
  data_der           date,                 -- data de entrada do requerimento
  valor_causa        numeric(14, 2),
  status             text default 'em_andamento',
  observacoes        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint processo_numero_cnj_key unique (numero_cnj)
);

create index if not exists idx_processo_orgao on processo (orgao_julgador_id);
create index if not exists idx_processo_magistrado on processo (magistrado_id);
create index if not exists idx_processo_beneficio on processo (beneficio_id);
create index if not exists idx_processo_cliente_trgm
  on processo using gin (cliente_nome gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Laudo pericial. Um processo pode ter mais de um (perito judicial,
-- assistente técnico, complementar), por isso é tabela própria.
-- ---------------------------------------------------------------------
create table if not exists laudo_pericial (
  id                      uuid primary key default gen_random_uuid(),
  processo_id             uuid not null references processo (id) on delete cascade,
  perito_id               uuid references perito (id) on delete set null,
  data_laudo              date,
  conclusao               conclusao_pericial,
  -- Derivada da conclusão, materializada para permitir índice e
  -- agregação direta sem repetir a regra em cada consulta.
  reconheceu_incapacidade boolean generated always as (
    conclusao_reconhece_incapacidade(conclusao)
  ) stored,
  cid_principal           text,
  cids                    text[] not null default '{}',
  dii                     date,            -- data de início da incapacidade
  dib_sugerida            date,            -- data de início do benefício sugerida
  reabilitavel            boolean,
  grau_incapacidade       text,            -- observação livre do perito
  resumo                  text,
  texto                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_laudo_processo on laudo_pericial (processo_id);
create index if not exists idx_laudo_perito on laudo_pericial (perito_id);
create index if not exists idx_laudo_conclusao on laudo_pericial (conclusao);
create index if not exists idx_laudo_reconheceu on laudo_pericial (reconheceu_incapacidade);
create index if not exists idx_laudo_cids on laudo_pericial using gin (cids);

-- ---------------------------------------------------------------------
-- Decisão. Guarda tanto o que saiu nos processos do escritório
-- (origem = acervo_proprio) quanto jurisprudência de referência
-- (origem = jurisprudencia_externa).
-- ---------------------------------------------------------------------
create table if not exists decisao (
  id                 uuid primary key default gen_random_uuid(),
  origem             origem_documento not null default 'acervo_proprio',
  tipo               tipo_documento not null default 'sentenca',
  titulo             text,
  processo_id        uuid references processo (id) on delete set null,
  numero_cnj         text,
  orgao_julgador_id  uuid references orgao_julgador (id) on delete set null,
  magistrado_id      uuid references magistrado (id) on delete set null,
  relator            text,
  tribunal           text,
  instancia          instancia not null default 'primeiro_grau',
  data_decisao       date,
  data_publicacao    date,
  resultado          resultado_julgamento,
  -- Preenchida pelo trigger a partir de resultado + polo quando nula,
  -- mas sobrescrevível: o enum não sabe quem foi o recorrente.
  favoravel          boolean,
  beneficio_id       uuid references beneficio (id) on delete set null,
  -- Nível de autoridade no padrão usado pela pesquisa jurisprudencial:
  -- A vinculante forte, B precedente qualificado, C órgão de cúpula,
  -- D orientativo, E editorial.
  nivel_autoridade   char(1) check (nivel_autoridade in ('A','B','C','D','E')),
  ementa             text,
  dispositivo        text,
  texto_integral     text,
  fonte              text,
  url_fonte          text,
  tags               text[] not null default '{}',
  observacoes        text,
  tsv                tsvector,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_decisao_origem on decisao (origem);
create index if not exists idx_decisao_tipo on decisao (tipo);
create index if not exists idx_decisao_resultado on decisao (resultado);
create index if not exists idx_decisao_favoravel on decisao (favoravel);
create index if not exists idx_decisao_processo on decisao (processo_id);
create index if not exists idx_decisao_orgao on decisao (orgao_julgador_id);
create index if not exists idx_decisao_magistrado on decisao (magistrado_id);
create index if not exists idx_decisao_beneficio on decisao (beneficio_id);
create index if not exists idx_decisao_data on decisao (data_decisao desc);
create index if not exists idx_decisao_tags on decisao using gin (tags);

-- ---------------------------------------------------------------------
-- Preenche favoravel quando o cadastro não informou, usando o polo do
-- processo (ativo por padrão para jurisprudência solta).
-- ---------------------------------------------------------------------
create or replace function tg_decisao_favoravel()
returns trigger
language plpgsql
as $$
declare
  p polo := 'ativo';
begin
  if new.favoravel is null and new.resultado is not null then
    if new.processo_id is not null then
      select polo_escritorio into p from processo where id = new.processo_id;
    end if;
    new.favoravel := resultado_e_favoravel(new.resultado, coalesce(p, 'ativo'));
  end if;
  return new;
end;
$$;

drop trigger if exists set_favoravel on decisao;
create trigger set_favoravel
  before insert or update of resultado, processo_id on decisao
  for each row execute function tg_decisao_favoravel();

-- ---------------------------------------------------------------------
-- Peça: o acervo de modelos e petições já produzidos.
-- ---------------------------------------------------------------------
create table if not exists peca (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  tipo          tipo_peca not null default 'peticao_inicial',
  processo_id   uuid references processo (id) on delete set null,
  beneficio_id  uuid references beneficio (id) on delete set null,
  autor         text,                      -- quem redigiu
  data_peca     date,
  modelo        boolean not null default false,  -- serve de template?
  resumo        text,
  texto         text,
  tags          text[] not null default '{}',
  observacoes   text,
  tsv           tsvector,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_peca_tipo on peca (tipo);
create index if not exists idx_peca_modelo on peca (modelo);
create index if not exists idx_peca_processo on peca (processo_id);
create index if not exists idx_peca_beneficio on peca (beneficio_id);
create index if not exists idx_peca_data on peca (data_peca desc);
create index if not exists idx_peca_tags on peca using gin (tags);

-- ---------------------------------------------------------------------
-- Vínculos n:n com teses
-- ---------------------------------------------------------------------
create table if not exists decisao_tese (
  decisao_id  uuid not null references decisao (id) on delete cascade,
  tese_id     uuid not null references tese (id) on delete cascade,
  -- A decisão acolheu a tese? Permite medir aceitação, não só menção.
  acolhida    boolean,
  primary key (decisao_id, tese_id)
);

create index if not exists idx_decisao_tese_tese on decisao_tese (tese_id);

create table if not exists peca_tese (
  peca_id  uuid not null references peca (id) on delete cascade,
  tese_id  uuid not null references tese (id) on delete cascade,
  primary key (peca_id, tese_id)
);

create index if not exists idx_peca_tese_tese on peca_tese (tese_id);

-- ---------------------------------------------------------------------
-- Arquivos anexos (PDF do inteiro teor, DOCX da peça, laudo digitalizado).
-- Guarda só o ponteiro; o binário fica no disco ou no bucket.
-- ---------------------------------------------------------------------
create table if not exists arquivo (
  id            uuid primary key default gen_random_uuid(),
  entidade      text not null check (entidade in ('decisao', 'peca', 'laudo_pericial', 'processo')),
  entidade_id   uuid not null,
  nome          text not null,
  mime          text,
  tamanho_bytes bigint,
  storage_path  text not null,
  sha256        text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_arquivo_entidade on arquivo (entidade, entidade_id);
create index if not exists idx_arquivo_sha on arquivo (sha256);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['processo', 'laudo_pericial', 'decisao', 'peca']
  loop
    execute format(
      'drop trigger if exists set_updated_at on %I;
       create trigger set_updated_at before update on %I
         for each row execute function tg_set_updated_at();', t, t);
  end loop;
end $$;

insert into schema_migrations (versao) values ('0003_acervo.sql')
  on conflict (versao) do nothing;


-- =====================================================================
-- 0004_busca.sql
-- =====================================================================
-- =====================================================================
-- 0004_busca.sql — busca full-text em português
-- =====================================================================
-- O tsvector é montado por trigger (e não por coluna gerada) porque
-- unaccent() não é IMMUTABLE. Pesos:
--   A título/ementa   B dispositivo/resumo + tags
--   C texto integral  D metadados soltos (relator, tribunal, fonte)
-- =====================================================================

create or replace function tg_decisao_tsv()
returns trigger
language plpgsql
as $$
begin
  new.tsv :=
      setweight(to_tsvector('portuguese', f_unaccent(coalesce(new.titulo, ''))), 'A')
   || setweight(to_tsvector('portuguese', f_unaccent(coalesce(new.ementa, ''))), 'A')
   || setweight(to_tsvector('portuguese', f_unaccent(coalesce(new.dispositivo, ''))), 'B')
   || setweight(to_tsvector('portuguese', f_unaccent(array_to_string(new.tags, ' '))), 'B')
   || setweight(to_tsvector('portuguese', f_unaccent(coalesce(new.texto_integral, ''))), 'C')
   || setweight(to_tsvector('portuguese', f_unaccent(
        concat_ws(' ', new.relator, new.tribunal, new.fonte, new.numero_cnj))), 'D');
  return new;
end;
$$;

drop trigger if exists set_tsv on decisao;
create trigger set_tsv
  before insert or update of titulo, ementa, dispositivo, tags, texto_integral,
                             relator, tribunal, fonte, numero_cnj
  on decisao
  for each row execute function tg_decisao_tsv();

create index if not exists idx_decisao_tsv on decisao using gin (tsv);

-- ---------------------------------------------------------------------

create or replace function tg_peca_tsv()
returns trigger
language plpgsql
as $$
begin
  new.tsv :=
      setweight(to_tsvector('portuguese', f_unaccent(coalesce(new.titulo, ''))), 'A')
   || setweight(to_tsvector('portuguese', f_unaccent(coalesce(new.resumo, ''))), 'B')
   || setweight(to_tsvector('portuguese', f_unaccent(array_to_string(new.tags, ' '))), 'B')
   || setweight(to_tsvector('portuguese', f_unaccent(coalesce(new.texto, ''))), 'C')
   || setweight(to_tsvector('portuguese', f_unaccent(coalesce(new.autor, ''))), 'D');
  return new;
end;
$$;

drop trigger if exists set_tsv on peca;
create trigger set_tsv
  before insert or update of titulo, resumo, tags, texto, autor
  on peca
  for each row execute function tg_peca_tsv();

create index if not exists idx_peca_tsv on peca using gin (tsv);

-- ---------------------------------------------------------------------
-- Converte o texto digitado na barra de busca em tsquery.
-- Aceita a sintaxe do websearch ("aspas", -exclusão, or) e devolve
-- NULL para busca vazia, o que deixa o filtro inerte na query.
-- ---------------------------------------------------------------------
create or replace function busca_tsquery(termo text)
returns tsquery
language sql
stable
parallel safe
as $$
  select case
    when coalesce(trim(termo), '') = '' then null
    else websearch_to_tsquery('portuguese', f_unaccent(termo))
  end;
$$;

-- ---------------------------------------------------------------------
-- Reindexa o acervo já existente (no-op em base recém-criada, útil
-- depois de importação em massa feita por COPY).
-- ---------------------------------------------------------------------
create or replace function reindexar_busca()
returns void
language plpgsql
as $$
begin
  update decisao set titulo = titulo;
  update peca set titulo = titulo;
end;
$$;

insert into schema_migrations (versao) values ('0004_busca.sql')
  on conflict (versao) do nothing;


-- =====================================================================
-- 0005_analytics.sql
-- =====================================================================
-- =====================================================================
-- 0005_analytics.sql — padrões judiciais
-- =====================================================================
-- Duas views-base alimentam todo o resto:
--   vw_decisao_acervo   1 linha por decisão própria com desfecho
--   vw_laudo_decisao    1 linha por par (laudo, decisão) do mesmo processo
-- As agregações usam `ultima_do_processo` para não contar o mesmo caso
-- duas vezes quando há sentença e acórdão.
-- =====================================================================

create or replace view vw_decisao_acervo as
select
  d.id                as decisao_id,
  d.processo_id,
  d.titulo,
  d.tipo,
  d.instancia,
  d.data_decisao,
  d.resultado,
  d.favoravel,
  coalesce(d.orgao_julgador_id, p.orgao_julgador_id) as orgao_julgador_id,
  o.nome              as orgao_nome,
  o.tribunal,
  o.uf                as orgao_uf,
  coalesce(d.magistrado_id, p.magistrado_id)         as magistrado_id,
  m.nome              as magistrado_nome,
  coalesce(d.beneficio_id, p.beneficio_id)           as beneficio_id,
  b.codigo            as beneficio_codigo,
  b.nome              as beneficio_nome,
  p.numero_cnj,
  p.cliente_nome,
  p.uf                as processo_uf,
  -- Decisões avulsas (sem processo vinculado) valem por si.
  case
    when d.processo_id is null then true
    else row_number() over (
           partition by d.processo_id
           order by d.data_decisao desc nulls last, d.created_at desc
         ) = 1
  end as ultima_do_processo
from decisao d
left join processo p        on p.id = d.processo_id
left join orgao_julgador o  on o.id = coalesce(d.orgao_julgador_id, p.orgao_julgador_id)
left join magistrado m      on m.id = coalesce(d.magistrado_id, p.magistrado_id)
left join beneficio b       on b.id = coalesce(d.beneficio_id, p.beneficio_id)
where d.origem = 'acervo_proprio'
  and d.resultado is not null;

-- ---------------------------------------------------------------------

create or replace view vw_laudo_decisao as
select
  l.id                       as laudo_id,
  l.processo_id,
  l.perito_id,
  pe.nome                    as perito_nome,
  pe.tipo                    as perito_tipo,
  pe.especialidade,
  pe.uf                      as perito_uf,
  l.conclusao,
  l.reconheceu_incapacidade,
  l.data_laudo,
  l.cid_principal,
  v.decisao_id,
  v.tipo                     as decisao_tipo,
  v.instancia,
  v.data_decisao,
  v.resultado,
  v.favoravel,
  v.ultima_do_processo,
  v.orgao_julgador_id,
  v.orgao_nome,
  v.magistrado_id,
  v.magistrado_nome,
  v.beneficio_id,
  v.beneficio_codigo,
  v.beneficio_nome
from laudo_pericial l
join vw_decisao_acervo v on v.processo_id = l.processo_id
left join perito pe      on pe.id = l.perito_id;

-- =====================================================================
-- A pergunta central: o que o juízo decide depois de cada tipo de
-- conclusão pericial. Cruzamento global.
-- =====================================================================
create or replace view vw_conclusao_x_resultado as
select
  conclusao,
  reconheceu_incapacidade,
  count(*)                                              as total,
  count(*) filter (where favoravel)                     as favoraveis,
  count(*) filter (where not favoravel)                 as desfavoraveis,
  round(100.0 * count(*) filter (where favoravel) / nullif(count(*), 0), 1) as taxa_exito
from vw_laudo_decisao
where ultima_do_processo
  and perito_tipo = 'judicial'
group by conclusao, reconheceu_incapacidade
order by total desc;

-- =====================================================================
-- Desempenho por perito. Responde "quantas sentenças favoráveis saíram
-- nos casos em que o perito X reconheceu incapacidade".
-- =====================================================================
create or replace view vw_perito_desempenho as
select
  pe.id                          as perito_id,
  pe.nome                        as perito_nome,
  pe.tipo                        as perito_tipo,
  pe.especialidade,
  pe.uf,
  count(v.laudo_id)                                                     as total_casos,
  count(v.laudo_id) filter (where v.reconheceu_incapacidade)            as laudos_com_incapacidade,
  count(v.laudo_id) filter (where not v.reconheceu_incapacidade)        as laudos_sem_incapacidade,
  round(100.0 * count(v.laudo_id) filter (where v.reconheceu_incapacidade)
        / nullif(count(v.laudo_id), 0), 1)                              as taxa_reconhecimento,
  count(v.laudo_id) filter (where v.favoravel)                          as decisoes_favoraveis,
  round(100.0 * count(v.laudo_id) filter (where v.favoravel)
        / nullif(count(v.laudo_id), 0), 1)                              as taxa_exito_geral,
  -- Os dois recortes que importam na prática:
  count(v.laudo_id) filter (where v.reconheceu_incapacidade and v.favoravel) as favoraveis_com_incapacidade,
  round(100.0 * count(v.laudo_id) filter (where v.reconheceu_incapacidade and v.favoravel)
        / nullif(count(v.laudo_id) filter (where v.reconheceu_incapacidade), 0), 1)
                                                                        as taxa_exito_com_incapacidade,
  count(v.laudo_id) filter (where not v.reconheceu_incapacidade and v.favoravel) as favoraveis_sem_incapacidade,
  round(100.0 * count(v.laudo_id) filter (where not v.reconheceu_incapacidade and v.favoravel)
        / nullif(count(v.laudo_id) filter (where not v.reconheceu_incapacidade), 0), 1)
                                                                        as taxa_exito_sem_incapacidade,
  max(v.data_decisao)                                                   as ultima_decisao
from perito pe
left join vw_laudo_decisao v
       on v.perito_id = pe.id
      and v.ultima_do_processo
group by pe.id, pe.nome, pe.tipo, pe.especialidade, pe.uf;

-- Cruzamento perito × conclusão, para ver se um perito específico
-- destoa do padrão geral em algum tipo de conclusão.
create or replace view vw_perito_x_conclusao as
select
  perito_id,
  perito_nome,
  conclusao,
  count(*)                                              as total,
  count(*) filter (where favoravel)                     as favoraveis,
  round(100.0 * count(*) filter (where favoravel) / nullif(count(*), 0), 1) as taxa_exito
from vw_laudo_decisao
where ultima_do_processo
  and perito_id is not null
group by perito_id, perito_nome, conclusao;

-- =====================================================================
-- Desempenho por órgão julgador, magistrado e benefício
-- =====================================================================
create or replace view vw_orgao_desempenho as
select
  orgao_julgador_id,
  orgao_nome,
  tribunal,
  orgao_uf,
  count(*)                                              as total,
  count(*) filter (where favoravel)                     as favoraveis,
  round(100.0 * count(*) filter (where favoravel) / nullif(count(*), 0), 1) as taxa_exito,
  max(data_decisao)                                     as ultima_decisao
from vw_decisao_acervo
where ultima_do_processo
  and orgao_julgador_id is not null
group by orgao_julgador_id, orgao_nome, tribunal, orgao_uf;

create or replace view vw_magistrado_desempenho as
select
  magistrado_id,
  magistrado_nome,
  count(*)                                              as total,
  count(*) filter (where favoravel)                     as favoraveis,
  round(100.0 * count(*) filter (where favoravel) / nullif(count(*), 0), 1) as taxa_exito,
  max(data_decisao)                                     as ultima_decisao
from vw_decisao_acervo
where ultima_do_processo
  and magistrado_id is not null
group by magistrado_id, magistrado_nome;

create or replace view vw_beneficio_desempenho as
select
  beneficio_id,
  beneficio_codigo,
  beneficio_nome,
  count(*)                                              as total,
  count(*) filter (where favoravel)                     as favoraveis,
  round(100.0 * count(*) filter (where favoravel) / nullif(count(*), 0), 1) as taxa_exito
from vw_decisao_acervo
where ultima_do_processo
  and beneficio_id is not null
group by beneficio_id, beneficio_codigo, beneficio_nome;

-- =====================================================================
-- Desempenho por tese: com que frequência a tese é acolhida e qual o
-- desfecho das decisões em que ela foi suscitada.
-- =====================================================================
create or replace view vw_tese_desempenho as
select
  t.id                                                    as tese_id,
  t.nome                                                  as tese_nome,
  t.ramo,
  count(v.decisao_id)                                     as total,
  count(v.decisao_id) filter (where v.favoravel)          as favoraveis,
  round(100.0 * count(v.decisao_id) filter (where v.favoravel)
        / nullif(count(v.decisao_id), 0), 1)              as taxa_exito,
  count(dt.decisao_id) filter (where dt.acolhida)                 as vezes_acolhida,
  count(dt.decisao_id) filter (where dt.acolhida is not null)     as vezes_avaliada,
  round(100.0 * count(dt.decisao_id) filter (where dt.acolhida)
        / nullif(count(dt.decisao_id) filter (where dt.acolhida is not null), 0), 1) as taxa_acolhimento,
  (select count(*) from peca_tese pt where pt.tese_id = t.id) as pecas_vinculadas
from tese t
left join decisao_tese dt      on dt.tese_id = t.id
left join vw_decisao_acervo v  on v.decisao_id = dt.decisao_id and v.ultima_do_processo
group by t.id, t.nome, t.ramo;

-- =====================================================================
-- Números de capa do painel inicial
-- =====================================================================
create or replace view vw_acervo_resumo as
select
  (select count(*) from decisao where origem = 'acervo_proprio')          as decisoes_proprias,
  (select count(*) from decisao where origem = 'jurisprudencia_externa')  as jurisprudencia_externa,
  (select count(*) from peca)                                             as pecas,
  (select count(*) from peca where modelo)                                as pecas_modelo,
  (select count(*) from processo)                                         as processos,
  (select count(*) from laudo_pericial)                                   as laudos,
  (select count(*) from perito)                                           as peritos,
  (select count(*) from tese)                                             as teses,
  (select count(*) from vw_decisao_acervo where ultima_do_processo)       as casos_julgados,
  (select count(*) from vw_decisao_acervo where ultima_do_processo and favoravel) as casos_favoraveis,
  (select round(100.0 * count(*) filter (where favoravel) / nullif(count(*), 0), 1)
     from vw_decisao_acervo where ultima_do_processo)                     as taxa_exito_geral;

-- Evolução mensal do índice de êxito, para ver tendência.
create or replace view vw_exito_mensal as
select
  date_trunc('month', data_decisao)::date               as mes,
  count(*)                                              as total,
  count(*) filter (where favoravel)                     as favoraveis,
  round(100.0 * count(*) filter (where favoravel) / nullif(count(*), 0), 1) as taxa_exito
from vw_decisao_acervo
where ultima_do_processo
  and data_decisao is not null
group by 1
order by 1;

insert into schema_migrations (versao) values ('0005_analytics.sql')
  on conflict (versao) do nothing;


-- =====================================================================
-- 0006_busca_acentos.sql
-- =====================================================================
-- =====================================================================
-- 0006_busca_acentos.sql — configuração de busca "portugues_sem_acento"
-- =====================================================================
-- Antes, a normalização era feita chamando f_unaccent() sobre o texto
-- antes de indexar. Isso funcionava para encontrar, mas estragava o
-- trecho destacado na tela: o ts_headline recebia o texto já sem acentos
-- e devolvia "pericia", "concessao", "beneficio".
--
-- A solução correta é colocar o unaccent na cadeia de dicionários da
-- própria configuração de busca. Assim a normalização acontece na
-- tokenização, e tanto o índice quanto o ts_headline passam a trabalhar
-- sobre o texto original, com acentos preservados na exibição.
-- =====================================================================

do $$
declare
  esquema_unaccent text;
begin
  if not exists (
    select 1 from pg_ts_config where cfgname = 'portugues_sem_acento'
  ) then
    execute 'create text search configuration portugues_sem_acento (copy = portuguese)';
  end if;

  -- No Supabase as extensões ficam no schema "extensions"; em Postgres
  -- comum, em "public". Descobrimos onde o dicionário foi criado.
  select n.nspname into esquema_unaccent
  from pg_ts_dict d
  join pg_namespace n on n.oid = d.dictnamespace
  where d.dictname = 'unaccent'
  limit 1;

  if esquema_unaccent is null then
    raise exception 'Dicionário unaccent não encontrado. Rode: create extension unaccent;';
  end if;

  execute format(
    'alter text search configuration portugues_sem_acento
       alter mapping for hword, hword_part, word
       with %I.unaccent, portuguese_stem', esquema_unaccent);
end $$;

-- ---------------------------------------------------------------------
-- Triggers de indexação: agora sobre o texto original.
-- ---------------------------------------------------------------------

create or replace function tg_decisao_tsv()
returns trigger
language plpgsql
as $$
begin
  new.tsv :=
      setweight(to_tsvector('portugues_sem_acento', coalesce(new.titulo, '')), 'A')
   || setweight(to_tsvector('portugues_sem_acento', coalesce(new.ementa, '')), 'A')
   || setweight(to_tsvector('portugues_sem_acento', coalesce(new.dispositivo, '')), 'B')
   || setweight(to_tsvector('portugues_sem_acento', array_to_string(new.tags, ' ')), 'B')
   || setweight(to_tsvector('portugues_sem_acento', coalesce(new.texto_integral, '')), 'C')
   || setweight(to_tsvector('portugues_sem_acento',
        concat_ws(' ', new.relator, new.tribunal, new.fonte, new.numero_cnj)), 'D');
  return new;
end;
$$;

create or replace function tg_peca_tsv()
returns trigger
language plpgsql
as $$
begin
  new.tsv :=
      setweight(to_tsvector('portugues_sem_acento', coalesce(new.titulo, '')), 'A')
   || setweight(to_tsvector('portugues_sem_acento', coalesce(new.resumo, '')), 'B')
   || setweight(to_tsvector('portugues_sem_acento', array_to_string(new.tags, ' ')), 'B')
   || setweight(to_tsvector('portugues_sem_acento', coalesce(new.texto, '')), 'C')
   || setweight(to_tsvector('portugues_sem_acento', coalesce(new.autor, '')), 'D');
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- A consulta usa a mesma configuração, então "pericia" e "perícia"
-- geram exatamente o mesmo tsquery.
-- ---------------------------------------------------------------------
create or replace function busca_tsquery(termo text)
returns tsquery
language sql
stable
parallel safe
as $$
  select case
    when coalesce(trim(termo), '') = '' then null
    else websearch_to_tsquery('portugues_sem_acento', termo)
  end;
$$;

-- Reindexa o que já estava gravado com a configuração antiga.
select reindexar_busca();

insert into schema_migrations (versao) values ('0006_busca_acentos.sql')
  on conflict (versao) do nothing;


-- =====================================================================
-- 0007_ingestao.sql
-- =====================================================================
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

insert into schema_migrations (versao) values ('0007_ingestao.sql')
  on conflict (versao) do nothing;


-- =====================================================================
-- 0008_estatistica_confiavel.sql
-- =====================================================================
-- =====================================================================
-- 0008_estatistica_confiavel.sql
-- =====================================================================
-- Com a entrada automática de dados, a conclusão pericial passa a poder
-- vir de extração de texto — que erra. Um laudo classificado errado como
-- "sem incapacidade" contamina exatamente o número que o escritório usa
-- para decidir estratégia.
--
-- Regra adotada: laudo com origem 'extraido_automatico' só entra nas
-- estatísticas depois de revisado. Antes disso ele existe, é visível e
-- pesquisável, mas fica fora das contas.
-- =====================================================================

-- vw_laudo_decisao ganha a coluna `confirmado` no fim (CREATE OR REPLACE
-- permite acrescentar colunas ao final sem derrubar as views dependentes).
create or replace view vw_laudo_decisao as
select
  l.id                       as laudo_id,
  l.processo_id,
  l.perito_id,
  pe.nome                    as perito_nome,
  pe.tipo                    as perito_tipo,
  pe.especialidade,
  pe.uf                      as perito_uf,
  l.conclusao,
  l.reconheceu_incapacidade,
  l.data_laudo,
  l.cid_principal,
  v.decisao_id,
  v.tipo                     as decisao_tipo,
  v.instancia,
  v.data_decisao,
  v.resultado,
  v.favoravel,
  v.ultima_do_processo,
  v.orgao_julgador_id,
  v.orgao_nome,
  v.magistrado_id,
  v.magistrado_nome,
  v.beneficio_id,
  v.beneficio_codigo,
  v.beneficio_nome,
  -- Dado conferido por pessoa, ou vindo de campo estruturado.
  (l.origem_dado <> 'extraido_automatico' or l.revisado_em is not null)
                             as confirmado,
  l.origem_dado,
  l.confianca,
  l.revisado_em
from laudo_pericial l
join vw_decisao_acervo v on v.processo_id = l.processo_id
left join perito pe      on pe.id = l.perito_id;

-- ---------------------------------------------------------------------
-- Agregações: passam a exigir `confirmado`.
-- ---------------------------------------------------------------------

create or replace view vw_conclusao_x_resultado as
select
  conclusao,
  reconheceu_incapacidade,
  count(*)                                              as total,
  count(*) filter (where favoravel)                     as favoraveis,
  count(*) filter (where not favoravel)                 as desfavoraveis,
  round(100.0 * count(*) filter (where favoravel) / nullif(count(*), 0), 1) as taxa_exito
from vw_laudo_decisao
where ultima_do_processo
  and perito_tipo = 'judicial'
  and confirmado
group by conclusao, reconheceu_incapacidade
order by total desc;

create or replace view vw_perito_x_conclusao as
select
  perito_id,
  perito_nome,
  conclusao,
  count(*)                                              as total,
  count(*) filter (where favoravel)                     as favoraveis,
  round(100.0 * count(*) filter (where favoravel) / nullif(count(*), 0), 1) as taxa_exito
from vw_laudo_decisao
where ultima_do_processo
  and perito_id is not null
  and confirmado
group by perito_id, perito_nome, conclusao;

create or replace view vw_perito_desempenho as
select
  pe.id                          as perito_id,
  pe.nome                        as perito_nome,
  pe.tipo                        as perito_tipo,
  pe.especialidade,
  pe.uf,
  count(v.laudo_id)                                                     as total_casos,
  count(v.laudo_id) filter (where v.reconheceu_incapacidade)            as laudos_com_incapacidade,
  count(v.laudo_id) filter (where not v.reconheceu_incapacidade)        as laudos_sem_incapacidade,
  round(100.0 * count(v.laudo_id) filter (where v.reconheceu_incapacidade)
        / nullif(count(v.laudo_id), 0), 1)                              as taxa_reconhecimento,
  count(v.laudo_id) filter (where v.favoravel)                          as decisoes_favoraveis,
  round(100.0 * count(v.laudo_id) filter (where v.favoravel)
        / nullif(count(v.laudo_id), 0), 1)                              as taxa_exito_geral,
  count(v.laudo_id) filter (where v.reconheceu_incapacidade and v.favoravel) as favoraveis_com_incapacidade,
  round(100.0 * count(v.laudo_id) filter (where v.reconheceu_incapacidade and v.favoravel)
        / nullif(count(v.laudo_id) filter (where v.reconheceu_incapacidade), 0), 1)
                                                                        as taxa_exito_com_incapacidade,
  count(v.laudo_id) filter (where not v.reconheceu_incapacidade and v.favoravel) as favoraveis_sem_incapacidade,
  round(100.0 * count(v.laudo_id) filter (where not v.reconheceu_incapacidade and v.favoravel)
        / nullif(count(v.laudo_id) filter (where not v.reconheceu_incapacidade), 0), 1)
                                                                        as taxa_exito_sem_incapacidade,
  max(v.data_decisao)                                                   as ultima_decisao,
  -- Quantos laudos deste perito ainda aguardam conferência.
  (select count(*) from laudo_pericial l2
    where l2.perito_id = pe.id
      and l2.origem_dado = 'extraido_automatico'
      and l2.revisado_em is null)                                       as pendentes_revisao
from perito pe
left join vw_laudo_decisao v
       on v.perito_id = pe.id
      and v.ultima_do_processo
      and v.confirmado
group by pe.id, pe.nome, pe.tipo, pe.especialidade, pe.uf;

-- ---------------------------------------------------------------------
-- Fila de conferência
-- ---------------------------------------------------------------------
create or replace view vw_laudos_pendentes as
select
  l.id                as laudo_id,
  l.processo_id,
  l.conclusao,
  l.reconheceu_incapacidade,
  l.confianca,
  l.trecho_conclusao,
  l.data_laudo,
  l.cid_principal,
  l.documento_externo_id,
  pe.id               as perito_id,
  pe.nome             as perito_nome,
  pe.especialidade,
  p.numero_cnj,
  p.cliente_nome,
  b.codigo            as beneficio_codigo,
  d.nome              as documento_nome,
  length(d.texto)     as tamanho_texto,
  d.via_ocr
from laudo_pericial l
left join perito pe            on pe.id = l.perito_id
left join processo p           on p.id = l.processo_id
left join beneficio b          on b.id = p.beneficio_id
left join documento_externo d  on d.id = l.documento_externo_id
where l.origem_dado = 'extraido_automatico'
  and l.revisado_em is null
order by l.confianca asc nulls first, l.data_laudo desc nulls last;

-- ---------------------------------------------------------------------
-- Números de capa: acrescenta o que veio de fora e o que está pendente.
-- ---------------------------------------------------------------------
create or replace view vw_acervo_resumo as
select
  (select count(*) from decisao where origem = 'acervo_proprio')          as decisoes_proprias,
  (select count(*) from decisao where origem = 'jurisprudencia_externa')  as jurisprudencia_externa,
  (select count(*) from peca)                                             as pecas,
  (select count(*) from peca where modelo)                                as pecas_modelo,
  (select count(*) from processo)                                         as processos,
  (select count(*) from laudo_pericial)                                   as laudos,
  (select count(*) from perito)                                           as peritos,
  (select count(*) from tese)                                             as teses,
  (select count(*) from vw_decisao_acervo where ultima_do_processo)       as casos_julgados,
  (select count(*) from vw_decisao_acervo where ultima_do_processo and favoravel) as casos_favoraveis,
  (select round(100.0 * count(*) filter (where favoravel) / nullif(count(*), 0), 1)
     from vw_decisao_acervo where ultima_do_processo)                     as taxa_exito_geral,
  (select count(*) from vw_laudos_pendentes)                              as laudos_pendentes,
  (select count(*) from publicacao where not lida)                        as publicacoes_nao_lidas,
  (select count(*) from publicacao
    where prazo_fatal is not null and prazo_fatal >= current_date
      and prazo_fatal <= current_date + 7)                                as prazos_proximos,
  (select count(*) from documento_externo)                                as documentos_importados;

insert into schema_migrations (versao) values ('0008_estatistica_confiavel.sql')
  on conflict (versao) do nothing;


-- =====================================================================
-- 0009_decisao_conferida.sql
-- =====================================================================
-- =====================================================================
-- 0009_decisao_conferida.sql
-- =====================================================================
-- Mesma regra já aplicada ao laudo, agora para a decisão: resultado
-- inferido do dispositivo por extração de texto não entra nas contas
-- antes de conferido.
--
-- Aqui o risco é ainda maior que no laudo, porque um "nego provimento"
-- pode ser favorável ou desfavorável dependendo de quem recorreu — algo
-- que o texto do dispositivo, sozinho, nem sempre revela.
-- =====================================================================

-- A conferência muda `origem_dado` de 'extraido_automatico' para
-- 'manual'. Isso dispensa uma coluna `revisado_em` própria na decisão:
-- o próprio campo de origem já registra que houve conferência.
create or replace view vw_decisao_acervo as
select
  d.id                as decisao_id,
  d.processo_id,
  d.titulo,
  d.tipo,
  d.instancia,
  d.data_decisao,
  d.resultado,
  d.favoravel,
  coalesce(d.orgao_julgador_id, p.orgao_julgador_id) as orgao_julgador_id,
  o.nome              as orgao_nome,
  o.tribunal,
  o.uf                as orgao_uf,
  coalesce(d.magistrado_id, p.magistrado_id)         as magistrado_id,
  m.nome              as magistrado_nome,
  coalesce(d.beneficio_id, p.beneficio_id)           as beneficio_id,
  b.codigo            as beneficio_codigo,
  b.nome              as beneficio_nome,
  p.numero_cnj,
  p.cliente_nome,
  p.uf                as processo_uf,
  case
    when d.processo_id is null then true
    else row_number() over (
           partition by d.processo_id
           order by d.data_decisao desc nulls last, d.created_at desc
         ) = 1
  end as ultima_do_processo
from decisao d
left join processo p        on p.id = d.processo_id
left join orgao_julgador o  on o.id = coalesce(d.orgao_julgador_id, p.orgao_julgador_id)
left join magistrado m      on m.id = coalesce(d.magistrado_id, p.magistrado_id)
left join beneficio b       on b.id = coalesce(d.beneficio_id, p.beneficio_id)
where d.origem = 'acervo_proprio'
  and d.resultado is not null
  and d.origem_dado <> 'extraido_automatico';

-- ---------------------------------------------------------------------
-- Fila de conferência de decisões
-- ---------------------------------------------------------------------
create or replace view vw_decisoes_pendentes as
select
  d.id              as decisao_id,
  d.titulo,
  d.tipo,
  d.resultado,
  d.favoravel,
  d.data_decisao,
  d.dispositivo     as trecho_dispositivo,
  d.processo_id,
  p.numero_cnj,
  p.cliente_nome,
  b.codigo          as beneficio_codigo,
  doc.nome          as documento_nome,
  doc.via_ocr
from decisao d
left join processo p          on p.id = d.processo_id
left join beneficio b         on b.id = coalesce(d.beneficio_id, p.beneficio_id)
left join documento_externo doc on doc.id = d.documento_externo_id
where d.origem_dado = 'extraido_automatico'
order by d.data_decisao desc nulls last;

-- ---------------------------------------------------------------------
-- Capa: passa a somar as duas filas de conferência.
-- ---------------------------------------------------------------------
create or replace view vw_acervo_resumo as
select
  (select count(*) from decisao where origem = 'acervo_proprio')          as decisoes_proprias,
  (select count(*) from decisao where origem = 'jurisprudencia_externa')  as jurisprudencia_externa,
  (select count(*) from peca)                                             as pecas,
  (select count(*) from peca where modelo)                                as pecas_modelo,
  (select count(*) from processo)                                         as processos,
  (select count(*) from laudo_pericial)                                   as laudos,
  (select count(*) from perito)                                           as peritos,
  (select count(*) from tese)                                             as teses,
  (select count(*) from vw_decisao_acervo where ultima_do_processo)       as casos_julgados,
  (select count(*) from vw_decisao_acervo where ultima_do_processo and favoravel) as casos_favoraveis,
  (select round(100.0 * count(*) filter (where favoravel) / nullif(count(*), 0), 1)
     from vw_decisao_acervo where ultima_do_processo)                     as taxa_exito_geral,
  (select count(*) from vw_laudos_pendentes)                              as laudos_pendentes,
  (select count(*) from publicacao where not lida)                        as publicacoes_nao_lidas,
  (select count(*) from publicacao
    where prazo_fatal is not null and prazo_fatal >= current_date
      and prazo_fatal <= current_date + 7)                                as prazos_proximos,
  (select count(*) from documento_externo)                                as documentos_importados,
  -- Coluna nova vai no fim: CREATE OR REPLACE VIEW só permite acrescentar
  -- ao final, nunca inserir no meio nem renomear.
  (select count(*) from vw_decisoes_pendentes)                            as decisoes_pendentes;

insert into schema_migrations (versao) values ('0009_decisao_conferida.sql')
  on conflict (versao) do nothing;


-- =====================================================================
-- 0010_autenticacao.sql
-- =====================================================================
-- =====================================================================
-- 0010_autenticacao.sql — usuários e sessões
-- =====================================================================
-- O sistema passa a ser exposto na internet, então o acesso deixa de ser
-- "quem está na rede do escritório" e vira "quem tem credencial".
--
-- A senha é guardada como hash scrypt com sal por usuário. O token de
-- sessão também é guardado em hash: se o banco vazar, os tokens gravados
-- não servem para entrar em conta nenhuma.
-- =====================================================================

do $$ begin
  create type papel_usuario as enum (
    'administrador',   -- gerencia usuários
    'advogado',        -- acesso completo ao acervo
    'colaborador'      -- consulta e conferência, sem gerenciar usuários
  );
exception when duplicate_object then null; end $$;

create table if not exists usuario (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  nome              text not null,
  senha_hash        text not null,
  senha_sal         text not null,
  papel             papel_usuario not null default 'colaborador',
  ativo             boolean not null default true,
  ultimo_acesso     timestamptz,
  -- Trava de força bruta: contagem de erros e bloqueio temporário.
  tentativas_falhas integer not null default 0,
  bloqueado_ate     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- E-mail é comparado sempre em minúsculas.
  constraint usuario_email_key unique (email)
);

create index if not exists idx_usuario_ativo on usuario (ativo);

-- ---------------------------------------------------------------------
-- Sessões. O cookie leva o token em claro; aqui fica só o hash dele.
-- ---------------------------------------------------------------------
create table if not exists sessao (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references usuario (id) on delete cascade,
  token_hash   text not null,
  expira_em    timestamptz not null,
  criada_em    timestamptz not null default now(),
  ultimo_uso   timestamptz not null default now(),
  user_agent   text,
  ip           text,
  constraint sessao_token_hash_key unique (token_hash)
);

create index if not exists idx_sessao_usuario on sessao (usuario_id);
create index if not exists idx_sessao_expira on sessao (expira_em);

-- ---------------------------------------------------------------------
-- Trilha de acesso. Num sistema com dado sensível de saúde, saber quem
-- entrou e quando deixa de ser luxo.
-- ---------------------------------------------------------------------
create table if not exists log_acesso (
  id          bigserial primary key,
  usuario_id  uuid references usuario (id) on delete set null,
  email       text,
  evento      text not null,   -- 'login_ok', 'login_falha', 'logout', 'bloqueio'
  ip          text,
  user_agent  text,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_log_acesso_data on log_acesso (criado_em desc);
create index if not exists idx_log_acesso_usuario on log_acesso (usuario_id);

-- ---------------------------------------------------------------------
-- Limpeza de sessões vencidas. Chamada no login, para não precisar de
-- job agendado.
-- ---------------------------------------------------------------------
create or replace function limpar_sessoes_vencidas()
returns void
language sql
as $$
  delete from sessao where expira_em < now();
$$;

drop trigger if exists set_updated_at on usuario;
create trigger set_updated_at before update on usuario
  for each row execute function tg_set_updated_at();

insert into schema_migrations (versao) values ('0010_autenticacao.sql')
  on conflict (versao) do nothing;


commit;

-- ---------------------------------------------------------------------
-- Conferência: deve listar 10 migrations e as tabelas do sistema.
-- ---------------------------------------------------------------------
select versao, aplicada_em from schema_migrations order by versao;

select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
