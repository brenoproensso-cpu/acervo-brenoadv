import { consultar, consultarUm, Filtros } from "./db";

export const POR_PAGINA = 20;

// =====================================================================
// Catálogos (para os selects dos formulários e filtros)
// =====================================================================

export type Opcao = { id: string; texto: string };

export const catalogos = {
  beneficios: () =>
    consultar<Opcao>(
      "select id, codigo || ' — ' || nome as texto from beneficio order by codigo",
    ),
  orgaos: () =>
    consultar<Opcao>("select id, nome as texto from orgao_julgador order by nome"),
  magistrados: () =>
    consultar<Opcao>("select id, nome as texto from magistrado order by nome"),
  teses: () => consultar<Opcao>("select id, nome as texto from tese order by nome"),
  peritos: () =>
    consultar<Opcao>(
      "select id, nome || ' (' || coalesce(especialidade, 'sem especialidade') || ')' as texto from perito order by nome",
    ),
  processos: () =>
    consultar<Opcao>(
      `select id, coalesce(numero_cnj, 'sem número') || ' — ' || coalesce(cliente_nome, 's/ cliente') as texto
       from processo order by data_distribuicao desc nulls last limit 300`,
    ),
};

// =====================================================================
// Painel inicial
// =====================================================================

export type Resumo = {
  decisoes_proprias: string;
  jurisprudencia_externa: string;
  pecas: string;
  pecas_modelo: string;
  processos: string;
  laudos: string;
  peritos: string;
  teses: string;
  casos_julgados: string;
  casos_favoraveis: string;
  taxa_exito_geral: string | null;
  laudos_pendentes: string;
  publicacoes_nao_lidas: string;
  prazos_proximos: string;
  documentos_importados: string;
  decisoes_pendentes: string;
};

export const resumo = () => consultarUm<Resumo>("select * from vw_acervo_resumo");

export const exitoMensal = () =>
  consultar(
    `select mes, total, favoraveis, taxa_exito
     from vw_exito_mensal
     where mes >= (current_date - interval '24 months')
     order by mes`,
  );

// =====================================================================
// Padrões judiciais
// =====================================================================

export const conclusaoXResultado = () =>
  consultar(
    `select conclusao, reconheceu_incapacidade, total, favoraveis, desfavoraveis, taxa_exito
     from vw_conclusao_x_resultado
     order by reconheceu_incapacidade desc nulls last, total desc`,
  );

/** Consolidado de cada conclusão pericial agrupado em "reconheceu" x "não". */
export const incapacidadeXExito = () =>
  consultar(
    `select
       reconheceu_incapacidade,
       sum(total)      as total,
       sum(favoraveis) as favoraveis,
       round(100.0 * sum(favoraveis) / nullif(sum(total), 0), 1) as taxa_exito
     from vw_conclusao_x_resultado
     where reconheceu_incapacidade is not null
     group by reconheceu_incapacidade
     order by reconheceu_incapacidade desc`,
  );

export const peritoDesempenho = (apenasComCasos = true) =>
  consultar(
    `select * from vw_perito_desempenho
     ${apenasComCasos ? "where total_casos > 0" : ""}
     order by total_casos desc, perito_nome`,
  );

export const orgaoDesempenho = () =>
  consultar(
    "select * from vw_orgao_desempenho order by total desc, orgao_nome",
  );

export const magistradoDesempenho = () =>
  consultar(
    "select * from vw_magistrado_desempenho order by total desc, magistrado_nome",
  );

export const beneficioDesempenho = () =>
  consultar(
    "select * from vw_beneficio_desempenho order by total desc, beneficio_codigo",
  );

export const teseDesempenho = () =>
  consultar(
    "select * from vw_tese_desempenho where total > 0 or pecas_vinculadas > 0 order by total desc, tese_nome",
  );

// =====================================================================
// Perito
// =====================================================================

export const perito = (id: string) =>
  consultarUm(
    `select p.*, d.total_casos, d.laudos_com_incapacidade, d.taxa_reconhecimento,
            d.decisoes_favoraveis, d.taxa_exito_geral,
            d.favoraveis_com_incapacidade, d.taxa_exito_com_incapacidade,
            d.favoraveis_sem_incapacidade, d.taxa_exito_sem_incapacidade,
            d.ultima_decisao
     from perito p
     left join vw_perito_desempenho d on d.perito_id = p.id
     where p.id = $1`,
    [id],
  );

