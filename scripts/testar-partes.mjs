#!/usr/bin/env node
/**
 * Divide a sentença em relatório, fundamentação e dispositivo.
 *
 * É o que permite ler a fundamentação separada — que é onde o juízo diz
 * por que decidiu, e a única parte que serve para estudar entendimento.
 * O relatório repete o pedido; o dispositivo anuncia o resultado.
 */
import { register } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

register("./_resolver-ts.mjs", import.meta.url);
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const { dividirSentenca } = await import(join(raiz, "src/lib/integracoes/extracao.ts"));

const casos = [];

casos.push({
  nome: "Sentença comum: relatório, decido, ante o exposto",
  teor: `PODER JUDICIÁRIO. JUIZADO ESPECIAL FEDERAL DE SOROCABA. Processo 5001234-38.2024.4.03.6110.
Autor: MARIA APARECIDA DOS SANTOS. Réu: INSTITUTO NACIONAL DO SEGURO SOCIAL.

Trata-se de ação em que a parte autora postula a concessão de auxílio por incapacidade
temporária, alegando ser portadora de lombalgia crônica que a impede de exercer sua
atividade habitual de auxiliar de limpeza. Juntou documentos médicos. O INSS contestou.
Foi realizada perícia médica judicial.

É o relatório. Decido.

O benefício de auxílio por incapacidade temporária exige a comprovação da qualidade de
segurado, do cumprimento da carência e da incapacidade laborativa. A qualidade de segurado
e a carência restaram demonstradas pelo CNIS. Quanto à incapacidade, o perito judicial
concluiu pela existência de incapacidade total e temporária, com data de início fixada em
10/03/2024. O laudo é claro e bem fundamentado, não havendo nos autos elemento que o
infirme. A impugnação da autarquia é genérica e não indica erro técnico.

Ante o exposto, JULGO PROCEDENTE o pedido para condenar o INSS a conceder à parte autora o
auxílio por incapacidade temporária desde a DER, com pagamento das parcelas vencidas
acrescidas de correção monetária. Sem custas e honorários nesta instância.`,
  espera: {
    dividida: true,
    cabecalhoContem: "JUIZADO ESPECIAL FEDERAL DE SOROCABA",
    relatorioContem: "auxiliar de limpeza",
    relatorioTermina: "É o relatório.",
    fundamentacaoContem: "incapacidade total e temporária",
    fundamentacaoNaoContem: "JULGO PROCEDENTE",
    dispositivoContem: "JULGO PROCEDENTE",
  },
});

casos.push({
  nome: "JEF com relatório dispensado",
  teor: `SENTENÇA. Dispensado o relatório, nos termos do art. 38 da Lei nº 9.099/95, aplicável
subsidiariamente aos Juizados Especiais Federais por força do art. 1º da Lei nº 10.259/01.

A parte autora pretende o restabelecimento de auxílio-doença. A perícia médica realizada
concluiu pela ausência de incapacidade laborativa atual, registrando que a patologia
apresentada está controlada com tratamento medicamentoso e não impede o exercício da
atividade habitual. Não há nos autos prova capaz de afastar a conclusão pericial.

Diante do exposto, JULGO IMPROCEDENTE o pedido, extinguindo o feito com resolução do
mérito, nos termos do art. 487, I, do CPC. Sem custas e honorários.`,
  espera: {
    dividida: true,
    relatorioContem: "Dispensado o relatório",
    fundamentacaoContem: "ausência de incapacidade",
    dispositivoContem: "JULGO IMPROCEDENTE",
    fundamentacaoNaoContem: "JULGO IMPROCEDENTE",
  },
});

casos.push({
  nome: "Sentença com títulos numerados",
  teor: `SENTENÇA TIPO A

I - RELATÓRIO

Cuida-se de demanda proposta em face do INSS objetivando a concessão de aposentadoria por
incapacidade permanente. Citada, a autarquia apresentou contestação. Realizada perícia.

II - FUNDAMENTAÇÃO

A aposentadoria por incapacidade permanente pressupõe incapacidade total e definitiva para
qualquer atividade laborativa. O laudo pericial atestou incapacidade parcial e permanente,
o que, à luz das condições pessoais da parte autora — idade avançada e baixa escolaridade —,
autoriza a concessão nos termos da Súmula 47 da TNU.

III - DISPOSITIVO

Pelo exposto, JULGO PROCEDENTE o pedido para condenar o INSS a implantar o benefício de
aposentadoria por incapacidade permanente.`,
  espera: {
    dividida: true,
    relatorioContem: "aposentadoria por incapacidade permanente",
    fundamentacaoContem: "Súmula 47 da TNU",
    dispositivoContem: "JULGO PROCEDENTE",
    fundamentacaoNaoContem: "JULGO PROCEDENTE",
  },
});

