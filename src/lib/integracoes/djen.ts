/**
 * DJEN — Diário de Justiça Eletrônico Nacional.
 *
 * Fonte das comunicações e intimações, com o TEOR do ato publicado.
 *
 * Dois usos, no mesmo endpoint:
 *
 *   1. Por OAB — acompanhar os próprios processos e prazos.
 *   2. Por órgão julgador e período — reunir as sentenças proferidas por
 *      uma vara, COM o conteúdo. É o caminho para estudar como aquele
 *      juízo fundamenta, e não apenas quanto ele concede.
 *
 * O que o DJEN publica varia por tribunal: alguns trazem a sentença
 * inteira na intimação, outros só avisam que ela existe. `pareceDecisao`
 * separa os dois casos.
 *
 * Petições e laudo pericial continuam fora — isso só o PDPJ entrega.
 *
 * ---------------------------------------------------------------------
 * ATENÇÃO AO CONTRATO
 * ---------------------------------------------------------------------
 * Os nomes de campo abaixo seguem a documentação da API, mas NÃO foram
 * verificados contra o endpoint em produção (o ambiente onde este código
 * foi escrito não tem saída de rede). Por isso:
 *
 *   1. O payload cru é sempre gravado inteiro em `payload_bruto`.
 *   2. A leitura usa `campo()`, que aceita vários nomes alternativos.
 *   3. Se um campo vier vazio na primeira execução, o conserto é só aqui
 *      em `normalizar()` — depois reprocesse do bruto, sem rebaixar nada.
 *
 * Rode `npm run ingerir -- djen --dry-run` na primeira vez e confira o
 * mapeamento antes de gravar.
 */

import {
  normalizarTexto,
  pareceDecisao,
  data,
  lista,
  texto,
  formatarCnj,
  type Bruto,
  type PublicacaoNormalizada,
} from "./tipos";

export { pareceDecisao };

const BASE = process.env.DJEN_API_URL ?? "https://comunicaapi.pje.jus.br/api/v1";

export type ConsultaDjen = {
  numeroOab: string;
  ufOab: string;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
  numeroCnj?: string;
  pagina?: number;
  itensPorPagina?: number;
};

/**
 * Busca comunicações no DJEN. A consulta por OAB é pública e não exige
 * credencial; se o escritório tiver acesso autenticado, basta definir
 * DJEN_API_TOKEN que o header vai junto.
 */
export async function buscarComunicacoes(c: ConsultaDjen): Promise<unknown[]> {
  const params = new URLSearchParams({
    numeroOab: c.numeroOab,
    ufOab: c.ufOab,
    dataDisponibilizacaoInicio: c.dataInicio,
    dataDisponibilizacaoFim: c.dataFim,
    pagina: String(c.pagina ?? 1),
    itensPorPagina: String(c.itensPorPagina ?? 100),
  });
  if (c.numeroCnj) params.set("numeroProcesso", c.numeroCnj.replace(/\D/g, ""));

  const token = process.env.DJEN_API_TOKEN;

  const resposta = await fetch(`${BASE}/comunicacao?${params}`, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!resposta.ok) {
    throw new Error(
      `DJEN respondeu ${resposta.status} ${resposta.statusText}. ` +
        `Confira OAB/UF e o intervalo de datas.`,
    );
  }

  const json = (await resposta.json()) as unknown;

  // A API às vezes devolve o array direto, às vezes embrulhado.
  if (Array.isArray(json)) return json;
  const items = lista(json, "items", "content", "data", "comunicacoes", "resultado");
  return items;
}

/** Envelopa o item cru para gravação em staging. */
export function paraBruto(item: unknown): Bruto {
  const id =
    texto(item, "id", "hash", "idComunicacao", "numeroComunicacao") ??
    JSON.stringify(item).slice(0, 120);

  return {
    fonte: "djen",
    tipo: "comunicacao",
    idExterno: String(id),
    numeroCnj: formatarCnj(texto(item, "numeroProcesso", "numero_processo", "numeroCnj")),
    payload: item,
  };
}

