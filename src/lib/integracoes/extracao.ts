/**
 * Extração de perito e conclusão pericial a partir do texto do laudo.
 *
 * ---------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------
 * Nenhuma das três fontes devolve "conclusão pericial" como campo. O
 * DJEN traz intimações, o DataJud traz códigos de movimento, e o PDPJ
 * traz o laudo como texto corrido — muitas vezes vindo de OCR.
 *
 * Como a estatística inteira do sistema se apoia nesse campo, a extração
 * automática NÃO é tratada como verdade. Ela produz um palpite com grau
 * de confiança, o laudo entra marcado como `extraido_automatico`, e fica
 * fora das contas até alguém confirmar na tela de revisão.
 *
 * Um laudo classificado errado como "sem incapacidade" não gera só uma
 * linha errada: distorce a taxa de êxito do perito, que é justamente o
 * número usado para decidir se vale impugnar.
 *
 * ---------------------------------------------------------------------
 * COMO FUNCIONA
 * ---------------------------------------------------------------------
 * Heurística sobre a seção de conclusão do laudo, que é onde o perito
 * responde de forma direta. Procura primeiro o bloco "CONCLUSÃO" e só
 * depois cai para o texto inteiro, porque a fundamentação costuma citar
 * hipóteses que não são a resposta final ("o autor alega incapacidade
 * total" não é conclusão).
 */

import type { ConclusaoPericial } from "@/lib/labels";

export type ExtracaoLaudo = {
  conclusao: ConclusaoPericial | null;
  confianca: number; // 0 a 1
  trecho: string | null;
  perito: string | null;
  cidPrincipal: string | null;
  cids: string[];
  dataLaudo: string | null;
};

