#!/usr/bin/env node
/**
 * Roteamento por número CNJ: o segmento e o código do tribunal embutidos
 * no número dizem qual índice do DataJud consultar. Se isso errar, o
 * coletor consulta o índice errado e conclui que o processo não existe.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const { tribunalDoCnj } = await import(join(raiz, "src/lib/integracoes/tipos.ts"));
const casos = [
  ["1000123-45.2024.4.03.6110", "trf3", "JEF Sorocaba — o caso do escritório"],
  ["0012137-21.2024.4.05.8302", "trf5", "TR/PE (veio da busca real)"],
  ["5098013-33.2023.4.03.6301", "trf3", "TR São Paulo (veio da busca real)"],
  ["5004167-02.2023.4.03.6126", "trf3", "TRF3 7ª Turma (veio da busca real)"],
  ["0001573-84.2022.4.05.8000", "trf5", "TR/AL (veio da busca real)"],
  ["1001234-56.2024.8.26.0100", "tjsp", "TJSP foro central"],
  ["0000001-02.2024.8.19.0001", "tjrj", "TJRJ"],
  ["0000001-02.2024.8.13.0024", "tjmg", "TJMG"],
  ["0000001-02.2024.5.02.0001", "trt2",  "TRT2 São Paulo"],
  ["0000001-02.2024.3.00.0000", "stj",   "STJ"],
  ["123", null, "número curto — precisa recusar"],
  ["0000001-02.2024.4.09.0000", null, "TRF9 não existe — precisa recusar"],
];
let ok = 0;
for (const [cnj, esperado, nota] of casos) {
  const r = tribunalDoCnj(cnj);
  const passou = r === esperado;
  if (passou) ok++;
  console.log(`${passou ? "  OK  " : " ERRO "} ${cnj} -> ${r ?? "null"}   (${nota})`);
  if (!passou) console.log(`        esperado: ${esperado}`);
}
console.log(`\n${ok}/${casos.length}`);
