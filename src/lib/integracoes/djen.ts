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

// ---------------------------------------------------------------------
// Cabeçalhos
// ---------------------------------------------------------------------
// O DJEN é consultado pelo navegador em comunica.pje.jus.br. Um cliente
// que não se parece com navegador — sem User-Agent, sem Accept-Language,
// sem Referer — costuma levar 403 antes mesmo de a consulta ser lida,
// porque quem responde é a proteção da borda, não a API.
//
// Nada aqui contorna autenticação: a consulta é pública. É só apresentar
// o cliente de forma reconhecível. DJEN_USER_AGENT permite trocar sem
// mexer no código.
const UA_PADRAO =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

function cabecalhos(): Record<string, string> {
  const token = process.env.DJEN_API_TOKEN;
  return {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "User-Agent": process.env.DJEN_USER_AGENT ?? UA_PADRAO,
    Referer: "https://comunica.pje.jus.br/",
    Origin: "https://comunica.pje.jus.br",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Resposta crua de uma chamada, com o suficiente para diagnosticar. */
export type RespostaDjen = {
  ok: boolean;
  status: number;
  /** URL chamada, para conferir o que de fato foi pedido. */
  url: string;
  /** Itens já desembrulhados, quando a resposta veio bem. */
  itens: unknown[];
  /** Total que o servidor diz existir, quando informa. */
  total: number | null;
  /** Início do corpo quando a resposta não foi OK — é o que explica o erro. */
  trecho?: string;
  /** Identifica quem respondeu: API ou proteção de borda. */
  servidor?: string;
};

/**
 * Uma chamada ao endpoint de consulta. Não lança: devolve o que houve.
 *
 * Erro de rede vira status 0 — assim o chamador trata tudo num lugar só,
 * e a mensagem que chega à tela diz o que aconteceu de verdade.
 */
async function pedir(params: URLSearchParams): Promise<RespostaDjen> {
  const url = `${BASE}/comunicacao?${params}`;

  let resposta: Response;
  try {
    resposta = await fetch(url, { headers: cabecalhos(), cache: "no-store" });
  } catch (erro) {
    return {
      ok: false,
      status: 0,
      url,
      itens: [],
      total: null,
      trecho: erro instanceof Error ? erro.message : "falha de rede",
    };
  }

  const servidor = resposta.headers.get("server") ?? undefined;

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    return {
      ok: false,
      status: resposta.status,
      url,
      itens: [],
      total: null,
      trecho: corpo.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300),
      servidor,
    };
  }

  const json = (await resposta.json().catch(() => null)) as unknown;
  const itens = Array.isArray(json)
    ? json
    : lista(json, "items", "content", "data", "comunicacoes", "resultado");
  const total =
    json && typeof json === "object" && !Array.isArray(json)
      ? Number((json as Record<string, unknown>).count ?? (json as Record<string, unknown>).total)
      : null;

  return {
    ok: true,
    status: resposta.status,
    url,
    itens,
    total: Number.isFinite(total) ? (total as number) : null,
    servidor,
  };
}

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

  const r = await pedir(params);
  if (!r.ok) throw new Error(explicar(r, "Confira OAB/UF e o intervalo de datas."));
  return r.itens;
}

/**
 * Transforma uma resposta ruim em texto que serve para agir.
 *
 * A versão anterior dizia "confira tribunal e datas" para qualquer 403 —
 * um palpite, e errado: 403 raramente tem a ver com o que foi consultado.
 * Aqui vai o status, quem respondeu e o que o corpo dizia.
 */
