-- =====================================================================
-- 0011_benchmark_juizo.sql — medir o juízo, não só o próprio acervo
-- =====================================================================
-- Até aqui o sistema respondia "qual é o MEU índice de êxito". A
-- pergunta que realmente orienta estratégia é outra: "como esta vara
-- decide", e para respondê-la é preciso olhar processos que não são do
-- escritório.
--
-- Isso obriga a separar as duas populações. Misturar destruiria os dois
-- números: o próprio índice ficaria diluído em milhares de casos alheios,
-- e a taxa da vara ficaria enviesada pela atuação do escritório.
-- =====================================================================

alter table processo
  add column if not exists proprio boolean not null default true;

comment on column processo.proprio is
  'true = o escritório atua no processo. false = coletado do DataJud '
  'apenas para medir o comportamento do juízo.';

create index if not exists idx_processo_proprio on processo (proprio);
create index if not exists idx_processo_orgao_proprio
  on processo (orgao_julgador_id, proprio);

-- ---------------------------------------------------------------------
-- O acervo próprio passa a excluir explicitamente os casos de coleta.
-- ---------------------------------------------------------------------
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
  and d.origem_dado <> 'extraido_automatico'
  -- Decisão avulsa (sem processo) continua contando como própria.
  and coalesce(p.proprio, true);

-- ---------------------------------------------------------------------
-- A população de referência: processos de terceiros, coletados para
-- medir a vara.
--
-- O resultado destes vem do código de movimento da Tabela Processual
-- Unificada — dado estruturado do CNJ, não extração de texto. Por isso
-- entram nas contas sem passar por conferência humana.
-- ---------------------------------------------------------------------
create or replace view vw_decisao_benchmark as
select
  d.id                as decisao_id,
  d.processo_id,
  d.tipo,
  d.instancia,
  d.data_decisao,
  d.resultado,
  d.favoravel,
  p.orgao_julgador_id,
  o.nome              as orgao_nome,
  o.tribunal,
  o.uf                as orgao_uf,
  p.classe_cnj,
  p.assuntos,
  p.numero_cnj,
  row_number() over (
    partition by d.processo_id
    order by d.data_decisao desc nulls last, d.created_at desc
  ) = 1 as ultima_do_processo
from decisao d
join processo p            on p.id = d.processo_id and p.proprio = false
left join orgao_julgador o on o.id = p.orgao_julgador_id
where d.resultado is not null;

-- ---------------------------------------------------------------------
-- Comportamento do juízo: a taxa da vara ao lado da taxa do escritório.
--
-- É a comparação que orienta decisão prática — saber que a vara concede
-- em 34% dos casos muda a leitura de um índice próprio de 52%.
-- ---------------------------------------------------------------------
create or replace view vw_juizo_comparativo as
with proprio as (
  select
    orgao_julgador_id,
    count(*)                          as casos_proprios,
    count(*) filter (where favoravel) as favoraveis_proprios
  from vw_decisao_acervo
  where ultima_do_processo and orgao_julgador_id is not null
  group by orgao_julgador_id
),
geral as (
  select
    orgao_julgador_id,
    count(*)                          as casos_juizo,
    count(*) filter (where favoravel) as favoraveis_juizo,
    min(data_decisao)                 as primeira_decisao,
    max(data_decisao)                 as ultima_decisao
  from vw_decisao_benchmark
  where ultima_do_processo and orgao_julgador_id is not null
  group by orgao_julgador_id
)
select
  o.id                as orgao_julgador_id,
  o.nome              as orgao_nome,
  o.tribunal,
  o.uf,
  coalesce(g.casos_juizo, 0)          as casos_juizo,
  coalesce(g.favoraveis_juizo, 0)     as favoraveis_juizo,
  round(100.0 * g.favoraveis_juizo / nullif(g.casos_juizo, 0), 1) as taxa_juizo,
  coalesce(pr.casos_proprios, 0)      as casos_proprios,
  coalesce(pr.favoraveis_proprios, 0) as favoraveis_proprios,
  round(100.0 * pr.favoraveis_proprios / nullif(pr.casos_proprios, 0), 1) as taxa_propria,
  -- Positivo significa que o escritório vai melhor que a média do juízo.
  round(
    100.0 * pr.favoraveis_proprios / nullif(pr.casos_proprios, 0)
    - 100.0 * g.favoraveis_juizo / nullif(g.casos_juizo, 0), 1)          as diferenca,
  g.primeira_decisao,
  g.ultima_decisao
from orgao_julgador o
left join geral g   on g.orgao_julgador_id = o.id
left join proprio pr on pr.orgao_julgador_id = o.id
where coalesce(g.casos_juizo, 0) > 0 or coalesce(pr.casos_proprios, 0) > 0
order by coalesce(g.casos_juizo, 0) + coalesce(pr.casos_proprios, 0) desc;

-- ---------------------------------------------------------------------
-- Distribuição de desfechos da vara, por classe processual.
-- ---------------------------------------------------------------------
create or replace view vw_juizo_por_classe as
select
  orgao_julgador_id,
  orgao_nome,
  coalesce(classe_cnj, 'não informada') as classe_cnj,
  count(*)                              as total,
  count(*) filter (where favoravel)     as favoraveis,
  round(100.0 * count(*) filter (where favoravel) / nullif(count(*), 0), 1) as taxa,
  min(data_decisao)                     as de,
  max(data_decisao)                     as ate
from vw_decisao_benchmark
where ultima_do_processo and orgao_julgador_id is not null
group by orgao_julgador_id, orgao_nome, coalesce(classe_cnj, 'não informada');

-- ---------------------------------------------------------------------
-- Capa: acrescenta o volume da coleta externa.
-- ---------------------------------------------------------------------
create or replace view vw_acervo_resumo as
select
  (select count(*) from decisao where origem = 'acervo_proprio')          as decisoes_proprias,
  (select count(*) from decisao where origem = 'jurisprudencia_externa')  as jurisprudencia_externa,
  (select count(*) from peca)                                             as pecas,
  (select count(*) from peca where modelo)                                as pecas_modelo,
  (select count(*) from processo where proprio)                           as processos,
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
  (select count(*) from vw_decisoes_pendentes)                            as decisoes_pendentes,
  (select count(*) from processo where not proprio)                       as processos_benchmark,
  (select count(*) from vw_decisao_benchmark where ultima_do_processo)    as decisoes_benchmark;
