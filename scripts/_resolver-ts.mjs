/**
 * Faz o Node achar `./tipos` quando o arquivo é `./tipos.ts`.
 *
 * O Node 22 lê TypeScript direto, mas não completa a extensão como o
 * bundler do Next faz. Sem isto, os testes não conseguem importar um
 * módulo que importa outro — e só dariam para testar arquivos soltos.
 */
export async function resolve(especificador, contexto, proximo) {
  if (especificador.startsWith(".") && !/\.[mc]?[jt]sx?$/.test(especificador)) {
    try {
      return await proximo(`${especificador}.ts`, contexto);
    } catch {
      // Não era TypeScript; segue o caminho normal.
    }
  }
  return proximo(especificador, contexto);
}
