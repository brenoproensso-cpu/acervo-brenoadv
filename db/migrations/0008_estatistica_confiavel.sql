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
