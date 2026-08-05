/**
 * PDPJ — Plataforma Digital do Poder Judiciário (DataLake).
 *
 * É a única das três fontes que entrega o TEXTO dos documentos: petição
 * inicial, contestação, sentença, acórdão e — o que mais importa aqui —
 * o LAUDO PERICIAL. Sem ela, a análise de padrões não sai do papel,
 * porque nem DJEN nem DataJud expõem perito ou conclusão pericial.
 *
 * ---------------------------------------------------------------------
 * DOIS CAMINHOS DE ACESSO
 * ---------------------------------------------------------------------
 * 1. HTTP direto ao DataLake, se o escritório tiver credencial própria
 *    (PDPJ_API_URL + PDPJ_API_TOKEN). É o caminho de `baixarDocumentos`.
 *
 * 2. Importação de arquivo JSON, para quando os documentos vierem por
 *    outro meio — por exemplo, coletados via um cliente MCP do PDPJ.
 *    É o caminho de `importarDeArquivo` no CLI, e não exige credencial
 *    nenhuma dentro da aplicação.
 *
 * Os dois desembocam em `normalizar()`, então o resto do sistema não
 * distingue um do outro.
 */

import {
  data,
  inteiro,
  lista,
  texto,
  formatarCnj,
  type Bruto,
  type DocumentoNormalizado,
} from "./tipos";

const BASE = process.env.PDPJ_API_URL;

export async function baixarDocumentos(numeroCnj: string): Promise<unknown[]> {
  const token = process.env.PDPJ_API_TOKEN;
  if (!BASE || !token) {
    throw new Error(
      "Acesso direto ao PDPJ não configurado (faltam PDPJ_API_URL e " +
        "PDPJ_API_TOKEN). Use a importação por arquivo: " +
        "npm run ingerir -- pdpj --arquivo documentos.json",
    );
  }

  const resposta = await fetch(
    `${BASE}/processos/${numeroCnj.replace(/\D/g, "")}/documentos`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );

  if (!resposta.ok) {
    throw new Error(`PDPJ respondeu ${resposta.status} para o processo ${numeroCnj}.`);
  }

  const json = (await resposta.json()) as unknown;
  return Array.isArray(json) ? json : lista(json, "documentos", "content", "items", "data");
}

export function paraBruto(doc: unknown): Bruto {
  const id =
    texto(doc, "id", "idDocumento", "hash", "documentoId") ??
    JSON.stringify(doc).slice(0, 120);

  return {
    fonte: "pdpj",
    tipo: "documento",
    idExterno: String(id),
    numeroCnj: formatarCnj(texto(doc, "numeroProcesso", "numeroCnj", "processo")),
    payload: doc,
  };
}

export function normalizar(doc: unknown): DocumentoNormalizado {
  const nome = texto(doc, "nome", "titulo", "descricao", "nomeArquivo");
  const tipoOrigem = texto(doc, "tipo", "tipoDocumento", "especie", "categoria");

  return {
    idExterno: String(
      texto(doc, "id", "idDocumento", "hash") ?? JSON.stringify(doc).slice(0, 120),
    ),
    numeroCnj: formatarCnj(texto(doc, "numeroProcesso", "numeroCnj", "processo")),
    nome,
    tipoOrigem,
    categoria: categorizar(nome, tipoOrigem),
    dataJuntada: data(doc, "dataJuntada", "dataHoraJuntada", "data", "dataCriacao"),
    texto: texto(doc, "texto", "textoExtraido", "conteudo", "content", "textoIntegral"),
    paginas: inteiro(doc, "paginas", "numeroPaginas"),
    viaOcr: Boolean(texto(doc, "ocr", "viaOcr", "fallbackOcr")),
    metadados: (doc && typeof doc === "object" ? { ...doc } : {}) as Record<string, unknown>,
  };
}

/**
 * Classifica o documento pela nomenclatura usada nos tribunais.
 *
 * A ordem importa: "laudo" é testado antes de "perícia" solta, e
 * "sentença" antes de "decisão", porque despachos costumam mencionar
 * as duas palavras.
 */
export function categorizar(
  nome?: string | null,
  tipo?: string | null,
): string | null {
  const t = `${nome ?? ""} ${tipo ?? ""}`.toLowerCase();
  if (!t.trim()) return null;

  const regras: [RegExp, string][] = [
    [/laudo|per[ií]cia m[eé]dica|per[ií]cia social|estudo social|vist[oa]ria/, "laudo"],
    [/senten[cç]a/, "sentenca"],
    [/ac[oó]rd[aã]o|voto/, "acordao"],
    [/peti[cç][aã]o inicial|inicial/, "inicial"],
    [/contesta[cç][aã]o|defesa/, "contestacao"],
    [/r[eé]plica|impugna[cç][aã]o [aà] contesta[cç][aã]o/, "replica"],
    [/impugna[cç][aã]o ao laudo|impugna[cç][aã]o do laudo/, "impugnacao_laudo"],
    [/recurso|apela[cç][aã]o|agravo|embargos/, "recurso"],
    [/quesito/, "quesitos"],
    [/decis[aã]o/, "decisao"],
    [/despacho/, "despacho"],
    [/procura[cç][aã]o/, "procuracao"],
  ];

  for (const [re, categoria] of regras) if (re.test(t)) return categoria;
  return "outros";
}
