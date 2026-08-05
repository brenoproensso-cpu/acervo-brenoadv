import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

// O Node 22 remove as anotações de tipo sozinho, então o módulo
// TypeScript é importado direto. O `import type` do arquivo é apagado
// no processo, então o alias "@/" nem chega a ser resolvido.
const { extrairDoLaudo, extrairDaDecisao } = await import(
  join(raiz, "src/lib/integracoes/extracao.ts")
);

// ---------------------------------------------------------------------

const CASOS = [
  {
    nome: "Sem incapacidade — negativa direta",
    esperado: "sem_incapacidade",
    texto: `LAUDO PERICIAL MÉDICO
Processo nº 1000123-45.2024.4.03.6110
Perito Médico Judicial: Dr. Márcio Aguiar Fontes
Data: 12/03/2025
HISTÓRICO: Autor refere dores lombares desde 2019. Alega incapacidade total
para o trabalho. Apresenta exames de imagem com discopatia L4-L5 (M51.1).
EXAME FÍSICO: Marcha normal, sem déficit motor.
CONCLUSÃO: Não há incapacidade laborativa atual. O periciando encontra-se
apto para o trabalho habitual de auxiliar de produção.`,
  },
  {
    nome: "Incapacidade total e permanente",
    esperado: "incapacidade_total_permanente",
    texto: `LAUDO DE PERÍCIA MÉDICA
Perito: Dra. Beatriz Coelho Martins
Quadro neurológico degenerativo progressivo, CID G35.
CONCLUSÃO: Constatada incapacidade total e permanente para toda e qualquer
atividade laborativa, insuscetível de reabilitação profissional.`,
  },
  {
    nome: "Parcial e permanente",
    esperado: "incapacidade_parcial_permanente",
    texto: `PERÍCIA MÉDICA JUDICIAL
Perito Judicial: Dr. Luiz Fernando Barreto
Data da perícia: 05/07/2024. Sequela de trauma em ombro direito, CID M75.1.
CONCLUSÃO: Há incapacidade parcial e permanente, com redução da capacidade
laborativa para atividades que exijam elevação do membro superior direito.`,
  },
  {
    nome: "Total e temporária",
    esperado: "incapacidade_total_temporaria",
    texto: `LAUDO PERICIAL
Perito Médico: Dra. Renata Bicudo Lima
Episódio depressivo grave, CID F32.2, em tratamento.
CONCLUSÃO: Incapacidade total e temporária, estimada em 12 meses, com
necessidade de reavaliação ao término do período.`,
  },
  {
    nome: "BPC/LOAS — impedimento de longo prazo",
    esperado: "impedimento_longo_prazo",
    texto: `LAUDO DE AVALIAÇÃO
Perita: Dra. Patrícia Rezende Alves
CONCLUSÃO: Verifica-se impedimento de longo prazo de natureza física, com
efeitos por prazo superior a dois anos, que obstrui a participação plena
e efetiva na sociedade em igualdade de condições.`,
  },
  {
    nome: "ARMADILHA — fundamentação cita incapacidade, conclusão nega",
    esperado: "sem_incapacidade",
    texto: `LAUDO PERICIAL
Perito Judicial: Dr. Ricardo Sampaio Vieira
HISTÓRICO: A parte autora sustenta incapacidade total e permanente para o
trabalho, afirmando estar totalmente incapaz desde 2020. Junta atestados
que mencionam incapacidade parcial e permanente.
DISCUSSÃO: Os achados não corroboram a alegação.
CONCLUSÃO: Não se constatou incapacidade laborativa. Periciando apto.`,
  },
  {
    nome: "Inconclusivo",
    esperado: "inconclusivo",
    texto: `LAUDO PERICIAL
Perito: Dr. Otávio Freire Rangel
CONCLUSÃO: Não é possível concluir pela existência de incapacidade sem a
realização de exames complementares. Necessita de avaliação complementar
por especialista em reumatologia.`,
  },
  {
    nome: "Parcial e temporária",
    esperado: "incapacidade_parcial_temporaria",
    texto: `PERÍCIA
Perito Médico Judicial: Dra. Cláudia Nakamura
CONCLUSÃO: Constatada incapacidade parcial e temporária pelo período de
seis meses para atividades de esforço físico intenso.`,
  },
  {
    nome: "Texto curto demais — deve devolver nulo",
    esperado: null,
    texto: `Laudo anexo.`,
  },
];

