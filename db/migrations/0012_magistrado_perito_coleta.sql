-- =====================================================================
-- 0012 — magistrado e perito medidos a partir de sentença coletada
-- =====================================================================
-- Até aqui a coleta do juízo respondia por órgão: "esta vara concede em
-- 34% dos casos". Faltavam as duas perguntas que a ferramenta existe
-- para responder:
--
--   1. Como decide ESTE juiz, e não a vara inteira?
--   2. Quando o perito conclui por incapacidade, o juízo acompanha?
--
-- As duas agora têm resposta, porque a sentença publicada traz as duas
-- coisas no texto: a assinatura no rodapé e o resumo do laudo na
-- fundamentação. Nada disso vem em campo estruturado do DJEN — é lido,
-- e por isso entra marcado como `extraido_automatico`.
--
-- IMPORTANTE, E DELIBERADO
-- As views deste arquivo NÃO exigem conferência humana, ao contrário das
-- do acervo próprio. O motivo é que a natureza do dado é outra: aqui não
-- se afirma nada sobre um cliente, mede-se tendência de uma população de
-- terceiros. Exigir revisão manual de milhares de sentenças coletadas
-- inviabilizaria a medição, e um erro isolado de leitura não muda uma
-- proporção sobre centenas de casos.
--
-- Em compensação, toda tela que usa estes números precisa dizer que são
-- lidos automaticamente. É o que separa uma estimativa honesta de um
-- número que aparenta a mesma autoridade do acervo conferido.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Colunas novas SEMPRE no fim: "create or replace view" recusa mudar a
-- posição ou o nome das existentes.
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
  ) = 1 as ultima_do_processo,
  d.magistrado_id,
  m.nome              as magistrado_nome,
  m.cargo             as magistrado_cargo
from decisao d
join processo p            on p.id = d.processo_id and p.proprio = false
left join orgao_julgador o on o.id = p.orgao_julgador_id
left join magistrado m     on m.id = d.magistrado_id
where d.resultado is not null;

-- ---------------------------------------------------------------------
-- Como decide um magistrado, medido nas sentenças que ele assinou.
--
-- As três últimas colunas são o que interessa numa audiência: não basta
-- saber que o juiz concede em 40% dos casos. Interessa saber o que ele
-- faz quando o laudo é favorável — e, principalmente, se alguma vez
-- concedeu contra laudo negativo, porque é isso que define se vale a
-- pena sustentar condições pessoais.
-- ---------------------------------------------------------------------
create or replace view vw_magistrado_benchmark as
select
  d.magistrado_id,
  d.magistrado_nome,
  d.magistrado_cargo,
  d.orgao_nome,
  d.tribunal,
  count(*)                                                          as total,
  count(*) filter (where d.favoravel)                               as favoraveis,
  round(100.0 * count(*) filter (where d.favoravel)
        / nullif(count(*), 0), 1)                                   as taxa_exito,
  count(l.id) filter (where l.reconheceu_incapacidade)               as laudos_favoraveis,
  count(l.id) filter (where l.reconheceu_incapacidade and d.favoravel)
                                                                     as acompanhou_laudo_favoravel,
  count(l.id) filter (where not l.reconheceu_incapacidade and d.favoravel)
                                                                     as concedeu_contra_laudo,
  min(d.data_decisao)                                               as primeira_decisao,
  max(d.data_decisao)                                               as ultima_decisao
from vw_decisao_benchmark d
left join laudo_pericial l on l.processo_id = d.processo_id
where d.ultima_do_processo
  and d.magistrado_id is not null
group by d.magistrado_id, d.magistrado_nome, d.magistrado_cargo, d.orgao_nome, d.tribunal;

-- ---------------------------------------------------------------------
-- Como um perito conclui, e o que acontece depois.
--
-- A tabela de contingência completa está aqui de propósito. A taxa de
-- reconhecimento sozinha diz pouco: um perito que reconhece em 20% dos
-- casos pode ser rigoroso ou pode estar sendo desmentido pelo juízo com
-- frequência — e são situações opostas para quem decide se impugna.
-- ---------------------------------------------------------------------
create or replace view vw_perito_benchmark as
select
  pe.id                                                             as perito_id,
  pe.nome                                                           as perito_nome,
  pe.especialidade,
  count(*)                                                          as total_casos,
  count(*) filter (where l.reconheceu_incapacidade)                 as reconheceu,
  round(100.0 * count(*) filter (where l.reconheceu_incapacidade)
        / nullif(count(*), 0), 1)                                   as taxa_reconhecimento,
  count(*) filter (where d.favoravel)                               as decisoes_favoraveis,
  round(100.0 * count(*) filter (where d.favoravel)
        / nullif(count(*), 0), 1)                                   as taxa_exito,
  count(*) filter (where l.reconheceu_incapacidade and d.favoravel)         as reconheceu_e_concedido,
  count(*) filter (where l.reconheceu_incapacidade and not d.favoravel)     as reconheceu_e_negado,
  count(*) filter (where not l.reconheceu_incapacidade and d.favoravel)     as negou_e_concedido,
  count(*) filter (where not l.reconheceu_incapacidade and not d.favoravel) as negou_e_negado,
  min(d.data_decisao)                                               as primeira_decisao,
  max(d.data_decisao)                                               as ultima_decisao
from laudo_pericial l
join perito pe               on pe.id = l.perito_id
join vw_decisao_benchmark d  on d.processo_id = l.processo_id and d.ultima_do_processo
where l.conclusao is not null
group by pe.id, pe.nome, pe.especialidade;

-- ---------------------------------------------------------------------
-- Quanto da coleta rendeu magistrado e perícia identificados.
--
-- Serve para saber se a leitura está funcionando naquele tribunal: uma
-- coleta com 400 sentenças e 3 magistrados identificados quer dizer que
-- a assinatura vem em formato que a extração ainda não reconhece.
-- ---------------------------------------------------------------------
create or replace view vw_coleta_cobertura as
select
  count(*)                                                as sentencas,
  count(*) filter (where d.magistrado_id is not null)     as com_magistrado,
  round(100.0 * count(*) filter (where d.magistrado_id is not null)
        / nullif(count(*), 0), 1)                         as pct_magistrado,
  count(l.id)                                             as com_pericia,
  round(100.0 * count(l.id) / nullif(count(*), 0), 1)     as pct_pericia,
  count(l.id) filter (where l.perito_id is not null)      as com_perito_nomeado
from vw_decisao_benchmark d
left join laudo_pericial l on l.processo_id = d.processo_id
where d.ultima_do_processo;
