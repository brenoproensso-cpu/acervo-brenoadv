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
