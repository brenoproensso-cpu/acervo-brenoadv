/**
 * DJEN — Diário de Justiça Eletrônico Nacional.
 *
 * Fonte das comunicações e intimações. Consulta-se por OAB e intervalo de
 * datas; o retorno traz o teor do ato publicado.
 *
 * O QUE ESTA FONTE ENTREGA: o texto da comunicação — geralmente a
 * intimação com o dispositivo da decisão. Serve para acompanhar andamento
 * e contar prazo.
 *
 * O QUE NÃO ENTREGA: inteiro teor de sentença, petições e laudo pericial.
 * Isso vem do PDPJ.
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
  data,
  lista,
  texto,
  formatarCnj,
  type Bruto,
  type PublicacaoNormalizada,
} from "./tipos";

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
