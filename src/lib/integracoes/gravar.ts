/**
 * Persistência da ingestão: pega o que os adaptadores normalizaram e
 * grava no banco, sempre de forma idempotente.
 *
 * Reexecutar uma sincronização não pode duplicar nada — daí os
 * `on conflict` apoiados nas chaves naturais de cada fonte.
 */

import { consultar, consultarUm } from "@/lib/db";
import { extrairDaDecisao, extrairDoLaudo } from "./extracao";
import { estimarPrazoDias } from "./djen";
import type {
  Bruto,
  DocumentoNormalizado,
  ProcessoNormalizado,
  PublicacaoNormalizada,
} from "./tipos";

/** Grava o payload cru. Devolve false se já estava lá. */
export async function gravarBruto(b: Bruto): Promise<boolean> {
  const r = await consultarUm<{ id: string }>(
    `insert into payload_bruto (fonte, tipo, id_externo, numero_cnj, payload)
     values ($1::fonte_dados, $2, $3, $4, $5::jsonb)
     on conflict (fonte, tipo, id_externo) do nothing
     returning id`,
    [b.fonte, b.tipo, b.idExterno, b.numeroCnj ?? null, JSON.stringify(b.payload)],
  );
  return r !== null;
}

/**
 * Localiza o processo pelo número CNJ, criando um registro mínimo se não
 * existir. Comparação por dígitos, porque a máscara varia entre fontes.
 */
export async function garantirProcesso(
  numeroCnj: string | null | undefined,
  extras: Partial<{
    tribunalSigla: string | null;
    grau: string | null;
    classeCnj: string | null;
    codigoClasse: number | null;
    assuntos: unknown[];
    dataDistribuicao: string | null;
    fonte: string;
  }> = {},
): Promise<string | null> {
  if (!numeroCnj) return null;
  const digitos = numeroCnj.replace(/\D/g, "");
  if (digitos.length !== 20) return null;

  const existente = await consultarUm<{ id: string }>(
    `select id from processo
     where regexp_replace(coalesce(numero_cnj, ''), '\\D', '', 'g') = $1
     limit 1`,
    [digitos],
  );

  if (existente) {
    // Complementa campos que ainda estejam vazios, sem sobrescrever o
    // que já foi conferido manualmente.
    await consultar(
      `update processo set
         tribunal_sigla   = coalesce(tribunal_sigla, $2),
         grau             = coalesce(grau, $3),
         classe_cnj       = coalesce(classe_cnj, $4),
         codigo_classe    = coalesce(codigo_classe, $5),
         assuntos         = case when assuntos = '[]'::jsonb then $6::jsonb else assuntos end,
         data_distribuicao = coalesce(data_distribuicao, $7::date),
         sincronizado_em  = now()
       where id = $1`,
      [
        existente.id,
        extras.tribunalSigla ?? null,
        extras.grau ?? null,
        extras.classeCnj ?? null,
        extras.codigoClasse ?? null,
        JSON.stringify(extras.assuntos ?? []),
        extras.dataDistribuicao ?? null,
      ],
    );
    return existente.id;
  }

  const novo = await consultarUm<{ id: string }>(
    `insert into processo (
       numero_cnj, fonte, tribunal_sigla, grau, classe_cnj, codigo_classe,
       assuntos, data_distribuicao, sincronizado_em, status
     ) values ($1, $2::fonte_dados, $3, $4, $5, $6, $7::jsonb, $8::date, now(), 'em_andamento')
     on conflict (numero_cnj) do update set sincronizado_em = now()
     returning id`,
    [
      numeroCnj,
      extras.fonte ?? "datajud",
      extras.tribunalSigla ?? null,
      extras.grau ?? null,
      extras.classeCnj ?? null,
      extras.codigoClasse ?? null,
      JSON.stringify(extras.assuntos ?? []),
      extras.dataDistribuicao ?? null,
    ],
  );
  return novo?.id ?? null;
}

// =====================================================================
// DJEN
// =====================================================================

export async function gravarPublicacao(p: PublicacaoNormalizada): Promise<boolean> {
  const processoId = await garantirProcesso(p.numeroCnj, { fonte: "djen" });
  const prazoDias = estimarPrazoDias(p.tipoComunicacao);

  const r = await consultarUm<{ id: string }>(
    `insert into publicacao (
       id_externo, processo_id, numero_cnj, tribunal, orgao, tipo_comunicacao,
       data_disponibilizacao, data_publicacao, teor, destinatarios, advogados,
       numero_oab, uf_oab, link_certidao, prazo_dias
     ) values (
       $1, $2::uuid, $3, $4, $5, $6, $7::date, $8::date, $9,
       $10::jsonb, $11::jsonb, $12, $13, $14, $15
     )
     on conflict (id_externo) do nothing
     returning id`,
    [
      p.idExterno,
      processoId,
      p.numeroCnj ?? null,
      p.tribunal ?? null,
      p.orgao ?? null,
      p.tipoComunicacao ?? null,
      p.dataDisponibilizacao ?? null,
      p.dataPublicacao ?? null,
      p.teor ?? null,
      JSON.stringify(p.destinatarios ?? []),
      JSON.stringify(p.advogados ?? []),
      p.numeroOab ?? null,
      p.ufOab ?? null,
      p.linkCertidao ?? null,
      prazoDias,
    ],
  );
  return r !== null;
}

