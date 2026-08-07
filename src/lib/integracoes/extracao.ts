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

// =====================================================================
// Divisão da sentença em relatório, fundamentação e dispositivo
// =====================================================================
// Ler uma sentença inteira num bloco só serve para conferir; para
// estudar como o juízo pensa, o que interessa é a fundamentação — e ela
// precisa estar separada do relatório (que só repete o pedido) e do
// dispositivo (que só anuncia o resultado).
//
// A divisão é feita na leitura, não na gravação: o texto publicado
// continua sendo a verdade guardada, e melhorar o reconhecimento não
// exige reprocessar nada.
// =====================================================================

export type PartesSentenca = {
  /** Autuação, partes, número — o que vem antes do relatório. */
  cabecalho: string | null;
  relatorio: string | null;
  fundamentacao: string | null;
  dispositivo: string | null;
  /** Falso quando o texto não deixou reconhecer as divisões. */
  dividida: boolean;
  /**
   * Falso quando não havia marcador forte separando relatório de
   * fundamentação — nesse caso os dois vêm juntos em `fundamentacao`.
   */
  relatorioSeparado: boolean;
};

/**
 * Marcadores que separam o relatório da fundamentação.
 *
 * Todos são FORTES de propósito: só entram expressões que não aparecem
 * no meio de uma citação. "Mérito" e "fundamentação" soltos já estiveram
 * nesta lista e cortavam a peça no lugar errado — uma sentença
 * previdenciária diz "sem resolução do mérito" dentro de ementa citada
 * antes de chegar ao próprio mérito. Por isso essas duas só valem como
 * título de seção, sozinhas na linha.
 */
const FIM_DO_RELATORIO: { re: RegExp; titulo: boolean }[] = [
  { re: /é\s+o\s+(?:breve\s+|sucinto\s+|conciso\s+)?relat[óo]rio/i, titulo: false },
  { re: /relat[óo]rio\s+dispensado/i, titulo: false },
  { re: /dispensad[oa]\s+(?:o\s+)?relat[óo]rio/i, titulo: false },
  {
    re: /^\s*(?:i{1,3}\s*[-–.)]\s*)?(?:d[ao]\s+)?fundamenta[çc][ãa]o\s*[:.]?\s*$/im,
    titulo: true,
  },
  { re: /^\s*(?:i{1,3}\s*[-–.)]\s*)?(?:d[ao]\s+)?m[ée]rito\s*[:.]?\s*$/im, titulo: true },
  { re: /\bfundamento\s+e\s+decido\b/i, titulo: false },
  { re: /\bpasso\s+a\s+decidir\b/i, titulo: false },
  { re: /(?:^|[.;]\s)\s*decido\s*[.:]/i, titulo: false },
];

/**
 * Onde começa o dispositivo.
 *
 * A busca é pela ÚLTIMA ocorrência: "ante o exposto" aparece dentro de
 * acórdão transcrito com frequência, e o dispositivo de verdade é sempre
 * o último.
 */
const INICIO_DO_DISPOSITIVO = [
  /\bante\s+o\s+exposto\b/i,
  /\bdiante\s+do\s+exposto\b/i,
  /\bisso\s+posto\b/i,
  /\bisto\s+posto\b/i,
  /\bpelo\s+exposto\b/i,
  /\bdo\s+exposto\b/i,
  /\bem\s+face\s+do\s+exposto\b/i,
  /\bpor\s+todo\s+o\s+exposto\b/i,
  /^\s*(?:i{1,3}\s*[-–.)]\s*)?dispositivo\s*[:.]?\s*$/im,
];

/** Usado só quando nenhum marcador de dispositivo aparece. */
const DISPOSITIVO_IMPLICITO = [
  /\bjulgo\s+(?:extinto|procedente|improcedente|parcialmente)/i,
  /\bdefiro\s+o\s+pedido\b/i,
  /\bindefiro\s+o\s+pedido\b/i,
];

/** Onde o relatório começa, quando há cabeçalho de autuação antes dele. */
const INICIO_DO_RELATORIO = [
  /^\s*(?:i\s*[-–.)]\s*)?relat[óo]rio\s*[:.]?\s*$/im,
  /\btrata-se\s+de\b/i,
  /\bcuida-se\s+de\b/i,
  /\bvistos[,.\s]/i,
];

/** Última ocorrência de um dos padrões. */
function ultimaOcorrencia(texto: string, padroes: RegExp[]): number {
  let melhor = -1;
  for (const p of padroes) {
    const re = new RegExp(p.source, p.flags.includes("g") ? p.flags : `${p.flags}g`);
    for (const m of texto.matchAll(re)) {
      if (m.index !== undefined && m.index > melhor) melhor = m.index;
    }
  }
  return melhor;
}

