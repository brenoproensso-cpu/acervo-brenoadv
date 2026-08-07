#!/usr/bin/env node
/**
 * Verifica a conversa com o DJEN contra um servidor de mentira.
 *
 * O host do CNJ não é alcançável do ambiente onde este código é escrito,
 * então o que dá para garantir aqui é o comportamento do cliente: que ele
 * tente as variantes na ordem certa, pare quando o acesso é barrado,
 * pagine só quando faz sentido e produza mensagem de erro que sirva para
 * agir. O contrato real de campos continua sendo assunto da primeira
 * execução de verdade.
 */
import { createServer } from "node:http";
import { register } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

register("./_resolver-ts.mjs", import.meta.url);

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORTA = 4599;

// O servidor muda de comportamento entre os casos.
let responder = () => ({ status: 200, corpo: { items: [] } });
const recebidas = [];

const servidor = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  recebidas.push({ params: url.searchParams, headers: req.headers });
  const r = responder(url.searchParams, recebidas.length);
  res.writeHead(r.status, { "content-type": "application/json", server: "servidor-de-teste" });
  res.end(typeof r.corpo === "string" ? r.corpo : JSON.stringify(r.corpo));
});
await new Promise((ok) => servidor.listen(PORTA, "127.0.0.1", ok));

process.env.DJEN_API_URL = `http://127.0.0.1:${PORTA}/api/v1`;
const djen = await import(join(raiz, "src/lib/integracoes/djen.ts"));

const consulta = {
  tribunal: "TRF3",
  orgao: "Juizado Especial Federal de Sorocaba",
  contendo: "auxílio por incapacidade",
  dataInicio: "2026-07-01",
  dataFim: "2026-07-31",
  paginas: 3,
};

const itens = (n, orgao = "Juizado Especial Federal de Sorocaba") =>
  Array.from({ length: n }, (_, i) => ({
    id: `x${i}`,
    numero_processo: "50012343820244036110",
    siglaTribunal: "TRF3",
    nomeOrgao: orgao,
    data_disponibilizacao: "2026-07-10",
    texto: "SENTENÇA. Ante o exposto, julgo procedente o pedido.",
  }));