let acertos = 0;
let comPerito = 0;

console.log("\nLaudos periciais:\n");
for (const caso of CASOS) {
  const r = extrairDoLaudo(caso.texto);
  const ok = r.conclusao === caso.esperado;
  if (ok) acertos++;
  if (r.perito) comPerito++;

  console.log(`${ok ? "  OK  " : " ERRO "} ${caso.nome}`);
  if (!ok) {
    console.log(`        esperado: ${caso.esperado} | obtido: ${r.conclusao}`);
  }
  console.log(
    `        confiança ${r.confianca} | perito: ${r.perito ?? "—"} | CID: ${r.cidPrincipal ?? "—"}`,
  );
}

console.log(
  `\n${acertos}/${CASOS.length} conclusões corretas · ` +
    `${comPerito}/${CASOS.length - 1} peritos identificados\n`,
);

// ---------------------------------------------------------------------
// Sentenças e acórdãos
// ---------------------------------------------------------------------

const CASOS_DECISAO = [
  {
    nome: "Procedente",
    esperado: "procedente",
    texto: `SENTENÇA\nRelatório dispensado. A parte autora pede o restabelecimento do
benefício. Ante o exposto, julgo procedente o pedido para condenar o INSS a
implantar o auxílio por incapacidade temporária desde a DER.`,
  },
  {
    nome: "ARMADILHA — parcial não pode virar total",
    esperado: "parcialmente_procedente",
    texto: `SENTENÇA. Diante do exposto, julgo parcialmente procedente o pedido,
para condenar o INSS apenas ao pagamento das parcelas vencidas.`,
  },
  {
    nome: "Improcedente",
    esperado: "improcedente",
    texto: `Ante o exposto, julgo improcedente o pedido, ausente a incapacidade
laborativa aferida em perícia judicial.`,
  },
  {
    nome: "Extinção sem mérito",
    esperado: "extinto_sem_merito",
    texto: `Isso posto, extingo o processo sem resolução do mérito, nos termos do
art. 485, IV, do CPC.`,
  },
  {
    nome: "Acordo homologado",
    esperado: "homologacao_acordo",
    texto: `Pelo exposto, homologo o acordo celebrado entre as partes e extingo o
feito com resolução do mérito.`,
  },
  {
    nome: "Recurso desprovido",
    esperado: "desprovido",
    texto: `ACÓRDÃO. Ante o exposto, nego provimento ao recurso inominado
interposto pelo INSS, mantendo a sentença por seus próprios fundamentos.`,
  },
  {
    nome: "ARMADILHA — parcial provimento antes de provimento",
    esperado: "parcialmente_provido",
    texto: `Diante do exposto, dou parcial provimento à apelação para reduzir os
honorários advocatícios.`,
  },
];

let acertosD = 0;
console.log("Sentenças e acórdãos:\n");
for (const caso of CASOS_DECISAO) {
  const r = extrairDaDecisao(caso.texto);
  const ok = r.resultado === caso.esperado;
  if (ok) acertosD++;
  console.log(`${ok ? "  OK  " : " ERRO "} ${caso.nome}`);
  if (!ok) console.log(`        esperado: ${caso.esperado} | obtido: ${r.resultado}`);
}
console.log(`\n${acertosD}/${CASOS_DECISAO.length} resultados corretos\n`);

process.exit(acertos === CASOS.length && acertosD === CASOS_DECISAO.length ? 0 : 1);
