/**
 * DataJud — API Pública do CNJ.
 *
 * O QUE ENTREGA: metadados do processo (classe, assuntos, órgão julgador,
 * data de ajuizamento) e a linha do tempo de movimentos codificados pela
 * Tabela Processual Unificada. Uma chave só cobre os 91 tribunais.
 *
 * O QUE NÃO ENTREGA: texto de documento. Nem sentença, nem laudo. O
 * DataJud é base de metadados — para conteúdo, use o PDPJ.
 *
 * A busca é ElasticSearch: o endpoint é por tribunal e o corpo da
 * requisição é uma query DSL.
 *
 * ---------------------------------------------------------------------
 * ATENÇÃO AO CONTRATO
 * ---------------------------------------------------------------------
 * Assim como no DJEN, os nomes de campo seguem a documentação mas não
 * foram exercitados contra o endpoint real daqui. O payload cru fica
 * guardado; ajustes de mapeamento acontecem só em `normalizar()`.
 *
 * A chave pública do DataJud é publicada pelo CNJ e muda de tempos em
 * tempos — por isso ela vem de variável de ambiente, não fica no código.
 * Pegue a atual na wiki do DataJud e ponha em DATAJUD_API_KEY.
 */

import {
  tribunalDoCnj,
  data,
  instante,
  inteiro,
  lista,
  texto,
  formatarCnj,
  type Bruto,
  type MovimentoNormalizado,
  type ProcessoNormalizado,
} from "./tipos";

export { tribunalDoCnj };

const BASE = process.env.DATAJUD_API_URL ?? "https://api-publica.datajud.cnj.jus.br";

/**
 * O alias do índice segue o padrão api_publica_<tribunal>, em minúsculas.
 * Ex.: trf3, tjsp, stj.
 */
function endpoint(tribunal: string): string {
  return `${BASE}/api_publica_${tribunal.toLowerCase()}/_search`;
}

export type ConsultaDataJud = {
  tribunal: string;
  numeroCnj?: string;
  /** Quando não há número, busca por intervalo de última atualização. */
  atualizadoDesde?: string;
  tamanho?: number;
  searchAfter?: unknown[];
};

