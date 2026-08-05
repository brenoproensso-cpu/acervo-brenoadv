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