/** Normaliza para comparação: minúsculas, sem acento, espaços colapsados. */
function chave(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Isola a seção de conclusão. Sem ela, a taxa de acerto cai muito: a
 * fundamentação menciona incapacidade o tempo todo sem estar concluindo.
 */
function secaoConclusao(texto: string): { trecho: string; achouSecao: boolean } {
  const marcadores = [
    /\bconclus[aã]o\b/i,
    /\bconclus[oõ]es\b/i,
    /\bresposta aos quesitos\b/i,
    /\bparecer (t[eé]cnico )?conclusivo\b/i,
    /\bdiscuss[aã]o e conclus[aã]o\b/i,
  ];

  for (const m of marcadores) {
    const achou = texto.match(m);
    if (achou?.index !== undefined) {
      // A conclusão costuma caber em poucos parágrafos.
      return { trecho: texto.slice(achou.index, achou.index + 3000), achouSecao: true };
    }
  }
  // Sem seção marcada, o fim do documento é o palpite menos ruim.
  return { trecho: texto.slice(-3000), achouSecao: false };
}

/**
 * Regras de classificação, testadas em ordem. A primeira que casar vence,
 * então as mais específicas vêm antes.
 */
const REGRAS: {
  conclusao: ConclusaoPericial;
  padroes: RegExp[];
  peso: number;
}[] = [
  {
    conclusao: "sem_incapacidade",
    peso: 0.9,
    padroes: [
      /\b(nao|inexiste|ausencia de|nao ha|nao existe)\s+(ha\s+)?incapacidade/,
      /\bapto\s+(para|ao)\s+(o\s+)?(trabalho|labor|suas atividades)/,
      /\bcapaz\s+para\s+(o\s+)?(trabalho|suas atividades habituais)/,
      /\bnao\s+(se\s+)?constatou\s+incapacidade/,
      /\bcapacidade\s+laborativa\s+preservada/,
    ],
  },
  {
    conclusao: "sem_impedimento",
    peso: 0.9,
    padroes: [
      /\b(nao|inexiste|ausencia de)\s+(ha\s+)?impedimento\s+de\s+longo\s+prazo/,
      /\bnao\s+(se\s+)?caracteriza\s+(a\s+)?deficiencia/,
      /\bnao\s+preenche\s+.{0,40}deficiencia/,
    ],
  },
  {
    conclusao: "impedimento_longo_prazo",
    peso: 0.85,
    padroes: [
      /\bimpedimento\s+de\s+longo\s+prazo/,
      /\bdeficiencia\s+.{0,30}(grave|moderada|de longo prazo)/,
      /\bimpedimentos?\s+de\s+natureza\s+(fisica|mental|intelectual|sensorial)/,
    ],
  },
  {
    conclusao: "incapacidade_total_permanente",
    peso: 0.9,
    padroes: [
      /\bincapacidade\s+total\s+e?\s*(permanente|definitiva)/,
      /\bincapacidade\s+(permanente|definitiva)\s+e?\s*total/,
      /\btotalmente\s+e\s+permanentemente\s+incapaz/,
      /\bincapacidade\s+omniprofissional/,
      /\binsuscetivel\s+de\s+reabilitacao.{0,60}total/,
    ],
  },
  {
    conclusao: "incapacidade_parcial_permanente",
    peso: 0.9,
    padroes: [
      /\bincapacidade\s+parcial\s+e?\s*(permanente|definitiva)/,
      /\bincapacidade\s+(permanente|definitiva)\s+e?\s*parcial/,
      /\bsequela\s+.{0,40}(definitiva|permanente)/,
      /\breducao\s+da\s+capacidade\s+laborativa\s+.{0,30}(permanente|definitiva)/,
    ],
  },
  {
    conclusao: "incapacidade_total_temporaria",
    peso: 0.9,
    padroes: [
      /\bincapacidade\s+total\s+e?\s*(temporaria|transitoria)/,
      /\bincapacidade\s+(temporaria|transitoria)\s+e?\s*total/,
      /\btemporariamente\s+incapaz\s+.{0,30}total/,
    ],
  },
  {
    conclusao: "incapacidade_parcial_temporaria",
    peso: 0.9,
    padroes: [
      /\bincapacidade\s+parcial\s+e?\s*(temporaria|transitoria)/,
      /\bincapacidade\s+(temporaria|transitoria)\s+e?\s*parcial/,
    ],
  },
  {
    conclusao: "inconclusivo",
    peso: 0.7,
    padroes: [
      /\b(nao|impossivel)\s+.{0,30}concluir/,
      /\bnecessita\s+de\s+(exames|avaliacao)\s+complementar/,
      /\bprejudicada\s+a\s+avaliacao/,
      /\binconclusiv[oa]/,
    ],
  },
];

/** Fallback genérico, quando só dá para afirmar que há incapacidade. */
const GENERICO_COM_INCAPACIDADE = [
  /\b(ha|existe|constatou-se|conclui-se pela)\s+incapacidade/,
  /\bincapaz\s+para\s+(o\s+)?(trabalho|suas atividades)/,
];

export function extrairDoLaudo(textoLaudo: string | null | undefined): ExtracaoLaudo {
  const vazio: ExtracaoLaudo = {
    conclusao: null,
    confianca: 0,
    trecho: null,
    perito: null,
    cidPrincipal: null,
    cids: [],
    dataLaudo: null,
  };

  if (!textoLaudo || textoLaudo.trim().length < 80) return vazio;

  const { trecho, achouSecao } = secaoConclusao(textoLaudo);
  const alvo = chave(trecho);

  let conclusao: ConclusaoPericial | null = null;
  let confianca = 0;

  for (const regra of REGRAS) {
    if (regra.padroes.some((p) => p.test(alvo))) {
      conclusao = regra.conclusao;
      confianca = regra.peso;
      break;
    }
  }

  if (!conclusao && GENERICO_COM_INCAPACIDADE.some((p) => p.test(alvo))) {
    // Sabe-se que há incapacidade, mas não o grau. Fica no tipo mais
    // comum em benefício por incapacidade, com confiança baixa — vai
    // exigir conferência de qualquer jeito.
    conclusao = "incapacidade_total_temporaria";
    confianca = 0.35;
  }

  // Sem a seção de conclusão delimitada, o palpite vale menos.
  if (!achouSecao) confianca *= 0.6;

  // OCR ruim costuma vir com muito caractere estranho; desconta.
  const sujeira = (textoLaudo.match(/[^\p{L}\p{N}\s.,;:()\-/%º°ª]/gu) ?? []).length;
  if (sujeira / textoLaudo.length > 0.04) confianca *= 0.7;

  const cids = extrairCids(textoLaudo);

  return {
    conclusao,
    confianca: Math.round(Math.min(confianca, 0.95) * 100) / 100,
    trecho: trecho.slice(0, 800).trim(),
    perito: extrairPerito(textoLaudo),
    cidPrincipal: cids[0] ?? null,
    cids,
    dataLaudo: extrairData(textoLaudo),
  };
}

/**
 * Nome do perito. Procura os rótulos usuais de assinatura; devolve null
 * em vez de arriscar, porque criar perito errado polui o cadastro e
 * espalha estatística em duplicidade.
 */
export function extrairPerito(texto: string): string | null {
  // As classes de caractere são escritas à mão em vez de usar a flag `i`
  // porque o nome capturado precisa começar em maiúscula — e a flag `i`
  // faria \p{Lu} aceitar minúsculas também, deixando entrar qualquer
  // palavra solta.
  const perit = "[Pp]erit[oa]";
  const dr = "(?:[Dd][Rr][AaOo]?\\.?\\s*)?";
  const nomeCap = "([\\p{Lu}][\\p{L}'.\\- ]{5,60})";

  const padroes = [
    // "Perito Médico Judicial: Dr. Fulano de Tal"
    new RegExp(
      `${perit}\\s*(?:[Mm][ée]dic[oa]\\s*)?(?:[Jj]udicial\\s*)?[:\\-—]\\s*${dr}${nomeCap}`,
      "u",
    ),
    // "Nome do perito: Fulano de Tal"
    new RegExp(`[Nn]ome\\s+d[oa]\\s+${perit}\\s*[:\\-—]\\s*${dr}${nomeCap}`, "u"),
    // Assinatura: nome numa linha, cargo na seguinte.
    new RegExp(`${dr}${nomeCap}\\s*[\\n\\r]+\\s*${perit}`, "u"),
  ];

  for (const p of padroes) {
    const m = texto.match(p);
    if (!m?.[1]) continue;

    const nome = m[1].replace(/\s+/g, " ").replace(/[.,;:\-]+$/, "").trim();

    // Rejeita capturas que na verdade pegaram o rótulo seguinte.
    if (/\d/.test(nome)) continue;
    if (/\b(data|processo|autor|r[eé]u|laudo|per[ií]cia|crm)\b/i.test(nome)) continue;
    if (nome.split(" ").length < 2 || nome.length > 60) continue;

    return nome;
  }
  return null;
}

/** Códigos CID-10 no formato letra + 2 dígitos, com subcategoria opcional. */
export function extrairCids(texto: string): string[] {
  const achados = texto.match(/\b([A-TV-Z]\d{2}(?:\.\d{1,2})?)\b/g) ?? [];
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const c of achados) {
    const up = c.toUpperCase();
    if (!vistos.has(up)) {
      vistos.add(up);
      resultado.push(up);
    }
    if (resultado.length >= 8) break;
  }
  return resultado;
}

