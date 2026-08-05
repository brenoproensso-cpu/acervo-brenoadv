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
