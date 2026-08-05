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