// =====================================================================
// Sentenças e acórdãos
// =====================================================================
// Sem isto, a importação do PDPJ traria o laudo mas não o desfecho — e o
// cruzamento "conclusão pericial × resultado", que é o objetivo do
// sistema, não ganharia nenhum ponto novo.
//
// Mesma disciplina do laudo: é palpite com confiança, entra marcado como
// extraído e fica fora das contas até conferência.
// =====================================================================

export type ResultadoJulgamento =
  | "procedente"
  | "parcialmente_procedente"
  | "improcedente"
  | "extinto_sem_merito"
  | "homologacao_acordo"
  | "provido"
  | "parcialmente_provido"
  | "desprovido"
  | "nao_conhecido";

export type ExtracaoDecisao = {
  resultado: ResultadoJulgamento | null;
  confianca: number;
  trecho: string | null;
  dataDecisao: string | null;
};

/**
 * A ordem é essencial: "parcialmente procedente" tem de ser testado
 * antes de "procedente", senão toda parcial vira total.
 */
const REGRAS_RESULTADO: { resultado: ResultadoJulgamento; padroes: RegExp[]; peso: number }[] = [
  {
    resultado: "parcialmente_procedente",
    peso: 0.92,
    padroes: [
      /julgo\s+(o\s+pedido\s+)?parcialmente\s+procedente/,
      /julgo\s+parcialmente\s+procedentes?\s+os?\s+pedidos?/,
      /procedente\s+em\s+parte\s+o\s+pedido/,
    ],
  },
  {
    resultado: "parcialmente_provido",
    peso: 0.92,
    padroes: [
      /dou\s+parcial\s+provimento/,
      /(dou|deu-se)\s+provimento\s+parcial/,
      /recurso\s+parcialmente\s+provido/,
    ],
  },
  {
    resultado: "homologacao_acordo",
    peso: 0.9,
    padroes: [/homologo\s+o\s+acordo/, /homologa[cç][aã]o\s+d[eo]\s+acordo/, /homologo\s+a\s+transa[cç][aã]o/],
  },
  {
    resultado: "extinto_sem_merito",
    peso: 0.9,
    padroes: [
      /extingo\s+o\s+(processo|feito)\s+sem\s+(resolu[cç][aã]o|julgamento)\s+d[eo]\s+m[eé]rito/,
      /sem\s+resolu[cç][aã]o\s+d[eo]\s+m[eé]rito/,
      /art(igo)?\.?\s*485\s+d[oe]\s+cpc/,
    ],
  },
  {
    resultado: "improcedente",
    peso: 0.92,
    padroes: [
      /julgo\s+(o\s+pedido\s+)?improcedente/,
      /julgo\s+improcedentes?\s+os?\s+pedidos?/,
      /improced[eê]ncia\s+d[oe]\s+pedido/,
    ],
  },
  {
    resultado: "procedente",
    peso: 0.9,
    padroes: [
      /julgo\s+(o\s+pedido\s+)?procedente/,
      /julgo\s+procedentes?\s+os?\s+pedidos?/,
      /condeno\s+o\s+inss\s+a\s+(conceder|implantar|restabelecer)/,
    ],
  },
  {
    resultado: "desprovido",
    peso: 0.9,
    padroes: [/nego\s+provimento/, /recurso\s+(im)?desprovido/, /nega-se\s+provimento/],
  },
  {
    resultado: "provido",
    peso: 0.9,
    padroes: [/dou\s+provimento/, /recurso\s+provido/, /deu-se\s+provimento/],
  },
  {
    resultado: "nao_conhecido",
    peso: 0.85,
    padroes: [/n[aã]o\s+conhe[cç]o\s+d[oe]\s+recurso/, /recurso\s+n[aã]o\s+conhecido/],
  },
];