casos.push({
  nome: "Acórdão citado no meio não pode virar o dispositivo",
  teor: `SENTENÇA. Trata-se de pedido de auxílio-acidente. É o relatório. Passo a decidir.

O auxílio-acidente exige sequela definitiva que reduza a capacidade para o trabalho.
Sobre o tema, colhe-se do julgado do TRF da 3ª Região: "Ante o exposto, dou provimento à
apelação do INSS para julgar improcedente o pedido, uma vez que a perícia não constatou
redução da capacidade laborativa." O caso dos autos, porém, é diverso: aqui o perito
constatou sequela permanente no membro superior direito, com redução funcional estimada
em 25%, o que preenche o requisito legal do art. 86 da Lei 8.213/91.

Ante o exposto, JULGO PROCEDENTE o pedido para condenar o INSS a conceder o auxílio-acidente
a partir do dia seguinte ao da cessação do auxílio por incapacidade temporária.`,
  espera: {
    dividida: true,
    dispositivoContem: "conceder o auxílio-acidente",
    dispositivoNaoContem: "dou provimento à",
    fundamentacaoContem: "redução funcional estimada",
  },
});

casos.push({
  nome: "Despacho não se divide",
  teor: `Intime-se a parte autora para manifestar-se sobre o laudo pericial no prazo de 15 dias,
sob pena de preclusão. Após, venham conclusos. Cumpra-se. Sorocaba, 3 de fevereiro de 2025.`,
  espera: { dividida: false },
});

casos.push({
  nome: "Texto curto demais devolve vazio",
  teor: "Fica a parte intimada da sentença.",
  espera: { dividida: false },
});

// Caso real: sentença de pensão por morte publicada pelo TRF1, extinta
// sem mérito pelo Tema 1124. Não tem "é o relatório" nem título de
// seção, e cita "sem resolução do mérito" dentro de ementa do STJ muito
// antes de chegar ao próprio mérito. A versão anterior cortava ali e
// jogava metade da peça para dentro do relatório.
casos.push({
  nome: "TRF1, sem marcador de relatório, com 'mérito' citado em ementa",
  teor: `Trata-se de ação proposta por INÊS SOUZA COSTA e M. S. D. L., representadas por sua prima,
VERA LÚCIA DE JESUS, em desfavor do INSS, objetivando a concessão de benefício de pensão por morte
decorrente do falecimento de sua genitora, MARINÊS SOUZA COSTA, em 29/01/2024. A pensão por morte é
o benefício pago aos dependentes do segurado que falecer, aposentado ou não, consoante o art. 201, V,
da Constituição Federal de 1988. Para sua concessão deve ser provado o óbito, a qualidade de segurado
do instituidor e a qualidade de dependente da parte requerente. Todavia, ausente início de prova
material da alegada qualidade de segurada especial da falecida. O rol de documentos hábeis à
comprovação do exercício de atividade rural, inscrito no art. 106 da Lei 8.213/91, é meramente
exemplificativo, e não taxativo. Esse juízo tem considerado idôneos documentos contemporâneos ao
período de carência, tais como Comprovante de ITR e notas fiscais de produtor rural.

A jurisprudência do Superior Tribunal de Justiça é firme no sentido de que a extinção do processo
sem resolução do mérito (art. 267, IV do CPC) e a consequente possibilidade de o autor intentar
novamente a ação (art. 268 do CPC), caso reúna os elementos necessários à tal iniciativa.
6. Recurso Especial do INSS desprovido. (REsp 1352721/SP, Corte Especial, DJe 28/04/2016) Portanto,
tendo em vista a carência de pressupostos de desenvolvimento válido e regular do processo, deve o
feito ser extinto sem resolução do mérito, nos termos do art. 485, IV, do CPC. Cumpre esclarecer que,
conforme entendimento consolidado pelo Superior Tribunal de Justiça no Tema 1124, para a configuração
do interesse de agir em ações previdenciárias exige-se correspondência entre os fatos e os documentos
submetidos ao exame administrativo e aqueles levados ao Poder Judiciário. A apresentação direta de
documentos inéditos apenas em juízo ensejará a extinção da nova demanda sem resolução de mérito, nos
termos do artigo 485, inciso VI, do Código de Processo Civil, por ausência de interesse de agir.

Ante o exposto, julgo extinto o feito sem resolução de mérito, nos termos do art. 485, IV, do CPC.
Sem custas e honorários advocatícios. Defiro os benefícios da gratuidade da justiça. Feira de Santana,
BA, data registrada em sistema. Juiz Federal Substituto DIEGO DE SOUZA LIMA`,
  espera: {
    dividida: true,
    relatorioSeparado: false,
    fundamentacaoComeca: "Trata-se de ação proposta por INÊS SOUZA COSTA",
    fundamentacaoContem: "Tema 1124",
    dispositivoComeca: "Ante o exposto, julgo extinto",
    dispositivoContem: "DIEGO DE SOUZA LIMA",
    dispositivoNaoContem: "Tema 1124",
  },
});

