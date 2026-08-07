#!/usr/bin/env node
/**
 * Lê da sentença o que o DJEN não entrega em campo: quem assinou e o que
 * a perícia concluiu.
 *
 * É o que permite medir magistrado e perito a partir de sentença pública,
 * sem acesso aos autos. Como é leitura de texto, o resultado entra como
 * palpite a conferir — mas um palpite errado aqui contamina exatamente a
 * estatística que o escritório usa para decidir se impugna um laudo.
 */
import { register } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

register("./_resolver-ts.mjs", import.meta.url);
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const { extrairMagistradoAssinante, extrairPericiaDaSentenca } = await import(
  join(raiz, "src/lib/integracoes/extracao.ts")
);

let falhas = 0;
const conferir = (nome, ok, detalhe = "") => {
  console.log(`  ${ok ? "ok  " : "FALHOU"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas++;
};

// ---------------------------------------------------------------------
console.log("\nQuem assinou");

const assinaturas = [
  [
    "cargo antes do nome, tudo em maiúsculas (TRF1)",
    `Publicado(a) e registrado(a) eletronicamente. Intime(m)-se. Feira de Santana, BA,
     data registrada em sistema. Juiz Federal Substituto DIEGO DE SOUZA LIMA`,
    "Diego de Souza Lima",
    "Juiz Federal Substituto",
  ],
  [
    "nome antes do cargo, em linhas separadas",
    `Sem custas e honorários. Publique-se. Sorocaba, 10 de julho de 2026.

     MARIANA COSTA PEREIRA
     Juíza Federal`,
    "Mariana Costa Pereira",
    "Juíza Federal",
  ],
  [
    "desembargador relator",
    `Ante o exposto, dou parcial provimento à apelação. É como voto.
     Desembargador Federal Euler de Almeida`,
    "Euler de Almeida",
    "Desembargador Federal",
  ],
  [
    "nome composto com partícula",
    `Intimem-se. São Paulo, 3 de março de 2026. Juiz Federal PAULO DE TARSO DOS SANTOS`,
    "Paulo de Tarso dos Santos",
    "Juiz Federal",
  ],
];

for (const [nome, teor, esperado, cargo] of assinaturas) {
  const a = extrairMagistradoAssinante(teor);
  conferir(nome, a?.nome === esperado, a ? `${a.nome} (${a.cargo})` : "nada");
  if (a && cargo) conferir(`  cargo de "${nome}"`, a.cargo === cargo, String(a.cargo));
}

// Toda sentença de JEF começa com "JUIZADO ESPECIAL FEDERAL DE …".
// Sem borda de palavra, "JUIZA" casava ali e o cabeçalho virava
// assinatura — em todas as sentenças, de todos os juízes.
conferir(
  "cabeçalho JUIZADO não vira assinatura",
  extrairMagistradoAssinante(
    `PODER JUDICIÁRIO. JUIZADO ESPECIAL FEDERAL DE SOROCABA. SENTENÇA.
     ${"Texto da fundamentação da sentença. ".repeat(20)}
     Ante o exposto, JULGO PROCEDENTE o pedido. Sorocaba, 10 de julho de 2026.
     Juiz Federal RICARDO ALVES MENEZES`,
  )?.nome === "Ricardo Alves Menezes",
  JSON.stringify(
    extrairMagistradoAssinante(
      `PODER JUDICIÁRIO. JUIZADO ESPECIAL FEDERAL DE SOROCABA. SENTENÇA.
       ${"Texto da fundamentação da sentença. ".repeat(20)}
       Ante o exposto, JULGO PROCEDENTE o pedido. Sorocaba, 10 de julho de 2026.
       Juiz Federal RICARDO ALVES MENEZES`,
    ),
  ),
);

conferir(
  "juiz citado na fundamentação perde para quem assinou",
  extrairMagistradoAssinante(
    `Como já decidiu o Juiz Federal ANTONIO CARLOS SILVA em caso análogo, a prova
     material é indispensável. Ante o exposto, julgo improcedente o pedido.
     Campinas, 2 de maio de 2026. Juíza Federal BEATRIZ LOPES CARVALHO`,
  )?.nome === "Beatriz Lopes Carvalho",
);

conferir(
  "trecho do dispositivo não vira nome de juiz",
  extrairMagistradoAssinante(
    "Ante o exposto, JULGO PROCEDENTE o pedido. Publique-se e intime-se o Juiz.",
  ) === null,
);

conferir(
  "despacho sem assinatura não inventa magistrado",
  extrairMagistradoAssinante("Intime-se a parte autora. Cumpra-se.") === null,
);

conferir(
  "assinatura no começo não vale — ali fica a autuação",
  extrairMagistradoAssinante(
    `Juiz Federal ANTONIO CARLOS SILVA. ${"Texto do corpo da sentença. ".repeat(80)}`,
  ) === null,
);

// ---------------------------------------------------------------------
console.log("\nO que a perícia concluiu, segundo a sentença");

const pericias = [
  [
    "reconhece incapacidade total e temporária, com perito nomeado",
    `Quanto à incapacidade, o perito judicial Dr. Ricardo Alves Menezes concluiu pela
     incapacidade total e temporária, com data de início em 10/03/2024. O laudo é claro.`,
    { conclusao: "incapacidade_total_temporaria", perito: "Ricardo Alves Menezes" },
  ],
  [
    "nega incapacidade, sem nomear o perito",
    `A perícia médica realizada concluiu pela ausência de incapacidade laborativa atual,
     registrando que a patologia está controlada e não impede a atividade habitual.`,
    { conclusao: "sem_incapacidade", perito: null },
  ],
  [
    "incapacidade parcial e permanente",
    `O laudo pericial atestou incapacidade parcial e permanente, o que, à luz das
     condições pessoais da parte autora, autoriza a concessão.`,
    { conclusao: "incapacidade_parcial_permanente", perito: null },
  ],
  [
    "alegação da parte não é conclusão pericial",
    `Trata-se de ação em que a autora alega incapacidade total para o trabalho desde 2019
     e pede a concessão do benefício. ${"Texto sobre requisitos legais. ".repeat(40)}`,
    { mencionaPericia: false },
  ],
];

for (const [nome, teor, esperado] of pericias) {
  const p = extrairPericiaDaSentenca(teor);
  if (esperado.mencionaPericia === false) {
    conferir(nome, p.mencionaPericia === false, `menciona=${p.mencionaPericia}`);
    continue;
  }
  conferir(nome, p.conclusao === esperado.conclusao, String(p.conclusao));
  conferir(`  perito de "${nome}"`, p.perito === esperado.perito, String(p.perito));
  conferir(
    `  confiança de "${nome}" fica abaixo da do laudo`,
    p.confianca > 0 && p.confianca <= 0.7,
    String(p.confianca),
  );
}

conferir(
  "sentença que não fala de perícia devolve vazio",
  extrairPericiaDaSentenca(
    `Trata-se de pedido de pensão por morte. O óbito está comprovado pela certidão.
     Ante o exposto, julgo procedente o pedido.`,
  ).mencionaPericia === false,
);

conferir(
  "não cria perito a partir de palavra do jargão",
  extrairPericiaDaSentenca(
    "O perito judicial concluiu pela incapacidade total e temporária da parte autora.",
  ).perito === null,
);

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} verificação(ões) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
