import { Pool } from "pg";

// O pool é guardado no globalThis para sobreviver ao hot reload do Next em
// desenvolvimento, senão cada recompilação abriria um pool novo.
const global_ = globalThis as unknown as { _pool?: Pool };

function criarPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não definida. Copie .env.example para .env e ajuste a conexão.",
    );
  }

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl: /sslmode=require|supabase|neon|render/.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

export function pool(): Pool {
  if (!global_._pool) global_._pool = criarPool();
  return global_._pool;
}

/** Executa uma query e devolve as linhas já tipadas. */
export async function consultar<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const resultado = await pool().query(sql, params);
  return resultado.rows as T[];
}

/** Igual a `consultar`, mas devolve só a primeira linha (ou null). */
export async function consultarUm<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const linhas = await consultar<T>(sql, params);
  return linhas[0] ?? null;
}

/**
 * Monta a cláusula WHERE a partir de filtros opcionais, numerando os
 * placeholders na ordem em que forem adicionados. Evita a concatenação
 * manual de $1/$2 espalhada pelas páginas.
 */
export class Filtros {
  private clausulas: string[] = [];
  private valores: unknown[] = [];

  /** Adiciona a cláusula apenas se o valor estiver preenchido. */
  add(sqlComPlaceholder: string, valor: unknown): this {
    if (valor === undefined || valor === null || valor === "") return this;
    this.valores.push(valor);
    this.clausulas.push(sqlComPlaceholder.replace("?", `$${this.valores.length}`));
    return this;
  }

  /** Cláusula sem parâmetro, para filtros booleanos fixos. */
  addCru(sql: string): this {
    this.clausulas.push(sql);
    return this;
  }

  get where(): string {
    return this.clausulas.length ? `where ${this.clausulas.join(" and ")}` : "";
  }

  get params(): unknown[] {
    return this.valores;
  }

  /** Índice do próximo placeholder, para LIMIT/OFFSET no fim da query. */
  proximo(valor: unknown): string {
    this.valores.push(valor);
    return `$${this.valores.length}`;
  }
}