export const peritoPorConclusao = (id: string) =>
  consultar(
    `select conclusao, total, favoraveis, taxa_exito
     from vw_perito_x_conclusao where perito_id = $1 order by total desc`,
    [id],
  );

export const peritoCasos = (id: string) =>
  consultar(
    `select v.laudo_id, v.decisao_id, v.processo_id, v.conclusao, v.reconheceu_incapacidade,
            v.data_laudo, v.data_decisao, v.resultado, v.favoravel, v.decisao_tipo,
            v.orgao_nome, v.magistrado_nome, v.beneficio_codigo,
            p.numero_cnj, p.cliente_nome
     from vw_laudo_decisao v
     join processo p on p.id = v.processo_id
     where v.perito_id = $1 and v.ultima_do_processo
     order by v.data_decisao desc nulls last
     limit 200`,
    [id],
  );

export const listarPeritos = () =>
  consultar(
    `select p.id, p.nome, p.tipo, p.especialidade, p.uf, p.observacoes,
            coalesce(d.total_casos, 0) as total_casos,
            d.taxa_reconhecimento, d.taxa_exito_geral,
            d.taxa_exito_com_incapacidade, d.taxa_exito_sem_incapacidade
     from perito p
     left join vw_perito_desempenho d on d.perito_id = p.id
     order by coalesce(d.total_casos, 0) desc, p.nome`,
  );

// =====================================================================
// Decisões
// =====================================================================

export type FiltroDecisao = {
  q?: string;
  origem?: string;
  tipo?: string;
  resultado?: string;
  beneficio?: string;
  orgao?: string;
  favoravel?: string;
  pagina?: number;
};

export async function listarDecisoes(f: FiltroDecisao) {
  const pagina = Math.max(1, f.pagina ?? 1);
  const filtros = new Filtros();

  filtros.add("d.origem = ?::origem_documento", f.origem);
  filtros.add("d.tipo = ?::tipo_documento", f.tipo);
  filtros.add("d.resultado = ?::resultado_julgamento", f.resultado);
  filtros.add("d.beneficio_id = ?::uuid", f.beneficio);
  filtros.add("d.orgao_julgador_id = ?::uuid", f.orgao);
  if (f.favoravel === "sim") filtros.addCru("d.favoravel is true");
  if (f.favoravel === "nao") filtros.addCru("d.favoravel is false");
  filtros.add("d.tsv @@ busca_tsquery(?)", f.q);

  const where = filtros.where;
  const params = [...filtros.params];

  const [{ total }] = await consultar<{ total: string }>(
    `select count(*)::int as total from decisao d ${where}`,
    params,
  );

  // O termo de busca entra de novo para o ranking e o trecho destacado.
  const termo = filtros.proximo(f.q ?? "");
  const limite = filtros.proximo(POR_PAGINA);
  const deslocamento = filtros.proximo((pagina - 1) * POR_PAGINA);

  const linhas = await consultar(
    `select d.id, d.origem, d.tipo, d.titulo, d.instancia, d.data_decisao,
            d.resultado, d.favoravel, d.tribunal, d.relator, d.numero_cnj,
            d.nivel_autoridade, d.tags,
            b.codigo as beneficio_codigo,
            o.nome   as orgao_nome,
            m.nome   as magistrado_nome,
            left(coalesce(d.ementa, d.dispositivo, d.texto_integral, ''), 320) as resumo,
            case when busca_tsquery(${termo}) is null then null
                 else ts_headline('portugues_sem_acento',
                        coalesce(d.ementa, d.texto_integral, d.titulo, ''),
                        busca_tsquery(${termo}),
                        'StartSel=@@R@@,StopSel=@@/R@@,MaxWords=40,MinWords=18,MaxFragments=1')
            end as trecho
     from decisao d
     left join beneficio b      on b.id = d.beneficio_id
     left join orgao_julgador o on o.id = d.orgao_julgador_id
     left join magistrado m     on m.id = d.magistrado_id
     ${where}
     order by
       case when busca_tsquery(${termo}) is null then 0
            else ts_rank_cd(d.tsv, busca_tsquery(${termo})) end desc,
       d.data_decisao desc nulls last,
       d.created_at desc
     limit ${limite} offset ${deslocamento}`,
    filtros.params,
  );

  return { linhas, total: Number(total), pagina };
}

