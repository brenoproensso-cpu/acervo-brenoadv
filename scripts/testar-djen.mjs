#!/usr/bin/env node
/**
 * Separa sentença de expediente no teor publicado pelo DJEN.
 *
 * Despacho e ato ordinatório entram no mesmo diário. Sem esta separação,
 * expediente seria contado como decisão e a taxa da vara sairia errada.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const { pareceDecisao } = await import(join(raiz, "src/lib/integracoes/tipos.ts"));

const casos = [
  ["Sentença completa", true,
   `PODER JUDICIÁRIO. Juizado Especial Federal de Sorocaba. SENTENÇA. Relatório dispensado.
    A parte autora pleiteia auxílio por incapacidade. A perícia concluiu pela ausência de
    incapacidade laborativa atual, conforme laudo de fls. Ante o exposto, julgo improcedente
    o pedido, extinguindo o feito com resolução do mérito, nos termos do art. 487, I, do CPC.
    Sem custas e honorários. Publique-se. Sorocaba, 12 de março de 2025. Juiz Federal.`],
  ["Despacho — deve ser descartado", false,
   `Intime-se a parte autora para, no prazo de 15 dias, manifestar-se sobre o laudo pericial
    juntado aos autos, sob pena de preclusão. Após, venham conclusos para sentença. Cumpra-se.
    Sorocaba, 3 de fevereiro de 2025. Juiz Federal Substituto. Publique-se e intime-se.`],
  ["Só aviso de sentença — descartar", false,
   `Fica a parte autora intimada da sentença proferida nos autos, cujo inteiro teor encontra-se
    disponível para consulta no sistema processual eletrônico deste Juizado. Prazo recursal de
    dez dias, contados na forma da lei. Nada mais havendo, publique-se.`],
  ["Ato ordinatório — descartar", false,
   `Ato ordinatório. Ficam as partes cientes da redistribuição do feito a esta 2ª Vara Federal,
    em razão de declínio de competência. Os autos seguem conclusos oportunamente. Publique-se.`],
  ["Sentença procedente", true,
   `SENTENÇA. Trata-se de ação previdenciária. Diante do exposto, julgo procedente o pedido
    para condenar o INSS a implantar o benefício de auxílio por incapacidade temporária desde
    a data do requerimento administrativo, com o pagamento das parcelas vencidas.`],
];

let ok = 0;
for (const [nome, esperado, teor] of casos) {
  const r = pareceDecisao(teor);
  if (r === esperado) ok++;
  console.log(`${r === esperado ? "  OK  " : " ERRO "} ${nome} -> ${r}`);
}
console.log(`\n${ok}/${casos.length}`);
