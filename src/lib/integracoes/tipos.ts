/**
 * Contratos internos da ingestão.
 *
 * Cada fonte externa é reduzida a uma destas formas antes de tocar o
 * banco. O resto do sistema não sabe que DJEN, DataJud ou PDPJ existem —
 * conhece só estes três tipos.
 */

export type Fonte = "djen" | "datajud" | "pdpj" | "manual";

/** Um registro cru, como veio da origem, antes de qualquer normalização. */
export type Bruto = {
  fonte: Fonte;
  tipo: "comunicacao" | "processo" | "documento";
  idExterno: string;
  numeroCnj?: string | null;
  payload: unknown;
};

/** Comunicação publicada no DJEN. */
export type PublicacaoNormalizada = {
  idExterno: string;
  numeroCnj?: string | null;
  tribunal?: string | null;
  orgao?: string | null;
  tipoComunicacao?: string | null;
  dataDisponibilizacao?: string | null;
  dataPublicacao?: string | null;
  teor?: string | null;
  destinatarios: unknown[];
  advogados: unknown[];
  numeroOab?: string | null;
  ufOab?: string | null;
  linkCertidao?: string | null;
};

/** Processo e sua linha do tempo, vindos do DataJud. */
export type ProcessoNormalizado = {
  idExterno: string;
  numeroCnj: string;
  tribunalSigla?: string | null;
  grau?: string | null;
  classeCnj?: string | null;
  codigoClasse?: number | null;
  assuntos: unknown[];
  orgaoJulgadorNome?: string | null;
  dataDistribuicao?: string | null;
  movimentos: MovimentoNormalizado[];
};

export type MovimentoNormalizado = {
  codigo?: number | null;
  nome?: string | null;
  dataHora?: string | null;
  complementos: unknown[];
};

/** Documento do processo, vindo do DataLake PDPJ. */
export type DocumentoNormalizado = {
  idExterno: string;
  numeroCnj?: string | null;
  nome?: string | null;
  tipoOrigem?: string | null;
  categoria?: string | null;
  dataJuntada?: string | null;
  texto?: string | null;
  paginas?: number | null;
  viaOcr?: boolean;
  metadados?: Record<string, unknown>;
};

// ---------------------------------------------------------------------
// Utilitários de leitura tolerante
// ---------------------------------------------------------------------

/**
 * Lê um campo tentando vários nomes, porque as APIs do Judiciário não são
 * consistentes entre si nem ao longo do tempo (numeroProcesso x
 * numero_processo x numeroCnj). Aceita caminho com ponto.
 */
export function campo(obj: unknown, ...caminhos: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  for (const caminho of caminhos) {
    let atual: unknown = obj;
    for (const parte of caminho.split(".")) {
      if (atual && typeof atual === "object" && parte in (atual as object)) {
        atual = (atual as Record<string, unknown>)[parte];
      } else {
        atual = undefined;
        break;
      }
    }
    if (atual !== undefined && atual !== null && atual !== "") return atual;
  }
  return undefined;
}

export function texto(obj: unknown, ...caminhos: string[]): string | null {
  const v = campo(obj, ...caminhos);
  if (v === undefined || v === null) return null;
  return typeof v === "string" ? v : String(v);
}

export function inteiro(obj: unknown, ...caminhos: string[]): number | null {
  const v = campo(obj, ...caminhos);
  if (v === undefined || v === null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\D/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function lista(obj: unknown, ...caminhos: string[]): unknown[] {
  const v = campo(obj, ...caminhos);
  if (Array.isArray(v)) return v;
  return v === undefined || v === null ? [] : [v];
}

/** Normaliza data para ISO (YYYY-MM-DD), aceitando os formatos usuais. */
export function data(obj: unknown, ...caminhos: string[]): string | null {
  const v = texto(obj, ...caminhos);
  if (!v) return null;

  // DD/MM/AAAA
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  // AAAA-MM-DD ou ISO completo
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // AAAAMMDD (formato usado em alguns campos do DataJud)
  const compacto = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compacto) return `${compacto[1]}-${compacto[2]}-${compacto[3]}`;

  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Timestamp ISO completo, para movimentos. */
export function instante(obj: unknown, ...caminhos: string[]): string | null {
  const v = texto(obj, ...caminhos);
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  const dia = data(obj, ...caminhos);
  return dia ? `${dia}T00:00:00.000Z` : null;
}

/** Só os dígitos do número CNJ, para comparar sem depender da máscara. */
export function digitosCnj(valor?: string | null): string | null {
  if (!valor) return null;
  const d = valor.replace(/\D/g, "");
  return d.length === 20 ? d : null;
}

/** Aplica a máscara NNNNNNN-DD.AAAA.J.TT.OOOO. */
export function formatarCnj(valor?: string | null): string | null {
  const d = digitosCnj(valor);
  if (!d) return valor ?? null;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

// ---------------------------------------------------------------------
// Diagnóstico de contrato
// ---------------------------------------------------------------------
// Como as APIs do Judiciário não têm contrato estável e nem sempre são
// documentadas com precisão, o modo --dry-run compara o que a API mandou
// com o que o normalizador consumiu. Assim uma única execução na máquina
// certa revela os nomes reais dos campos, sem precisar ler swagger.
// ---------------------------------------------------------------------

export type Diagnostico = {
  camposRecebidos: string[];
  camposUsados: string[];
  camposIgnorados: string[];
  camposVaziosNoResultado: string[];
};

/** Todas as chaves presentes nos itens, inclusive aninhadas (1 nível). */
export function chavesDe(itens: unknown[], limite = 20): string[] {
  const chaves = new Set<string>();
  for (const item of itens.slice(0, limite)) {
    if (!item || typeof item !== "object") continue;
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      chaves.add(k);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const k2 of Object.keys(v as Record<string, unknown>)) {
          chaves.add(`${k}.${k2}`);
        }
      }
    }
  }
  return [...chaves].sort();
}