casos.push({
  nome: "'Mérito' como título de seção continua separando",
  teor: `SENTENÇA. Trata-se de pedido de aposentadoria por idade rural formulado em face do INSS.
Citada, a autarquia contestou. Foi colhida prova testemunhal em audiência.

MÉRITO

A aposentadoria por idade rural exige início de prova material corroborado por prova testemunhal
idônea, nos termos da Súmula 149 do STJ. No caso, os documentos juntados são contemporâneos ao
período de carência e as testemunhas foram uníssonas quanto ao labor rural da parte autora.

Pelo exposto, JULGO PROCEDENTE o pedido para conceder a aposentadoria por idade rural.`,
  espera: {
    dividida: true,
    relatorioSeparado: true,
    relatorioContem: "prova testemunhal em audiência",
    fundamentacaoContem: "Súmula 149 do STJ",
    dispositivoContem: "JULGO PROCEDENTE",
  },
});

casos.push({
  nome: "Sem 'exposto', o dispositivo é achado pelo verbo",
  teor: `SENTENÇA. Trata-se de ação de restabelecimento de auxílio por incapacidade temporária.
É o relatório. Decido.

A perícia médica concluiu pela ausência de incapacidade laborativa atual, e não há nos autos
elemento técnico capaz de infirmar essa conclusão. A parte autora não se desincumbiu do ônus
que lhe cabia quanto ao fato constitutivo do seu direito.

JULGO IMPROCEDENTE o pedido, extinguindo o feito com resolução do mérito, nos termos do
art. 487, I, do CPC. Sem custas e honorários nesta instância.`,
  espera: {
    dividida: true,
    relatorioSeparado: true,
    dispositivoComeca: "JULGO IMPROCEDENTE",
    fundamentacaoContem: "ausência de incapacidade",
  },
});

// As sentenças de teste têm quebra de linha no meio das frases, como as
// de verdade. A comparação é de conteúdo, não de diagramação.
const texto = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const contem = (parte, trecho) => texto(parte).includes(texto(trecho));

let falhas = 0;
const conferir = (nome, ok, detalhe = "") => {
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok  " : "FALHOU"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

for (const caso of casos) {
  console.log(`\n${caso.nome}`);
  const p = dividirSentenca(caso.teor);
  const e = caso.espera;

  conferir("dividida", p.dividida === e.dividida, `${p.dividida}`);
  if (!e.dividida) continue;

  if (e.relatorioSeparado !== undefined) {
    conferir(
      e.relatorioSeparado
        ? "separa relatório de fundamentação"
        : "não inventa corte entre relatório e fundamentação",
      p.relatorioSeparado === e.relatorioSeparado,
      `${p.relatorioSeparado}`,
    );
  }
  if (e.fundamentacaoComeca) {
    conferir(
      "fundamentação começa onde deve",
      texto(p.fundamentacao).startsWith(texto(e.fundamentacaoComeca)),
      `${(p.fundamentacao ?? "").slice(0, 45)}…`,
    );
  }
  if (e.dispositivoComeca) {
    conferir(
      "dispositivo começa onde deve",
      texto(p.dispositivo).startsWith(texto(e.dispositivoComeca)),
      `${(p.dispositivo ?? "").slice(0, 45)}…`,
    );
  }

  if (e.cabecalhoContem) {
    conferir("cabeçalho separado", contem(p.cabecalho, e.cabecalhoContem));
  }
  if (e.relatorioContem) {
    conferir("relatório", contem(p.relatorio, e.relatorioContem));
  }
  if (e.relatorioTermina) {
    conferir(
      "relatório fecha no marcador",
      (p.relatorio ?? "").trimEnd().endsWith(e.relatorioTermina),
      `…${(p.relatorio ?? "").trimEnd().slice(-25)}`,
    );
  }
  if (e.fundamentacaoContem) {
    conferir("fundamentação", contem(p.fundamentacao, e.fundamentacaoContem));
  }
  if (e.fundamentacaoNaoContem) {
    conferir(
      "fundamentação não invade o dispositivo",
      !contem(p.fundamentacao, e.fundamentacaoNaoContem),
    );
  }
  if (e.dispositivoContem) {
    conferir("dispositivo", contem(p.dispositivo, e.dispositivoContem));
  }
  if (e.dispositivoNaoContem) {
    conferir(
      "dispositivo não pega a citação do meio",
      !contem(p.dispositivo, e.dispositivoNaoContem),
    );
  }

  // Nenhuma parte pode sumir: o que entra tem de sair.
  const junto = [p.cabecalho, p.relatorio, p.fundamentacao, p.dispositivo]
    .filter(Boolean)
    .join("")
    .replace(/\s+/g, "");
  conferir(
    "nada do texto se perde na divisão",
    junto === caso.teor.trim().replace(/\s+/g, ""),
    `${junto.length} de ${caso.teor.trim().replace(/\s+/g, "").length} caracteres`,
  );
}

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} verificação(ões) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