/** Primeiro marcador de fim de relatório antes do dispositivo. */
function primeiroCorte(
  texto: string,
  ate: number,
): { indice: number; titulo: boolean } | null {
  let melhor: { indice: number; titulo: boolean } | null = null;
  const janela = texto.slice(0, ate);
  for (const { re, titulo } of FIM_DO_RELATORIO) {
    const m = janela.match(re);
    if (m?.index !== undefined && (melhor === null || m.index < melhor.indice)) {
      melhor = { indice: m.index, titulo };
    }
  }
  return melhor;
}

function primeiraOcorrencia(texto: string, padroes: RegExp[], ate: number): number {
  let melhor = -1;
  const janela = ate > 0 ? texto.slice(0, ate) : texto;
  for (const p of padroes) {
    const m = janela.match(p);
    if (m?.index !== undefined && (melhor === -1 || m.index < melhor)) melhor = m.index;
  }
  return melhor;
}

const limpar = (s: string): string | null => {
  const t = s.trim();
  return t.length > 0 ? t : null;
};

export function dividirSentenca(
  teor: string | null | undefined,
): PartesSentenca {
  const vazio: PartesSentenca = {
    cabecalho: null,
    relatorio: null,
    fundamentacao: null,
    dispositivo: null,
    dividida: false,
    relatorioSeparado: false,
  };
  if (!teor || teor.trim().length < 120) return vazio;

  const texto = teor.trim();

  let inicioDispositivo = ultimaOcorrencia(texto, INICIO_DO_DISPOSITIVO);
  if (inicioDispositivo < 0) {
    inicioDispositivo = ultimaOcorrencia(texto, DISPOSITIVO_IMPLICITO);
  }

  // Sem dispositivo não há divisão confiável: é o único ponto que se
  // reconhece com segurança em qualquer redação.
  if (inicioDispositivo < 0) return vazio;

  // O corte entre relatório e fundamentação precisa vir antes do
  // dispositivo — senão o marcador encontrado pertence ao próprio
  // dispositivo, não à peça.
  const corte = primeiroCorte(texto, inicioDispositivo);
  const fimRelatorio = corte?.indice ?? -1;

  const inicioRelatorio = Math.max(
    0,
    primeiraOcorrencia(
      texto,
      INICIO_DO_RELATORIO,
      fimRelatorio > 0 ? fimRelatorio : inicioDispositivo,
    ),
  );

  // Sem marcador forte, relatório e fundamentação continuam juntos. Um
  // corte adivinhado é pior que corte nenhum: dá ao texto uma estrutura
  // que ele não tem, e quem lê acredita.
  if (!corte) {
    return {
      cabecalho: limpar(texto.slice(0, inicioRelatorio)),
      relatorio: null,
      fundamentacao: limpar(texto.slice(inicioRelatorio, inicioDispositivo)),
      dispositivo: limpar(texto.slice(inicioDispositivo)),
      dividida: true,
      relatorioSeparado: false,
    };
  }

  // Marcador em prosa fecha o relatório e entra nele — "É o relatório."
  // pertence ao relatório. Título abre a seção seguinte, então fica de
  // fora: "MÉRITO" é da fundamentação.
  const fimDoTrechoRelatorio = corte.titulo
    ? corte.indice
    : proximoPonto(texto, corte.indice);

  return {
    cabecalho: limpar(texto.slice(0, inicioRelatorio)),
    relatorio: limpar(texto.slice(inicioRelatorio, fimDoTrechoRelatorio)),
    fundamentacao:
      fimDoTrechoRelatorio < inicioDispositivo
        ? limpar(texto.slice(fimDoTrechoRelatorio, inicioDispositivo))
        : null,
    dispositivo: limpar(texto.slice(inicioDispositivo)),
    dividida: true,
    relatorioSeparado: true,
  };
}

/** Fim da frase que começa em `de` — para não cortar no meio. */
function proximoPonto(texto: string, de: number): number {
  const m = texto.slice(de).match(/[.;:]\s/);
  return m?.index !== undefined ? de + m.index + 1 : de;
}

function extrairData(texto: string): string | null {
  const m = texto.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (!m) return null;
  const [, d, mes, a] = m;
  const ano = Number(a);
  if (ano < 1990 || ano > new Date().getFullYear() + 1) return null;
  return `${a}-${mes}-${d}`;
}

