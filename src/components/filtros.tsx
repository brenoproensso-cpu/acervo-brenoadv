import Link from "next/link";
import type { Opcao } from "@/lib/queries";

type ItemSelect = { valor: string; texto: string };

/**
 * Barra de filtros. É um <form method="get">, então funciona sem
 * JavaScript no cliente e mantém o estado na própria URL — o que permite
 * salvar uma busca nos favoritos do navegador.
 */
export function BarraFiltros({
  action,
  busca,
  placeholder = "Buscar no texto…",
  campos,
  temFiltro,
}: {
  action: string;
  busca?: string;
  placeholder?: string;
  campos: {
    nome: string;
    rotulo: string;
    valor?: string;
    opcoes: ItemSelect[];
    vazio?: string;
  }[];
  temFiltro: boolean;
}) {
  return (
    <form action={action} method="get" className="cartao mb-5 px-4 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label className="rotulo-campo" htmlFor="q">
            Busca
          </label>
          <input
            id="q"
            name="q"
            defaultValue={busca ?? ""}
            placeholder={placeholder}
            className="campo"
          />
        </div>

        {campos.map((c) => (
          <div key={c.nome} className="min-w-[150px]">
            <label className="rotulo-campo" htmlFor={c.nome}>
              {c.rotulo}
            </label>
            <select id={c.nome} name={c.nome} defaultValue={c.valor ?? ""} className="campo">
              <option value="">{c.vazio ?? "Todos"}</option>
              {c.opcoes.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div className="flex gap-2">
          <button type="submit" className="botao">
            Filtrar
          </button>
          {temFiltro && (
            <Link href={action} className="botao botao-secundario">
              Limpar
            </Link>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--tinta-3)" }}>
        A busca aceita aspas para expressão exata (&quot;alta programada&quot;), o
        sinal de menos para excluir (-acordo) e a palavra <em>or</em> para
        alternativas. Acentos são ignorados.
      </p>
    </form>
  );
}

export function paraSelect(opcoes: Opcao[]): ItemSelect[] {
  return opcoes.map((o) => ({ valor: o.id, texto: o.texto }));
}
