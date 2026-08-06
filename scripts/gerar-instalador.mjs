#!/usr/bin/env node
/**
 * Junta todas as migrations num arquivo só, para instalação pelo SQL
 * Editor do Supabase — sem precisar de Node, git ou terminal na máquina
 * de quem instala.
 *
 * O arquivo gerado também registra cada migration em schema_migrations,
 * de modo que um `npm run db:migrate` posterior reconheça o que já foi
 * aplicado e só rode as novas.
 *
 *   node scripts/gerar-instalador.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const dirMigrations = join(raiz, "db", "migrations");
const destino = join(raiz, "db", "instalar.sql");

const arquivos = readdirSync(dirMigrations)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const partes = [
  `-- =====================================================================
-- instalar.sql — instalação completa do Acervo Jurídico
-- =====================================================================
-- GERADO AUTOMATICAMENTE por scripts/gerar-instalador.mjs.
-- Não edite este arquivo: altere as migrations em db/migrations/ e gere
-- de novo, senão a próxima geração descarta suas mudanças.
--
-- COMO USAR NO SUPABASE
--   1. Painel do projeto -> SQL Editor -> New query
--   2. Cole este arquivo inteiro
--   3. Run
--
-- Roda numa transação: ou aplica tudo, ou não aplica nada.
--
-- É seguro rodar de novo. Cada migration usa "create table if not
-- exists" e "create or replace", então reaplicar não duplica nem apaga
-- nada — apenas reafirma o estado atual.
--
-- Contém ${arquivos.length} migrations. NÃO inclui dados de demonstração.
-- =====================================================================

begin;

create table if not exists schema_migrations (
  versao      text primary key,
  aplicada_em timestamptz not null default now()
);
`,
];

for (const arquivo of arquivos) {
  const sql = readFileSync(join(dirMigrations, arquivo), "utf8");
  partes.push(`
-- =====================================================================
-- ${arquivo}
-- =====================================================================
${sql.trim()}

insert into schema_migrations (versao) values ('${arquivo}')
  on conflict (versao) do nothing;
`);
}

partes.push(`
commit;

-- ---------------------------------------------------------------------
-- Conferência: deve listar ${arquivos.length} migrations e as tabelas do sistema.
-- ---------------------------------------------------------------------
select versao, aplicada_em from schema_migrations order by versao;

select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
`);

writeFileSync(destino, partes.join("\n"));

// A aplicação precisa saber qual é a última migration para avisar quando o
// banco estiver atrás do código. Gerar isto aqui evita que a constante fique
// desatualizada — ela nasce do mesmo diretório que o instalador.
writeFileSync(
  join(raiz, "src", "lib", "migracoes.ts"),
  `// GERADO por scripts/gerar-instalador.mjs. Não edite à mão.
export const MIGRACOES = ${JSON.stringify(arquivos, null, 2)} as const;

export const ULTIMA_MIGRACAO = ${JSON.stringify(arquivos[arquivos.length - 1])};
`,
);

const linhas = partes.join("\n").split("\n").length;
console.log(`db/instalar.sql gerado: ${arquivos.length} migrations, ${linhas} linhas.`);