/** Isola o dispositivo, que é onde o juízo decide de fato. */
function secaoDispositivo(texto: string): { trecho: string; achou: boolean } {
  const marcadores = [
    /\bdispositivo\b/i,
    /\bante\s+o\s+exposto\b/i,
    /\bdiante\s+do\s+exposto\b/i,
    /\bisso\s+posto\b/i,
    /\bpelo\s+exposto\b/i,
    /\bem\s+face\s+do\s+exposto\b/i,
  ];
  for (const m of marcadores) {
    const achou = texto.match(m);
    if (achou?.index !== undefined) {
      return { trecho: texto.slice(achou.index, achou.index + 2500), achou: true };
    }
  }
  return { trecho: texto.slice(-2500), achou: false };
}

export function extrairDaDecisao(
  textoDecisao: string | null | undefined,
): ExtracaoDecisao {
  const vazio: ExtracaoDecisao = {
    resultado: null,
    confianca: 0,
    trecho: null,
    dataDecisao: null,
  };
  if (!textoDecisao || textoDecisao.trim().length < 40) return vazio;

  const { trecho, achou } = secaoDispositivo(textoDecisao);
  const alvo = chave(trecho);

  let resultado: ResultadoJulgamento | null = null;
  let confianca = 0;

  for (const regra of REGRAS_RESULTADO) {
    if (regra.padroes.some((p) => p.test(alvo))) {
      resultado = regra.resultado;
      confianca = regra.peso;
      break;
    }
  }

  if (!achou) confianca *= 0.7;

  return {
    resultado,
    confianca: Math.round(Math.min(confianca, 0.95) * 100) / 100,
    trecho: trecho.slice(0, 800).trim(),
    dataDecisao: extrairData(textoDecisao),
  };
}

function extrairData(texto: string): string | null {
  const m = texto.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (!m) return null;
  const [, d, mes, a] = m;
  const ano = Number(a);
  if (ano < 1990 || ano > new Date().getFullYear() + 1) return null;
  return `${a}-${mes}-${d}`;
}