export async function buscarProcessos(c: ConsultaDataJud): Promise<{
  itens: unknown[];
  proximoCursor: unknown[] | null;
}> {
  const chave = process.env.DATAJUD_API_KEY;
  if (!chave) {
    throw new Error(
      "DATAJUD_API_KEY não definida. A chave pública do DataJud é publicada " +
        "pelo CNJ na wiki do DataJud; copie a atual para o .env.",
    );
  }

  const corpo: Record<string, unknown> = {
    size: c.tamanho ?? 100,
    // Ordenação estável é obrigatória para o search_after paginar direito.
    sort: [{ "@timestamp": { order: "asc" } }],
  };

  if (c.numeroCnj) {
    corpo.query = {
      match: { numeroProcesso: c.numeroCnj.replace(/\D/g, "") },
    };
  } else if (c.atualizadoDesde) {
    corpo.query = {
      range: { "@timestamp": { gte: c.atualizadoDesde } },
    };
  } else {
    corpo.query = { match_all: {} };
  }

  if (c.searchAfter) corpo.search_after = c.searchAfter;

  const resposta = await fetch(endpoint(c.tribunal), {
    method: "POST",
    headers: {
      // O DataJud usa o esquema "APIKey", não "Bearer".
      Authorization: `APIKey ${chave}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });

  if (!resposta.ok) {
    // Um 403 aqui costuma ser proxy corporativo bloqueando o host, não
    // chave inválida — vale dizer as duas hipóteses para não mandar
    // ninguém caçar chave nova à toa.
    const dica =
      resposta.status === 403
        ? " Um 403 pode ser a chave desatualizada OU a rede bloqueando" +
          " api-publica.datajud.cnj.jus.br. Teste o host antes de trocar a chave."
        : resposta.status === 404
          ? ` O índice "api_publica_${c.tribunal.toLowerCase()}" não existe — confira a sigla.`
          : "";

    throw new Error(
      `DataJud respondeu ${resposta.status} para o tribunal "${c.tribunal}".${dica}`,
    );
  }

  const json = (await resposta.json()) as Record<string, unknown>;
  const hits = lista(json, "hits.hits");
  const ultimo = hits[hits.length - 1] as Record<string, unknown> | undefined;

  return {
    itens: hits,
    proximoCursor: (ultimo?.sort as unknown[]) ?? null,
  };
}

export function paraBruto(hit: unknown): Bruto {
  const fonte = (hit as Record<string, unknown>)?._source ?? hit;
  const id =
    texto(hit, "_id") ??
    texto(fonte, "numeroProcesso") ??
    JSON.stringify(fonte).slice(0, 120);

  return {
    fonte: "datajud",
    tipo: "processo",
    idExterno: String(id),
    numeroCnj: formatarCnj(texto(fonte, "numeroProcesso", "numero_processo")),
    payload: hit,
  };
}

export function normalizar(hit: unknown): ProcessoNormalizado | null {
  // O ElasticSearch embrulha o documento em _source.
  const f = (hit as Record<string, unknown>)?._source ?? hit;

  const numeroCnj = formatarCnj(texto(f, "numeroProcesso", "numero_processo"));
  if (!numeroCnj) return null;

  return {
    idExterno: String(texto(hit, "_id") ?? numeroCnj),
    numeroCnj,
    tribunalSigla: texto(f, "tribunal", "siglaTribunal"),
    grau: texto(f, "grau"),
    classeCnj: texto(f, "classe.nome", "classe.descricao"),
    codigoClasse: inteiro(f, "classe.codigo"),
    assuntos: lista(f, "assuntos", "assunto"),
    orgaoJulgadorNome: texto(
      f,
      "orgaoJulgador.nome",
      "orgaoJulgador.nomeOrgao",
      "orgaoJulgador",
    ),
    dataDistribuicao: data(f, "dataAjuizamento", "dataDistribuicao"),
    movimentos: lista(f, "movimentos", "movimento").map(normalizarMovimento),
  };
}

function normalizarMovimento(m: unknown): MovimentoNormalizado {
  return {
    codigo: inteiro(m, "codigo", "codigoNacional"),
    nome: texto(m, "nome", "descricao"),
    dataHora: instante(m, "dataHora", "dataHoraMovimento", "data"),
    complementos: lista(m, "complementosTabelados", "complementos"),
  };
}

/**
 * Códigos da Tabela Processual Unificada que expressam o desfecho.
 *
 * É daqui que sai a análise de comportamento do juízo: o DataJud não
 * entrega o texto da sentença, mas entrega o CÓDIGO do julgamento — que
 * é dado estruturado do CNJ, não interpretação de texto. Para medir
 * "quantas vezes esta vara julga procedente", isso basta e é mais
 * confiável do que ler dispositivo.
 *
 * A tabela é deliberadamente CURTA. Só entram códigos de que se tem
 * certeza, porque classificar errado corromperia exatamente o número que
 * a ferramenta existe para produzir — melhor deixar um caso de fora do
 * que contá-lo como o contrário do que foi.
 *
 * Todos os movimentos ficam gravados em `movimento`, e o modo de teste
 * reporta os códigos mais frequentes que ainda não estão aqui. É assim
 * que a tabela cresce: conferindo o código real contra a TPU e
 * acrescentando — sem precisar recoletar nada.
 */
export const RESULTADO_POR_CODIGO: Record<number, string> = {
  219: "procedente",
  220: "improcedente",
  221: "parcialmente_procedente",
};

export const CODIGOS_JULGAMENTO = new Set(
  Object.keys(RESULTADO_POR_CODIGO).map(Number),
);

export function temJulgamento(movimentos: MovimentoNormalizado[]): boolean {
  return movimentos.some((m) => m.codigo != null && CODIGOS_JULGAMENTO.has(m.codigo));
}

/**
 * Extrai o desfecho da linha do tempo: o movimento de julgamento mais
 * recente que o sistema saiba classificar.
 */
export function desfechoDosMovimentos(movimentos: MovimentoNormalizado[]): {
  resultado: string;
  dataDecisao: string | null;
  codigo: number;
  nome: string | null;
} | null {
  const julgamentos = movimentos
    .filter((m) => m.codigo != null && RESULTADO_POR_CODIGO[m.codigo])
    .sort((a, b) => String(b.dataHora ?? "").localeCompare(String(a.dataHora ?? "")));

  const m = julgamentos[0];
  if (!m || m.codigo == null) return null;

  return {
    resultado: RESULTADO_POR_CODIGO[m.codigo],
    dataDecisao: m.dataHora ? m.dataHora.slice(0, 10) : null,
    codigo: m.codigo,
    nome: m.nome ?? null,
  };
}

/**
 * Busca processos de um órgão julgador num período — a consulta que
 * responde "como esta vara vem decidindo".
 *
 * O filtro de período usa a data de ajuizamento, porque é campo de
 * primeiro nível no índice. A data do JULGAMENTO vive dentro do array de
 * movimentos e nem sempre é indexada de forma consultável, então esse
 * recorte é aplicado depois, sobre o que voltou.
 */
export async function buscarPorOrgao(p: {
  tribunal: string;
  orgao?: string;
  codigoOrgao?: number;
  classe?: string;
  ajuizadoDe?: string;
  ajuizadoAte?: string;
  tamanho?: number;
  searchAfter?: unknown[];
}): Promise<{ itens: unknown[]; total: number; proximoCursor: unknown[] | null }> {
  const chave = process.env.DATAJUD_API_KEY;
  if (!chave) {
    throw new Error(
      "DATAJUD_API_KEY não definida. A chave pública do DataJud é divulgada " +
        "pelo CNJ; defina-a nas variáveis de ambiente.",
    );
  }

  const must: unknown[] = [];

  if (p.codigoOrgao) {
    must.push({ term: { "orgaoJulgador.codigo": p.codigoOrgao } });
  } else if (p.orgao) {
    // match_phrase evita que "1ª Vara Federal" traga toda vara federal.
    must.push({ match_phrase: { "orgaoJulgador.nome": p.orgao } });
  }

  if (p.classe) must.push({ match_phrase: { "classe.nome": p.classe } });

  if (p.ajuizadoDe || p.ajuizadoAte) {
    must.push({
      range: {
        dataAjuizamento: {
          ...(p.ajuizadoDe ? { gte: p.ajuizadoDe } : {}),
          ...(p.ajuizadoAte ? { lte: p.ajuizadoAte } : {}),
        },
      },
    });
  }

  const corpo: Record<string, unknown> = {
    size: Math.min(p.tamanho ?? 100, 500),
    track_total_hits: true,
    query: must.length ? { bool: { must } } : { match_all: {} },
    sort: [{ "@timestamp": { order: "asc" } }],
  };
  if (p.searchAfter) corpo.search_after = p.searchAfter;

  const resposta = await fetch(endpoint(p.tribunal), {
    method: "POST",
    headers: {
      Authorization: `APIKey ${chave}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });

  if (!resposta.ok) {
    const dica =
      resposta.status === 403
        ? " Pode ser a chave desatualizada OU a rede bloqueando o host."
        : resposta.status === 404
          ? ` O índice "api_publica_${p.tribunal.toLowerCase()}" não existe — confira a sigla.`
          : "";
    throw new Error(`DataJud respondeu ${resposta.status}.${dica}`);
  }

  const json = (await resposta.json()) as Record<string, unknown>;
  const hits = lista(json, "hits.hits");
  const ultimo = hits[hits.length - 1] as Record<string, unknown> | undefined;
  const total = Number(
    (json as { hits?: { total?: { value?: number } } })?.hits?.total?.value ?? hits.length,
  );

  return { itens: hits, total, proximoCursor: (ultimo?.sort as unknown[]) ?? null };
}

/**
 * Consulta um processo específico, descobrindo o tribunal pelo próprio
 * número CNJ.
 *
 * Este é o modo de uso correto do DataJud para um escritório: consultar
 * os processos que já se conhece. Varrer um tribunal inteiro não faz
 * sentido — são milhões de processos, e a API é um bem público
 * compartilhado.
 */
export async function buscarPorNumero(numeroCnj: string): Promise<{
  tribunal: string | null;
  itens: unknown[];
  erro?: string;
}> {
  const tribunal = tribunalDoCnj(numeroCnj);
  if (!tribunal) {
    return {
      tribunal: null,
      itens: [],
      erro: `Não reconheci o tribunal no número ${numeroCnj}.`,
    };
  }

  try {
    const { itens } = await buscarProcessos({ tribunal, numeroCnj, tamanho: 10 });
    return { tribunal, itens };
  } catch (erro) {
    return {
      tribunal,
      itens: [],
      erro: erro instanceof Error ? erro.message : String(erro),
    };
  }
}
