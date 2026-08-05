#!/usr/bin/env node
/**
 * CLI de ingestão. Cliente fino sobre POST /api/ingerir — assim o código
 * de integração vive num lugar só.
 *
 *   npm run ingerir -- djen --oab 123456 --uf SP --dias 7 --dry-run
 *   npm run ingerir -- datajud --tribunal trf3 --cnj 1000123-45.2024.4.03.6110
 *   npm run ingerir -- pdpj --arquivo documentos.json
 *
 * A aplicação precisa estar no ar (npm run dev ou npm start).
 * Use --dry-run na primeira execução de cada fonte: ele mostra como os
 * campos foram interpretados sem gravar nada.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const arquivo of [".env.local", ".env"]) {
  const caminho = join(raiz, arquivo);
  if (!existsSync(caminho)) continue;
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const fonte = args[0];

function opcao(nome, padrao = undefined) {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : padrao;
}
const tem = (nome) => args.includes(`--${nome}`);

if (!fonte || tem("help") || !["djen", "datajud", "pdpj"].includes(fonte)) {
  console.log(`
Uso: npm run ingerir -- <fonte> [opções]

  djen      --oab <número> --uf <UF> [--dias 7 | --de AAAA-MM-DD --ate AAAA-MM-DD]
            --arquivo <json>              importa um retorno do DJEN já salvo
  datajud   --pendentes [--limite 50]   atualiza os processos já cadastrados
            --cnj <número>                consulta um processo (tribunal sai do número)
  pdpj      --arquivo <documentos.json> | --cnj <número>

  --dry-run   mostra o mapeamento sem gravar (use na primeira vez)
  --url       endereço da aplicação (padrão http://localhost:3000)
`);
  process.exit(fonte ? 0 : 1);
}

const base = opcao("url", process.env.APP_URL ?? "http://localhost:3000");
const corpo = { fonte, dryRun: tem("dry-run") };

if (fonte === "djen") {
  const arquivo = opcao("arquivo");
  if (arquivo) {
    const conteudo = JSON.parse(readFileSync(arquivo, "utf8"));
    corpo.comunicacoes = Array.isArray(conteudo)
      ? conteudo
      : (conteudo.items ?? conteudo.content ?? conteudo.comunicacoes ?? conteudo.data ?? []);
    console.log(`  ${corpo.comunicacoes.length} comunicação(ões) lidas de ${arquivo}`);
  }
  const dias = Number(opcao("dias", "7"));
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - dias * 86_400_000);
  corpo.numeroOab = opcao("oab");
  corpo.ufOab = opcao("uf");
  corpo.dataInicio = opcao("de", inicio.toISOString().slice(0, 10));
  corpo.dataFim = opcao("ate", hoje.toISOString().slice(0, 10));

  if (!corpo.comunicacoes && (!corpo.numeroOab || !corpo.ufOab)) {
    console.error("Informe --oab e --uf, ou --arquivo <json> com o retorno do DJEN.");
    process.exit(1);
  }
}

if (fonte === "datajud") {
  corpo.pendentes = tem("pendentes");
  corpo.tribunal = opcao("tribunal");
  corpo.numeroCnj = opcao("cnj");
  corpo.atualizadoDesde = opcao("desde");
  corpo.limite = opcao("limite");
  if (!corpo.pendentes && !corpo.numeroCnj && !corpo.tribunal) {
    console.error(
      "Informe --pendentes (atualiza os processos já cadastrados), " +
        "--cnj <número> ou --tribunal <sigla>.",
    );
    process.exit(1);
  }
}

if (fonte === "pdpj") {
  const arquivo = opcao("arquivo");
  if (arquivo) {
    const conteudo = JSON.parse(readFileSync(arquivo, "utf8"));
    corpo.documentos = Array.isArray(conteudo)
      ? conteudo
      : (conteudo.documentos ?? conteudo.items ?? conteudo.data ?? []);
    console.log(`  ${corpo.documentos.length} documento(s) lidos de ${arquivo}`);
  } else {
    corpo.numeroCnj = opcao("cnj");
    if (!corpo.numeroCnj) {
      console.error("Informe --arquivo <json> ou --cnj <número>.");
      process.exit(1);
    }
  }
}

const token = process.env.INGESTAO_TOKEN;

try {
  const resposta = await fetch(`${base}/api/ingerir`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(corpo),
  });

  const json = await resposta.json();

  if (!resposta.ok) {
    console.error(`\nFalhou (${resposta.status}): ${json.erro ?? "erro desconhecido"}\n`);
    process.exit(1);
  }

  console.log("\n" + JSON.stringify(json, null, 2) + "\n");
  if (json.dryRun) {
    console.log("Nada foi gravado. Confira os campos acima e rode sem --dry-run.\n");
  }
} catch (erro) {
  console.error(
    `\nNão consegui falar com a aplicação em ${base}.\n` +
      `Ela está no ar? (npm run dev)\n${erro.message}\n`,
  );
  process.exit(1);
}
