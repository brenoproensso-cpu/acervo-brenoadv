#!/usr/bin/env node
/**
 * Runner de migrations e seed.
 *
 *   node scripts/db.mjs migrate   aplica as migrations pendentes
 *   node scripts/db.mjs seed      carrega a base de demonstração
 *   node scripts/db.mjs reset     derruba o schema e reaplica tudo
 *
 * Cada migration roda uma única vez, dentro de uma transação, e fica
 * registrada em schema_migrations.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const dirMigrations = join(raiz, "db", "migrations");

// Lê DATABASE_URL de .env / .env.local sem depender do dotenv.
function carregarEnv() {
  for (const arquivo of [".env.local", ".env"]) {
    const caminho = join(raiz, arquivo);
    if (!existsSync(caminho)) continue;
    for (const linha of readFileSync(caminho, "utf8").split("\n")) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

carregarEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida. Copie .env.example para .env.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  // Supabase e a maioria dos provedores usam certificado que a cadeia local
  // não valida; a conexão segue criptografada.
  ssl: /sslmode=require|supabase|neon|render/.test(url)
    ? { rejectUnauthorized: false }
    : undefined,
});

const comando = process.argv[2] ?? "migrate";

async function migrate() {
  await client.query(`
    create table if not exists schema_migrations (
      versao      text primary key,
      aplicada_em timestamptz not null default now()
    );
  `);

  const aplicadas = new Set(
    (await client.query("select versao from schema_migrations")).rows.map((r) => r.versao),
  );

  const arquivos = readdirSync(dirMigrations)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let novas = 0;
  for (const arquivo of arquivos) {
    if (aplicadas.has(arquivo)) continue;
    process.stdout.write(`  aplicando ${arquivo} ... `);
    const sql = readFileSync(join(dirMigrations, arquivo), "utf8");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (versao) values ($1)", [arquivo]);
      await client.query("commit");
      console.log("ok");
      novas++;
    } catch (erro) {
      await client.query("rollback");
      console.log("FALHOU");
      throw erro;
    }
  }
  console.log(novas === 0 ? "Nenhuma migration pendente." : `${novas} migration(s) aplicada(s).`);
}

async function seed() {
  const caminho = join(raiz, "db", "seed.sql");
  console.log("  carregando db/seed.sql ...");
  await client.query(readFileSync(caminho, "utf8"));
  console.log("Base de demonstração carregada.");
  console.log("Atenção: são dados sintéticos. Rode `npm run db:reset` para limpar.");
}

async function reset() {
  console.log("  removendo schema public ...");
  await client.query("drop schema public cascade; create schema public;");
  await migrate();
}

try {
  await client.connect();
  if (comando === "migrate") await migrate();
  else if (comando === "seed") await seed();
  else if (comando === "reset") await reset();
  else {
    console.error(`Comando desconhecido: ${comando}`);
    process.exit(1);
  }
} catch (erro) {
  console.error("\n" + (erro instanceof Error ? erro.message : String(erro)));
  process.exit(1);
} finally {
  await client.end();
}
