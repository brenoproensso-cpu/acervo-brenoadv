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