// =====================================================================
// Quem assinou e o que a perícia disse — lidos da própria sentença
// =====================================================================
// O DJEN identifica o órgão, nunca o magistrado, e não traz laudo algum.
// Mas a sentença assina no fim e resume a perícia na fundamentação. É de
// lá que sai o material para medir juiz e perito a partir de sentença
// pública — sem acesso aos autos.
//
// Os dois são leitura de texto, então entram como `extraido_automatico`:
// aparecem na tela, ficam fora da estatística até alguém conferir.
// =====================================================================

const CARGOS =
  "ju[ií]z(?:a)?\\s+(?:federal|de\\s+direito|do\\s+trabalho)(?:\\s+substitut[oa])?" +
  "|desembargador(?:a)?(?:\\s+federal)?" +
  "|ju[ií]z(?:a)?\\s+relator(?:a)?" +
  "|ju[ií]z(?:a)?";

/**
 * Nome plausível de pessoa.
 *
 * Deliberadamente SEM a flag `i`: é a maiúscula inicial que distingue um
 * nome do resto da frase. Com `i`, "perito judicial Dr. Ricardo Alves
 * Menezes concluiu pela incapacidade" devolvia o nome com o verbo e o
 * complemento grudados — e cada variação viraria um perito diferente na
 * estatística. Aceita nome em caixa alta, que é como o diário publica.
 */
const PALAVRA = "[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ][\\wÁ-Úá-úçÇ']+";
const CONECTOR = "d[aeo]s?|D[AEO]S?|De|Da|Do|Das|Dos|e|E";
const NOME = `${PALAVRA}(?:\\s+(?:${CONECTOR}|${PALAVRA})){1,5}`;

const RE_NOME_APOS = new RegExp(`^\\s*[:\\-–,]?\\s*(?:Dr\\.?a?\\.?\\s*)?(${NOME})`);
const RE_NOME_ANTES = new RegExp(`(${NOME})\\s*[,\\-–]?\\s*$`);

export type Assinatura = { nome: string; cargo: string | null };

/**
 * Magistrado que assinou. Procura no fim da peça, que é onde a
 * assinatura fica, nas duas ordens usuais: cargo antes do nome
 * ("Juiz Federal Substituto FULANO") ou nome antes do cargo.
 */
export function extrairMagistradoAssinante(
  teor: string | null | undefined,
): Assinatura | null {
  if (!teor) return null;

  // A assinatura está no rodapé. Olhar a peça inteira faria o nome da
  // parte, do advogado ou do perito passar por magistrado.
  const fim = teor.slice(-1200);

  // As bordas de palavra são indispensáveis: sem elas "JUIZADO ESPECIAL
  // FEDERAL DE SOROCABA" — cabeçalho de toda sentença de JEF — casa com
  // "JUIZA" e o cabeçalho vira assinatura.
  const reCargo = new RegExp(`\\b(${CARGOS})\\b`, "gi");
  const achados = [...fim.matchAll(reCargo)];

  // De trás para a frente: a assinatura é a última menção a cargo, e as
  // anteriores costumam ser citação ("conforme decidiu o Juiz Federal...").
  for (let i = achados.length - 1; i >= 0; i--) {
    const m = achados[i];
    if (m.index === undefined) continue;
    const cargo = arrumarCargo(m[1]);

    const depois = fim.slice(m.index + m[0].length, m.index + m[0].length + 90);
    const a = depois.match(RE_NOME_APOS);
    if (a && nomePlausivel(a[1])) return { nome: arrumarNome(a[1]), cargo };

    const antes = fim.slice(Math.max(0, m.index - 90), m.index);
    const b = antes.match(RE_NOME_ANTES);
    if (b && nomePlausivel(b[1])) return { nome: arrumarNome(b[1]), cargo };
  }

  return null;
}

/**
 * Filtra o que casou com o formato de nome mas não é nome de gente.
 *
 * Sem isto, um trecho como "DO EXPOSTO JULGO" tem maiúscula e mais de
 * uma palavra, e entraria como magistrado — criando um registro que
 * depois aparece na estatística como se fosse um juiz.
 */
function nomePlausivel(bruto: string): boolean {
  const palavras = bruto.trim().split(/\s+/).filter((p) => p.length > 2);
  if (palavras.length < 2) return false;
  if (bruto.replace(/\s+/g, "").length < 8) return false;

  const jargao =
    /^(exposto|posto|julgo|sentença|processo|autos|parte|autora|réu|inss|vara|juizado|federal|especial|c[ií]vel|criminal|turma|se[çc][ãa]o|tribunal|regi[ãa]o)$/i;
  return !palavras.every((p) => jargao.test(p)) && !jargao.test(palavras[0]);
}