// =====================================================================
// DataJud
// =====================================================================

export async function gravarProcesso(p: ProcessoNormalizado): Promise<{
  processoId: string | null;
  movimentosNovos: number;
}> {
  const processoId = await garantirProcesso(p.numeroCnj, {
    tribunalSigla: p.tribunalSigla,
    grau: p.grau,
    classeCnj: p.classeCnj,
    codigoClasse: p.codigoClasse,
    assuntos: p.assuntos,
    dataDistribuicao: p.dataDistribuicao,
    fonte: "datajud",
  });

  if (!processoId) return { processoId: null, movimentosNovos: 0 };

  let novos = 0;
  for (const m of p.movimentos) {
    if (!m.dataHora) continue; // sem data não dá para deduplicar
    const r = await consultarUm<{ id: string }>(
      `insert into movimento (processo_id, codigo_cnj, nome, data_hora, complementos)
       values ($1::uuid, $2, $3, $4::timestamptz, $5::jsonb)
       on conflict (processo_id, codigo_cnj, data_hora) do nothing
       returning id`,
      [
        processoId,
        m.codigo ?? null,
        m.nome ?? null,
        m.dataHora,
        JSON.stringify(m.complementos ?? []),
      ],
    );
    if (r) novos++;
  }

  return { processoId, movimentosNovos: novos };
}

// =====================================================================
// PDPJ — documentos, e o laudo que sai deles
// =====================================================================

export async function gravarDocumento(d: DocumentoNormalizado): Promise<{
  novo: boolean;
  documentoId: string | null;
  laudoCriado: boolean;
  decisaoCriada: boolean;
}> {
  const processoId = await garantirProcesso(d.numeroCnj, { fonte: "pdpj" });

  const inserido = await consultarUm<{ id: string }>(
    `insert into documento_externo (
       fonte, id_externo, processo_id, numero_cnj, nome, tipo_origem,
       categoria, data_juntada, texto, paginas, via_ocr, metadados
     ) values (
       'pdpj', $1, $2::uuid, $3, $4, $5, $6, $7::date, $8, $9, $10, $11::jsonb
     )
     on conflict (fonte, id_externo) do nothing
     returning id`,
    [
      d.idExterno,
      processoId,
      d.numeroCnj ?? null,
      d.nome ?? null,
      d.tipoOrigem ?? null,
      d.categoria ?? null,
      d.dataJuntada ?? null,
      d.texto ?? null,
      d.paginas ?? null,
      d.viaOcr ?? false,
      JSON.stringify(d.metadados ?? {}),
    ],
  );

  if (!inserido) {
    return { novo: false, documentoId: null, laudoCriado: false, decisaoCriada: false };
  }

  let laudoCriado = false;
  let decisaoCriada = false;

  if (processoId && d.texto) {
    if (d.categoria === "laudo") {
      laudoCriado = await criarLaudoDeDocumento(inserido.id, processoId, d.texto);
    } else if (d.categoria === "sentenca" || d.categoria === "acordao") {
      decisaoCriada = await criarDecisaoDeDocumento(
        inserido.id,
        processoId,
        d.texto,
        d.categoria,
        d.nome ?? null,
        d.dataJuntada ?? null,
      );
    }
  }

  return { novo: true, documentoId: inserido.id, laudoCriado, decisaoCriada };
}

/**
 * Cria a decisão a partir do texto da sentença ou do acórdão.
 *
 * Sem isto o laudo entraria sozinho e o par "conclusão × desfecho" nunca
 * se formaria. Entra como `extraido_automatico`, então fica fora das
 * estatísticas até conferência — mesma regra do laudo.
 *
 * `favoravel` fica NULL de propósito: o trigger do banco deduz a partir
 * do resultado e do polo, e a conferência humana pode corrigir. Um
 * "desprovido" pode ser ótimo se quem recorreu foi o INSS.
 */
async function criarDecisaoDeDocumento(
  documentoId: string,
  processoId: string,
  texto: string,
  categoria: string,
  nome: string | null,
  dataJuntada: string | null,
): Promise<boolean> {
  const e = extrairDaDecisao(texto);
  if (!e.resultado) return false;

  const proc = await consultarUm<{ numero_cnj: string | null; cliente_nome: string | null }>(
    "select numero_cnj, cliente_nome from processo where id = $1::uuid",
    [processoId],
  );

  await consultar(
    `insert into decisao (
       origem, tipo, titulo, processo_id, numero_cnj, instancia,
       data_decisao, resultado, texto_integral, dispositivo,
       documento_externo_id, fonte, origem_dado, observacoes
     ) values (
       'acervo_proprio', $1::tipo_documento, $2, $3::uuid, $4,
       $5::instancia, $6::date, $7::resultado_julgamento, $8, $9,
       $10::uuid, 'pdpj', 'extraido_automatico',
       'Importada do PDPJ. Resultado inferido do dispositivo — confira antes de usar.'
     )`,
    [
      categoria === "acordao" ? "acordao" : "sentenca",
      nome ??
        `${categoria === "acordao" ? "Acórdão" : "Sentença"} — ${proc?.cliente_nome ?? proc?.numero_cnj ?? "processo importado"}`,
      processoId,
      proc?.numero_cnj ?? null,
      categoria === "acordao" ? "segundo_grau" : "primeiro_grau",
      e.dataDecisao ?? dataJuntada,
      e.resultado,
      texto,
      e.trecho,
      documentoId,
    ],
  );
  return true;
}