/**
 * Traduz o item do DJEN para o formato interno.
 *
 * Cada `texto(item, "a", "b", "c")` tenta os nomes em ordem — é o ponto
 * de ajuste quando o contrato real divergir.
 */
export function normalizar(item: unknown): PublicacaoNormalizada {
  return {
    idExterno: String(
      texto(item, "id", "hash", "idComunicacao") ?? JSON.stringify(item).slice(0, 120),
    ),
    numeroCnj: formatarCnj(
      texto(item, "numeroProcesso", "numero_processo", "numeroCnj", "numeroProcessoMascara"),
    ),
    tribunal: texto(item, "siglaTribunal", "tribunal", "nomeTribunal"),
    orgao: texto(item, "nomeOrgao", "orgao", "nomeOrgaoJulgador", "orgaoJulgador"),
    tipoComunicacao: texto(item, "tipoComunicacao", "tipo", "especie", "tipoDocumento"),
    dataDisponibilizacao: data(item, "dataDisponibilizacao", "data_disponibilizacao"),
    dataPublicacao: data(item, "dataPublicacao", "data_publicacao", "dataEnvio"),
    teor: texto(item, "texto", "teor", "conteudo", "textoComunicacao", "inteiroTeor"),
    destinatarios: lista(item, "destinatarios", "destinatario", "partes"),
    advogados: lista(item, "destinatarioAdvogados", "advogados", "advogado"),
    numeroOab: texto(item, "numeroOab", "numero_oab"),
    ufOab: texto(item, "ufOab", "uf_oab"),
    linkCertidao: texto(item, "link", "linkCertidao", "certidao"),
  };
}

/**
 * Nomes de campo que `normalizar()` tenta ler. Serve ao diagnóstico do
 * --dry-run: o que a API mandou e não está nesta lista é dado que está
 * sendo jogado fora.
 */
export const CAMPOS_CONHECIDOS = [
  "id", "hash", "idComunicacao",
  "numeroProcesso", "numero_processo", "numeroCnj", "numeroProcessoMascara",
  "siglaTribunal", "tribunal", "nomeTribunal",
  "nomeOrgao", "orgao", "nomeOrgaoJulgador", "orgaoJulgador",
  "tipoComunicacao", "tipo", "especie", "tipoDocumento",
  "dataDisponibilizacao", "data_disponibilizacao",
  "dataPublicacao", "data_publicacao", "dataEnvio",
  "texto", "teor", "conteudo", "textoComunicacao", "inteiroTeor",
  "destinatarios", "destinatario", "partes",
  "destinatarioAdvogados", "advogados", "advogado",
  "numeroOab", "numero_oab", "ufOab", "uf_oab",
  "link", "linkCertidao", "certidao",
];

/**
 * Estima o prazo a partir do tipo de comunicação.
 *
 * Deliberadamente conservador: só sugere quando o tipo é inequívoco, e o
 * resultado é sempre uma sugestão a conferir, nunca um prazo definitivo.
 * Contagem de prazo depende de suspensão, feriado local e intimação
 * pessoal — nada disso está no payload.
 */
export function estimarPrazoDias(tipoComunicacao?: string | null): number | null {
  if (!tipoComunicacao) return null;
  const t = tipoComunicacao.toLowerCase();
  if (t.includes("contestação") || t.includes("contestacao")) return 15;
  if (t.includes("embargos de declaração") || t.includes("embargos de declaracao")) return 5;
  if (t.includes("recurso inominado")) return 10;
  if (t.includes("apelação") || t.includes("apelacao")) return 15;
  return null;
}