export const decisao = (id: string) =>
  consultarUm(
    `select d.*,
            b.codigo as beneficio_codigo, b.nome as beneficio_nome,
            o.nome   as orgao_nome, o.tribunal as orgao_tribunal,
            m.nome   as magistrado_nome,
            p.numero_cnj as processo_numero, p.cliente_nome, p.id as proc_id
     from decisao d
     left join beneficio b      on b.id = d.beneficio_id
     left join orgao_julgador o on o.id = d.orgao_julgador_id
     left join magistrado m     on m.id = d.magistrado_id
     left join processo p       on p.id = d.processo_id
     where d.id = $1`,
    [id],
  );

export const decisaoTeses = (id: string) =>
  consultar(
    `select t.id, t.nome, dt.acolhida
     from decisao_tese dt join tese t on t.id = dt.tese_id
     where dt.decisao_id = $1 order by t.nome`,
    [id],
  );

/** Laudos do mesmo processo — o contexto pericial daquela decisão. */
export const decisaoLaudos = (processoId: string) =>
  consultar(
    `select l.id, l.data_laudo, l.conclusao, l.reconheceu_incapacidade,
            l.cid_principal, l.dii, l.resumo,
            pe.id as perito_id, pe.nome as perito_nome, pe.especialidade, pe.tipo as perito_tipo
     from laudo_pericial l
     left join perito pe on pe.id = l.perito_id
     where l.processo_id = $1
     order by l.data_laudo`,
    [processoId],
  );

// =====================================================================
// Peças
// =====================================================================

export type FiltroPeca = {
  q?: string;
  tipo?: string;
  beneficio?: string;
  modelo?: string;
  pagina?: number;
};

export async function listarPecas(f: FiltroPeca) {
  const pagina = Math.max(1, f.pagina ?? 1);
  const filtros = new Filtros();

  filtros.add("p.tipo = ?::tipo_peca", f.tipo);
  filtros.add("p.beneficio_id = ?::uuid", f.beneficio);
  if (f.modelo === "sim") filtros.addCru("p.modelo is true");
  filtros.add("p.tsv @@ busca_tsquery(?)", f.q);

  const where = filtros.where;
  const [{ total }] = await consultar<{ total: string }>(
    `select count(*)::int as total from peca p ${where}`,
    [...filtros.params],
  );

  const termo = filtros.proximo(f.q ?? "");
  const limite = filtros.proximo(POR_PAGINA);
  const deslocamento = filtros.proximo((pagina - 1) * POR_PAGINA);

  const linhas = await consultar(
    `select p.id, p.titulo, p.tipo, p.autor, p.data_peca, p.modelo, p.resumo, p.tags,
            b.codigo as beneficio_codigo,
            case when busca_tsquery(${termo}) is null then null
                 else ts_headline('portugues_sem_acento',
                        coalesce(p.texto, p.resumo, ''),
                        busca_tsquery(${termo}),
                        'StartSel=@@R@@,StopSel=@@/R@@,MaxWords=40,MinWords=18,MaxFragments=1')
            end as trecho
     from peca p
     left join beneficio b on b.id = p.beneficio_id
     ${where}
     order by
       case when busca_tsquery(${termo}) is null then 0
            else ts_rank_cd(p.tsv, busca_tsquery(${termo})) end desc,
       p.modelo desc,
       p.data_peca desc nulls last
     limit ${limite} offset ${deslocamento}`,
    filtros.params,
  );

  return { linhas, total: Number(total), pagina };
}

export const peca = (id: string) =>
  consultarUm(
    `select p.*, b.codigo as beneficio_codigo, b.nome as beneficio_nome,
            pr.numero_cnj as processo_numero, pr.cliente_nome
     from peca p
     left join beneficio b on b.id = p.beneficio_id
     left join processo pr on pr.id = p.processo_id
     where p.id = $1`,
    [id],
  );

export const pecaTeses = (id: string) =>
  consultar(
    `select t.id, t.nome from peca_tese pt join tese t on t.id = pt.tese_id
     where pt.peca_id = $1 order by t.nome`,
    [id],
  );
