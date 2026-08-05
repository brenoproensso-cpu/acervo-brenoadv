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