// =====================================================================
// Busca por órgão julgador — sentenças de uma vara num período
// =====================================================================
// O mesmo endpoint de consulta aceita recorte por tribunal, órgão e
// intervalo de datas, e devolve o TEOR publicado. É o caminho para
// "sentenças proferidas pela vara tal entre X e Y", com conteúdo.
//
// Como não foi possível conferir a documentação do endpoint deste
// ambiente (a rede bloqueia o host), a estratégia é dupla: manda-se o
// filtro ao servidor E aplica-se o mesmo recorte sobre o que voltou.
// Se o parâmetro existir, a busca vem estreita; se não existir, o
// servidor ignora e o recorte acontece aqui. Nos dois casos o resultado
// é o mesmo — só muda quanto tráfego foi gasto.
// =====================================================================

export type ConsultaOrgaoDjen = {
  tribunal?: string;
  orgao?: string;
  /** Filtra pelo nome do magistrado dentro do teor publicado. */
  magistrado?: string;
  /** Palavras que precisam aparecer no teor. */
  contendo?: string;
  dataInicio: string;
  dataFim: string;
  paginas?: number;
  itensPorPagina?: number;
};

export async function buscarPorOrgao(c: ConsultaOrgaoDjen): Promise<{
  itens: unknown[];
  paginasLidas: number;
  totalBruto: number;
}> {
  const token = process.env.DJEN_API_TOKEN;
  const paginas = Math.min(Math.max(c.paginas ?? 3, 1), 30);
  const porPagina = Math.min(c.itensPorPagina ?? 100, 100);

  const coletado: unknown[] = [];
  let totalBruto = 0;
  let lidas = 0;

  for (let pagina = 1; pagina <= paginas; pagina++) {
    const params = new URLSearchParams({
      dataDisponibilizacaoInicio: c.dataInicio,
      dataDisponibilizacaoFim: c.dataFim,
      pagina: String(pagina),
      itensPorPagina: String(porPagina),
    });

    // Filtros que o servidor pode ou não conhecer. Se ignorar, o recorte
    // acontece adiante, sobre o que voltou.
    if (c.tribunal) params.set("siglaTribunal", c.tribunal.toUpperCase());
    if (c.orgao) {
      params.set("nomeOrgao", c.orgao);
      params.set("orgao", c.orgao);
    }
    if (c.contendo) params.set("texto", c.contendo);

    const resposta = await fetch(`${BASE}/comunicacao?${params}`, {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!resposta.ok) {
      if (pagina === 1) {
        throw new Error(
          `DJEN respondeu ${resposta.status} ${resposta.statusText}. ` +
            `Confira tribunal e intervalo de datas.`,
        );
      }
      break;
    }

    const json = (await resposta.json()) as unknown;
    const itens = Array.isArray(json)
      ? json
      : lista(json, "items", "content", "data", "comunicacoes", "resultado");

    lidas++;
    totalBruto += itens.length;
    coletado.push(...itens);

    if (itens.length < porPagina) break;
  }

  return { itens: coletado, paginasLidas: lidas, totalBruto };
}

/**
 * Aplica o recorte fino sobre o que voltou: órgão, magistrado e teor.
 *
 * O nome do magistrado é procurado dentro do texto publicado, porque o
 * DJEN identifica o órgão, não quem assinou — mas quem assinou costuma
 * constar da própria sentença.
 */
export function filtrar(
  itens: unknown[],
  c: Pick<ConsultaOrgaoDjen, "orgao" | "magistrado" | "contendo">,
): PublicacaoNormalizada[] {
  const orgaoAlvo = c.orgao ? normalizarTexto(c.orgao) : null;
  const magistradoAlvo = c.magistrado ? normalizarTexto(c.magistrado) : null;
  const contendoAlvo = c.contendo ? normalizarTexto(c.contendo) : null;

  return itens
    .map(normalizar)
    .filter((p) => {
      if (orgaoAlvo && !normalizarTexto(p.orgao ?? "").includes(orgaoAlvo)) return false;
      const teor = normalizarTexto(p.teor ?? "");
      if (magistradoAlvo && !teor.includes(magistradoAlvo)) return false;
      if (contendoAlvo && !teor.includes(contendoAlvo)) return false;
      return true;
    });
}
