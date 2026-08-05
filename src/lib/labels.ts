/** Tradução dos enums do banco para os rótulos exibidos na interface. */

export const TIPO_DOCUMENTO: Record<string, string> = {
  sentenca: "Sentença",
  acordao: "Acórdão",
  decisao_monocratica: "Decisão monocrática",
  decisao_interlocutoria: "Decisão interlocutória",
  despacho: "Despacho",
  ementa: "Ementa",
  sumula: "Súmula",
  tese_repetitiva: "Tese repetitiva",
  parecer: "Parecer",
};

export const ORIGEM: Record<string, string> = {
  acervo_proprio: "Acervo próprio",
  jurisprudencia_externa: "Jurisprudência externa",
};

export const INSTANCIA: Record<string, string> = {
  primeiro_grau: "1º grau",
  turma_recursal: "Turma Recursal",
  segundo_grau: "2º grau",
  tnu: "TNU",
  superior: "STJ",
  supremo: "STF",
};

export const RESULTADO: Record<string, string> = {
  procedente: "Procedente",
  parcialmente_procedente: "Parcialmente procedente",
  improcedente: "Improcedente",
  extinto_sem_merito: "Extinto sem mérito",
  homologacao_acordo: "Acordo homologado",
  provido: "Provido",
  parcialmente_provido: "Parcialmente provido",
  desprovido: "Desprovido",
  nao_conhecido: "Não conhecido",
};

export const CONCLUSAO: Record<string, string> = {
  incapacidade_total_permanente: "Incapacidade total e permanente",
  incapacidade_total_temporaria: "Incapacidade total e temporária",
  incapacidade_parcial_permanente: "Incapacidade parcial e permanente",
  incapacidade_parcial_temporaria: "Incapacidade parcial e temporária",
  impedimento_longo_prazo: "Impedimento de longo prazo",
  sem_impedimento: "Sem impedimento",
  sem_incapacidade: "Sem incapacidade",
  inconclusivo: "Inconclusivo",
};

export const TIPO_PERITO: Record<string, string> = {
  judicial: "Perito judicial",
  assistente_tecnico: "Assistente técnico",
  administrativo_inss: "Perito do INSS",
};

export const TIPO_PECA: Record<string, string> = {
  peticao_inicial: "Petição inicial",
  contestacao: "Contestação",
  replica: "Réplica",
  quesitos: "Quesitos",
  impugnacao_laudo: "Impugnação ao laudo",
  memoriais: "Memoriais",
  recurso_inominado: "Recurso inominado",
  apelacao: "Apelação",
  agravo: "Agravo",
  embargos_declaracao: "Embargos de declaração",
  contrarrazoes: "Contrarrazões",
  recurso_especial: "Recurso especial",
  recurso_extraordinario: "Recurso extraordinário",
  peticao_simples: "Petição simples",
  parecer: "Parecer",
  outros: "Outros",
};

export const NIVEL_AUTORIDADE: Record<string, string> = {
  A: "A — Vinculante forte",
  B: "B — Precedente qualificado",
  C: "C — Órgão de cúpula",
  D: "D — Orientativo",
  E: "E — Editorial",
};

export function rotulo(mapa: Record<string, string>, chave?: string | null): string {
  if (!chave) return "—";
  return mapa[chave] ?? chave;
}

export function opcoes(mapa: Record<string, string>) {
  return Object.entries(mapa).map(([valor, texto]) => ({ valor, texto }));
}

// ---------------------------------------------------------------------

export function dataBR(valor?: string | Date | null): string {
  if (!valor) return "—";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function mesBR(valor?: string | Date | null): string {
  if (!valor) return "—";
  const d = valor instanceof Date ? valor : new Date(valor);
  return d.toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/** Percentual vindo do Postgres como numeric (string) ou number. */
export function pct(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isNaN(n) ? "—" : `${n.toLocaleString("pt-BR")}%`;
}

export function num(valor: unknown): number {
  if (valor === null || valor === undefined) return 0;
  return typeof valor === "number" ? valor : Number(valor) || 0;
}

export function moedaBR(valor: unknown): string {
  const n = num(valor);
  if (!n) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