/**
 * Compara o payload cru com o objeto normalizado e aponta:
 *  - o que a API mandou e o normalizador ignorou (pode ser dado útil perdido)
 *  - o que o normalizador tentou preencher e saiu nulo (mapeamento errado)
 */
export function diagnosticar(
  brutos: unknown[],
  normalizados: Record<string, unknown>[],
  caminhosConhecidos: string[],
): Diagnostico {
  const recebidos = chavesDe(brutos);
  const usados = new Set(caminhosConhecidos);

  const vazios = new Set<string>();
  for (const n of normalizados) {
    for (const [k, v] of Object.entries(n)) {
      if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) {
        vazios.add(k);
      }
    }
  }
  // Um campo só é problema se saiu vazio em TODAS as amostras.
  for (const n of normalizados) {
    for (const [k, v] of Object.entries(n)) {
      if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) {
        vazios.delete(k);
      }
    }
  }

  return {
    camposRecebidos: recebidos,
    camposUsados: [...usados].sort(),
    camposIgnorados: recebidos.filter((c) => !usados.has(c)),
    camposVaziosNoResultado: [...vazios].sort(),
  };
}

// ---------------------------------------------------------------------
// Descoberta do tribunal a partir do número CNJ
// ---------------------------------------------------------------------
// O formato NNNNNNN-DD.AAAA.J.TR.OOOO carrega o segmento (J) e o tribunal
// (TR). Isso permite ao coletor descobrir sozinho qual índice do DataJud
// consultar para cada processo, em vez de exigir que se informe o
// tribunal a cada chamada.
//
// Justiça Federal e do Trabalho são mecânicas (TR = número do TRF/TRT).
// A Justiça Estadual usa a tabela de códigos da Resolução 65 do CNJ.
// ---------------------------------------------------------------------

/** Códigos TR da Justiça Estadual (segmento 8). */
const TJ_POR_CODIGO: Record<string, string> = {
  "01": "tjac", "02": "tjal", "03": "tjap", "04": "tjam", "05": "tjba",
  "06": "tjce", "07": "tjdft", "08": "tjes", "09": "tjgo", "10": "tjma",
  "11": "tjmt", "12": "tjms", "13": "tjmg", "14": "tjpa", "15": "tjpb",
  "16": "tjpr", "17": "tjpe", "18": "tjpi", "19": "tjrj", "20": "tjrn",
  "21": "tjrs", "22": "tjro", "23": "tjrr", "24": "tjsc", "25": "tjse",
  "26": "tjsp", "27": "tjto",
};

/**
 * Descobre o índice do DataJud a partir do número CNJ.
 * Devolve null quando não souber — melhor falhar explicitamente do que
 * consultar o índice errado e concluir que o processo não existe.
 */
export function tribunalDoCnj(numeroCnj: string): string | null {
  const d = numeroCnj.replace(/\D/g, "");
  if (d.length !== 20) return null;

  const segmento = d.slice(13, 14);
  const tr = d.slice(14, 16);

  switch (segmento) {
    case "1":
      return "stf";
    case "3":
      return "stj";
    case "4": {
      // TRF1 a TRF6.
      const n = Number(tr);
      return n >= 1 && n <= 6 ? `trf${n}` : null;
    }
    case "5": {
      // TRT1 a TRT24; o código 00 designa o TST.
      const n = Number(tr);
      if (n === 0) return "tst";
      return n >= 1 && n <= 24 ? `trt${n}` : null;
    }
    case "6":
      return Number(tr) === 0 ? "tse" : null;
    case "7":
      return "stm";
    case "8":
      return TJ_POR_CODIGO[tr] ?? null;
    default:
      return null;
  }
}

/** Minúsculas, sem acento, espaços colapsados — para comparação. */
export function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Um teor só interessa como sentença se de fato contiver o julgamento.
 * Intimação de despacho e ato ordinatório entram no mesmo diário e
 * precisam ficar de fora, senão a estatística conta expediente como
 * decisão.
 */
const VERBO_DE_DECISAO =
  /\b(julgo|julga-se|homologo|extingo|dou provimento|nego provimento|condeno)\b/;
const MARCADOR_DE_DISPOSITIVO =
  /\b(ante o exposto|diante do exposto|isso posto|pelo exposto|dispositivo|em face do exposto)\b/;

export function pareceDecisao(teor: string | null | undefined): boolean {
  return motivoNaoParecerDecisao(teor) === null;
}

/**
 * Por que uma publicação não passou no filtro de sentença — ou null se
 * passou.
 *
 * Existe para a tela poder mostrar o descarte em vez de só escondê-lo.
 * Um filtro que recusa sem dizer o motivo deixa quem está usando sem
 * saber se o tribunal publica só aviso ou se o filtro é que está
 * apertado demais, e essas duas situações pedem providências opostas.
 */
export function motivoNaoParecerDecisao(
  teor: string | null | undefined,
): string | null {
  if (!teor) return "publicação sem teor";
  if (teor.length < 200) return `teor curto demais (${teor.length} caracteres)`;

  const t = normalizarTexto(teor);
  if (!VERBO_DE_DECISAO.test(t)) {
    return "sem verbo de decisão (julgo, homologo, extingo, dou provimento…)";
  }
  if (!MARCADOR_DE_DISPOSITIVO.test(t)) {
    return "sem marcador de dispositivo (ante o exposto, pelo exposto…)";
  }
  return null;
}