/** "DIEGO DE SOUZA LIMA" -> "Diego de Souza Lima". */
function arrumarNome(bruto: string): string {
  const minusculas = new Set(["de", "da", "do", "das", "dos", "e"]);
  return bruto
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((p, i) => {
      const b = p.toLowerCase();
      if (i > 0 && minusculas.has(b)) return b;
      return b.charAt(0).toUpperCase() + b.slice(1);
    })
    .join(" ");
}

function arrumarCargo(bruto: string): string {
  return arrumarNome(bruto.replace(/\s+/g, " "));
}

export type PericiaNaSentenca = {
  /** A sentença fala de perícia? Se não, não é caso de incapacidade. */
  mencionaPericia: boolean;
  /** Conclusão como a sentença a relata — não o laudo original. */
  conclusao: ConclusaoPericial | null;
  confianca: number;
  perito: string | null;
  /** O trecho lido, para conferência humana. */
  trecho: string | null;
};

const MENCAO_PERICIA =
  /\bperit[oa]\b|\bper[ií]cia\b|\blaudo\s+(?:pericial|m[ée]dico)\b|\bexame\s+pericial\b/i;

/**
 * O que a sentença diz que a perícia concluiu.
 *
 * Não substitui o laudo: é o resumo do juízo sobre ele. Serve para medir
 * a relação entre conclusão pericial e desfecho quando não há acesso aos
 * autos — que é o caso de toda sentença vinda do diário.
 */
export function extrairPericiaDaSentenca(
  teor: string | null | undefined,
): PericiaNaSentenca {
  const vazio: PericiaNaSentenca = {
    mencionaPericia: false,
    conclusao: null,
    confianca: 0,
    perito: null,
    trecho: null,
  };
  if (!teor || teor.trim().length < 120) return vazio;

  if (!MENCAO_PERICIA.test(teor)) return vazio;

  // Recorta o entorno das menções à perícia. A sentença fala de
  // incapacidade em vários pontos — inclusive ao descrever o que a parte
  // alega —, e só o que está perto da perícia é conclusão pericial.
  const trechos: string[] = [];
  const re = new RegExp(MENCAO_PERICIA.source, "gi");
  for (const m of teor.matchAll(re)) {
    if (m.index === undefined) continue;
    trechos.push(teor.slice(Math.max(0, m.index - 200), m.index + 400));
    if (trechos.length >= 6) break;
  }

  const regiao = trechos.join(" … ");
  const alvo = chave(regiao);

  let conclusao: ConclusaoPericial | null = null;
  let confianca = 0;
  for (const regra of REGRAS) {
    if (regra.padroes.some((p) => p.test(alvo))) {
      conclusao = regra.conclusao;
      // Resumo de terceiro sobre o laudo vale menos que o laudo.
      confianca = regra.peso * 0.7;
      break;
    }
  }

  if (!conclusao && GENERICO_COM_INCAPACIDADE.some((p) => p.test(alvo))) {
    conclusao = "incapacidade_total_temporaria";
    confianca = 0.25;
  }

  return {
    mencionaPericia: true,
    conclusao,
    confianca: Math.round(Math.min(confianca, 0.7) * 100) / 100,
    perito: extrairPeritoDaSentenca(regiao),
    trecho: regiao.slice(0, 800).trim(),
  };
}

/**
 * Nome do perito quando a sentença o cita.
 *
 * Muitas sentenças dizem apenas "o perito judicial concluiu", sem nome —
 * nesse caso não há o que extrair, e forçar um palpite criaria perito
 * fantasma na estatística.
 */
function extrairPeritoDaSentenca(regiao: string): string | null {
  // O rótulo é procurado sem distinguir caixa; o nome, com — é a
  // maiúscula que marca onde ele termina.
  const rotulos = [
    /perit[oa]\s+(?:judicial|m[ée]dic[oa]|do\s+ju[ií]zo|nomead[oa])?[,\s]*/gi,
    /laudo\s+(?:pericial\s+)?d[oa]\s+/gi,
  ];

  for (const rotulo of rotulos) {
    for (const m of regiao.matchAll(rotulo)) {
      if (m.index === undefined) continue;
      const depois = regiao.slice(m.index + m[0].length, m.index + m[0].length + 90);
      const achou = depois.match(RE_NOME_APOS);
      if (!achou) continue;
      const nome = arrumarNome(achou[1]);
      // Nome de gente tem sobrenome. "Judicial" sozinho, não.
      if (!nome.includes(" ")) continue;
      return nome;
    }
  }
  return null;
}