function explicar(r: RespostaDjen, dica?: string): string {
  if (r.status === 0) {
    return `Não foi possível falar com o DJEN: ${r.trecho ?? "falha de rede"}.`;
  }

  const partes = [`DJEN respondeu ${r.status}.`];

  if (r.status === 403) {
    partes.push(
      "Um 403 aqui costuma vir da proteção de borda do CNJ, não da consulta: " +
        "a requisição foi barrada antes de ser lida. Bloqueio por origem da " +
        "chamada é a causa mais comum quando o servidor fica fora do Brasil.",
    );
  } else if (r.status === 429) {
    partes.push("Consultas demais em pouco tempo. Espere alguns minutos.");
  } else if (r.status >= 500) {
    partes.push("A falha é do lado do CNJ. Tente de novo mais tarde.");
  } else if (dica) {
    partes.push(dica);
  }

  if (r.servidor) partes.push(`Respondeu: ${r.servidor}.`);
  if (r.trecho) partes.push(`Corpo: ${r.trecho}`);

  return partes.join(" ");
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

/**
 * Os jeitos de pedir a mesma coisa, do mais específico ao mais simples.
 *
 * Não há como saber daqui qual nome de parâmetro a API usa para o órgão,
 * nem se ela aceita uma varredura por tribunal. Em vez de apostar num
 * palpite e falhar inteiro, tenta-se em ordem e usa-se o primeiro que
 * responder. O recorte fino acontece depois, em `filtrar()`, sobre o que
 * voltou — então uma variante mais simples continua dando o mesmo
 * resultado final, só gastando mais tráfego.
 */
function variantes(c: ConsultaOrgaoDjen, pagina: number, porPagina: number) {
  const base = () => {
    const p = new URLSearchParams({
      dataDisponibilizacaoInicio: c.dataInicio,
      dataDisponibilizacaoFim: c.dataFim,
      pagina: String(pagina),
      itensPorPagina: String(porPagina),
    });
    return p;
  };

  const comTribunal = () => {
    const p = base();
    if (c.tribunal) p.set("siglaTribunal", c.tribunal.toUpperCase());
    return p;
  };

  const lista_: { nome: string; params: URLSearchParams }[] = [];

  if (c.orgao) {
    if (c.contendo) {
      const p = comTribunal();
      p.set("nomeOrgao", c.orgao);
      p.set("texto", c.contendo);
      lista_.push({ nome: "tribunal + nomeOrgao + texto", params: p });
    }
    const p2 = comTribunal();
    p2.set("nomeOrgao", c.orgao);
    lista_.push({ nome: "tribunal + nomeOrgao", params: p2 });

    const p3 = comTribunal();
    p3.set("orgaoJulgador", c.orgao);
    lista_.push({ nome: "tribunal + orgaoJulgador", params: p3 });
  }

  if (c.contendo && !c.orgao) {
    const p = comTribunal();
    p.set("texto", c.contendo);
    lista_.push({ nome: "tribunal + texto", params: p });
  }

  if (c.tribunal) lista_.push({ nome: "só tribunal + datas", params: comTribunal() });
  lista_.push({ nome: "só datas", params: base() });

  return lista_;
}

export type BuscaPorOrgao = {
  itens: unknown[];
  paginasLidas: number;
  totalBruto: number;
  /** Variante que a API aceitou — mostra qual filtro ela de fato entende. */
  varianteUsada: string;
  /** O que cada tentativa respondeu, para diagnóstico. */
  tentativas: { variante: string; status: number; itens: number }[];
};

export async function buscarPorOrgao(c: ConsultaOrgaoDjen): Promise<BuscaPorOrgao> {
  const paginas = Math.min(Math.max(c.paginas ?? 3, 1), 30);
  const porPagina = Math.min(c.itensPorPagina ?? 100, 100);

  // Página 1 descobre qual variante funciona; as demais repetem essa.
  const tentativas: { variante: string; status: number; itens: number }[] = [];
  let escolhida: { nome: string; resposta: RespostaDjen } | null = null;
  let ultima: RespostaDjen | null = null;

  for (const v of variantes(c, 1, porPagina)) {
    const r = await pedir(v.params);
    tentativas.push({ variante: v.nome, status: r.status, itens: r.itens.length });
    ultima = r;
    if (r.ok) {
      escolhida = { nome: v.nome, resposta: r };
      break;
    }
    // 403/401 é barreira: as outras variantes vão bater na mesma porta.
    // Só vale insistir quando a recusa foi da consulta, não do acesso.
    if (r.status === 403 || r.status === 401 || r.status === 0) break;
  }

  if (!escolhida) {
    throw new Error(explicar(ultima!, "Nenhuma forma de consulta foi aceita."));
  }

  const coletado: unknown[] = [...escolhida.resposta.itens];
  let lidas = 1;
  let totalBruto = escolhida.resposta.itens.length;

  if (escolhida.resposta.itens.length >= porPagina) {
    for (let pagina = 2; pagina <= paginas; pagina++) {
      const v = variantes(c, pagina, porPagina).find((x) => x.nome === escolhida!.nome);
      if (!v) break;
      const r = await pedir(v.params);
      if (!r.ok) break;
      lidas++;
      totalBruto += r.itens.length;
      coletado.push(...r.itens);
      if (r.itens.length < porPagina) break;
    }
  }

  return {
    itens: coletado,
    paginasLidas: lidas,
    totalBruto,
    varianteUsada: escolhida.nome,
    tentativas,
  };
}

/**
 * Bate na API com uma consulta mínima e conta o que aconteceu.
 *
 * Existe porque 403 não diz nada sozinho. Uma execução daqui, feita do
 * servidor que roda o sistema, separa as três causas possíveis: consulta
 * malformada, endereço errado, ou acesso barrado na borda.
 */
export async function diagnosticarConexao(): Promise<{
  base: string;
  identificacao: string;
  testes: {
    nome: string;
    url: string;
    status: number;
    itens: number;
    servidor?: string;
    corpo?: string;
  }[];
  leitura: string;
}> {
  const hoje = new Date();
  const ate = hoje.toISOString().slice(0, 10);
  const de = new Date(hoje.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);

  const casos: { nome: string; params: URLSearchParams }[] = [
    {
      nome: "3 dias, sem filtro nenhum",
      params: new URLSearchParams({
        dataDisponibilizacaoInicio: de,
        dataDisponibilizacaoFim: ate,
        pagina: "1",
        itensPorPagina: "1",
      }),
    },
    {
      nome: "3 dias, só siglaTribunal=TRF3",
      params: new URLSearchParams({
        dataDisponibilizacaoInicio: de,
        dataDisponibilizacaoFim: ate,
        siglaTribunal: "TRF3",
        pagina: "1",
        itensPorPagina: "1",
      }),
    },
    {
      nome: "sem data nenhuma",
      params: new URLSearchParams({ pagina: "1", itensPorPagina: "1" }),
    },
  ];

  const testes = [];
  for (const caso of casos) {
    const r = await pedir(caso.params);
    testes.push({
      nome: caso.nome,
      url: r.url,
      status: r.status,
      itens: r.itens.length,
      servidor: r.servidor,
      corpo: r.trecho,
    });
  }

  const algumOk = testes.some((t) => t.status === 200);
  const todos403 = testes.every((t) => t.status === 403);
  const rede = testes.every((t) => t.status === 0);

  const leitura = rede
    ? "Nenhuma chamada saiu: o servidor não alcança comunicaapi.pje.jus.br."
    : algumOk
      ? "A API responde. O 403 anterior veio da combinação de filtros, não do acesso — " +
        "veja acima qual consulta passou e use esse recorte."
      : todos403
        ? "Todas as chamadas levaram 403, inclusive a mais simples possível. " +
          "Não é a consulta: o acesso está sendo barrado antes. A causa mais " +
          "provável é a origem da chamada — o CNJ restringe consulta vinda de " +
          "servidor fora do Brasil, e a Vercel roda nos Estados Unidos por " +
          "padrão. Em Vercel → Settings → Functions, mude a região para " +
          "São Paulo (gru1) e publique de novo."
        : "A API recusou as chamadas, mas não com 403. Veja o corpo de cada " +
          "resposta acima: ele costuma dizer o que faltou.";

  return {
    base: BASE,
    identificacao: process.env.DJEN_USER_AGENT ?? UA_PADRAO,
    testes,
    leitura,
  };
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