let falhas = 0;
const conferir = (nome, condicao, detalhe = "") => {
  console.log(`${condicao ? "ok  " : "FALHOU"}  ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!condicao) falhas++;
};

// ---------------------------------------------------------------------
console.log("\n1. A API aceita o recorte completo logo de cara");
recebidas.length = 0;
responder = () => ({ status: 200, corpo: { count: 2, items: itens(2) } });
let r = await djen.buscarPorOrgao(consulta);
conferir("usa a variante mais específica", r.varianteUsada === "tribunal + nomeOrgao + texto", r.varianteUsada);
conferir("uma única chamada", recebidas.length === 1, `${recebidas.length}`);
conferir("traz os itens", r.itens.length === 2);

// ---------------------------------------------------------------------
console.log("\n2. A API não conhece nomeOrgao e recusa com 400");
recebidas.length = 0;
responder = (p) => {
  if (p.has("nomeOrgao") || p.has("orgaoJulgador") || p.has("texto")) {
    return { status: 400, corpo: { message: "parâmetro desconhecido" } };
  }
  return { status: 200, corpo: { count: 3, items: itens(3) } };
};
r = await djen.buscarPorOrgao(consulta);
conferir("desce a escada até o que funciona", r.varianteUsada === "só tribunal + datas", r.varianteUsada);
conferir("registra as tentativas anteriores", r.tentativas.length === 4, `${r.tentativas.length}`);
conferir("os 400 ficaram registrados", r.tentativas.filter((t) => t.status === 400).length === 3);
conferir("traz os itens da variante que passou", r.itens.length === 3);

// ---------------------------------------------------------------------
console.log("\n3. Acesso barrado com 403 em tudo");
recebidas.length = 0;
responder = () => ({ status: 403, corpo: "<html><body>Forbidden</body></html>" });
let erro = null;
try {
  await djen.buscarPorOrgao(consulta);
} catch (e) {
  erro = e;
}
conferir("lança erro", erro !== null);
conferir("não insiste depois do 403", recebidas.length === 1, `${recebidas.length} chamadas`);
conferir("a mensagem diz o status", /403/.test(erro?.message ?? ""));
conferir(
  "a mensagem aponta a origem da chamada, não os filtros",
  /fora do Brasil|proteção de borda/i.test(erro?.message ?? ""),
);
conferir("a mensagem traz o corpo da resposta", /Forbidden/.test(erro?.message ?? ""));
conferir(
  "não repete o palpite antigo sobre datas",
  !/Confira tribunal e intervalo de datas/.test(erro?.message ?? ""),
);

// ---------------------------------------------------------------------
console.log("\n4. Paginação");
recebidas.length = 0;
responder = (p) => {
  const pagina = Number(p.get("pagina"));
  return { status: 200, corpo: { items: itens(pagina <= 2 ? 100 : 40) } };
};
r = await djen.buscarPorOrgao({ ...consulta, paginas: 3 });
conferir("lê as três páginas", r.paginasLidas === 3, `${r.paginasLidas}`);
conferir("soma tudo", r.totalBruto === 240, `${r.totalBruto}`);
conferir(
  "mantém a mesma variante nas páginas seguintes",
  recebidas.every((c) => c.params.has("nomeOrgao")),
);

console.log("\n5. Para de paginar quando a página vem incompleta");
recebidas.length = 0;
responder = () => ({ status: 200, corpo: { items: itens(10) } });
r = await djen.buscarPorOrgao({ ...consulta, paginas: 5 });
conferir("uma página só", r.paginasLidas === 1, `${r.paginasLidas}`);

// ---------------------------------------------------------------------
console.log("\n6. Cabeçalhos enviados");
recebidas.length = 0;
responder = () => ({ status: 200, corpo: { items: [] } });
await djen.buscarPorOrgao(consulta);
const h = recebidas[0].headers;
conferir("manda User-Agent", Boolean(h["user-agent"]) && h["user-agent"] !== "undici");
conferir("manda Accept-Language em português", /pt-BR/.test(h["accept-language"] ?? ""));
conferir("manda Referer do portal de comunicações", /comunica\.pje\.jus\.br/.test(h["referer"] ?? ""));

// ---------------------------------------------------------------------
console.log("\n7. Filtro fino sobre o que voltou");
const publicacoes = [
  ...itens(2, "Juizado Especial Federal de Sorocaba"),
  ...itens(3, "2ª Vara Federal de Campinas"),
];
let filtrados = djen.filtrar(publicacoes, { orgao: "juizado especial federal de sorocaba" });
conferir("recorta por órgão ignorando maiúsculas", filtrados.length === 2, `${filtrados.length}`);
filtrados = djen.filtrar(publicacoes, { contendo: "AUXILIO" });
conferir("termo ausente no teor descarta tudo", filtrados.length === 0, `${filtrados.length}`);

// ---------------------------------------------------------------------
console.log("\n8. Diagnóstico de conexão");
responder = () => ({ status: 403, corpo: "Forbidden" });
let d = await djen.diagnosticarConexao();
conferir("faz as três chamadas de teste", d.testes.length === 3, `${d.testes.length}`);
conferir("403 em tudo vira recomendação de região", /gru1/.test(d.leitura), d.leitura.slice(0, 60));

responder = (p) => (p.has("siglaTribunal") ? { status: 200, corpo: { items: itens(1) } } : { status: 403, corpo: "no" });
d = await djen.diagnosticarConexao();
conferir("com um 200 no meio, a leitura muda", /A API responde/.test(d.leitura), d.leitura.slice(0, 40));
conferir("não recomenda trocar região à toa", !/gru1/.test(d.leitura));

// ---------------------------------------------------------------------
console.log("\n9. Servidor fora do ar");
await new Promise((ok) => servidor.close(ok));
erro = null;
try {
  await djen.buscarPorOrgao(consulta);
} catch (e) {
  erro = e;
}
conferir("erro de rede não vira 403 imaginário", !/403/.test(erro?.message ?? ""));
conferir("diz que não conseguiu falar com o DJEN", /não foi possível falar/i.test(erro?.message ?? ""));

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