/**
 * Cria o laudo a partir do texto do documento.
 *
 * Entra sempre como `extraido_automatico` e sem `revisado_em`, ou seja:
 * fica fora das estatísticas até alguém confirmar na tela de revisão.
 * Essa é a barreira que impede um OCR ruim de contaminar a taxa de êxito
 * de um perito.
 */
async function criarLaudoDeDocumento(
  documentoId: string,
  processoId: string,
  texto: string,
): Promise<boolean> {
  const e = extrairDoLaudo(texto);
  if (!e.conclusao) return false;

  const peritoId = e.perito ? await garantirPerito(e.perito) : null;

  await consultar(
    `insert into laudo_pericial (
       processo_id, perito_id, data_laudo, conclusao, cid_principal, cids,
       documento_externo_id, origem_dado, confianca, trecho_conclusao, resumo
     ) values (
       $1::uuid, $2::uuid, $3::date, $4::conclusao_pericial, $5, $6::text[],
       $7::uuid, 'extraido_automatico', $8, $9,
       'Laudo importado do PDPJ. Conclusão inferida do texto — confira antes de usar.'
     )`,
    [
      processoId,
      peritoId,
      e.dataLaudo,
      e.conclusao,
      e.cidPrincipal,
      e.cids,
      documentoId,
      e.confianca,
      e.trecho,
    ],
  );
  return true;
}

/**
 * Encontra o perito pelo nome, ou cria. A comparação ignora acentos,
 * caixa e títulos, porque "Dr. MÁRCIO A. FONTES" e "Márcio Aguiar
 * Fontes" precisam cair no mesmo registro — senão a estatística de um
 * mesmo perito se divide em duas linhas.
 */
export async function garantirPerito(nome: string): Promise<string | null> {
  const limpo = nome
    .replace(/^\s*(dr|dra|drª|sr|sra)\.?\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (limpo.length < 5) return null;

  // A comparação precisa remover o título dos DOIS lados: o cadastro
  // manual costuma gravar "Dr. Márcio Aguiar Fontes" e a extração
  // devolve "Márcio Aguiar Fontes". Sem normalizar o lado do banco,
  // cria-se um perito duplicado e o histórico dele se parte em dois.
  const TIRA_TITULO = `regexp_replace(lower(unaccent($NOME$)), '^(dr|dra|dr\\.?ª|sr|sra)\\.?\\s+', '')`;

  const existente = await consultarUm<{ id: string }>(
    `select id from perito
     where ${TIRA_TITULO.replace("$NOME$", "nome")}
         = ${TIRA_TITULO.replace("$NOME$", "$1")}
     limit 1`,
    [limpo],
  );
  if (existente) return existente.id;

  const novo = await consultarUm<{ id: string }>(
    `insert into perito (nome, tipo, observacoes)
     values ($1, 'judicial', 'Cadastrado automaticamente na importação do PDPJ. Confira especialidade e grafia do nome.')
     on conflict (nome, tipo) do update set nome = excluded.nome
     returning id`,
    [limpo],
  );
  return novo?.id ?? null;
}

// =====================================================================
// Controle de sincronização
// =====================================================================

export async function registrarSincronizacao(
  fonte: string,
  escopo: string,
  dados: {
    recebidos: number;
    novos: number;
    cursor?: string | null;
    erro?: string | null;
  },
): Promise<void> {
  await consultar(
    `insert into sincronizacao (
       fonte, escopo, ultima_tentativa, ultimo_sucesso, cursor,
       itens_recebidos, itens_novos, status, erro
     ) values (
       $1::fonte_dados, $2, now(),
       case when $6::text is null then now() else null end,
       $3, $4, $5, case when $6::text is null then 'ok' else 'erro' end, $6
     )
     on conflict (fonte, escopo) do update set
       ultima_tentativa = now(),
       ultimo_sucesso   = case when $6::text is null then now() else sincronizacao.ultimo_sucesso end,
       cursor           = coalesce($3, sincronizacao.cursor),
       itens_recebidos  = sincronizacao.itens_recebidos + $4,
       itens_novos      = sincronizacao.itens_novos + $5,
       status           = case when $6::text is null then 'ok' else 'erro' end,
       erro             = $6`,
    [fonte, escopo, dados.cursor ?? null, dados.recebidos, dados.novos, dados.erro ?? null],
  );
}
