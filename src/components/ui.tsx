import Link from "next/link";
import { num, pct } from "@/lib/labels";

export function TituloPagina({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="display text-2xl font-semibold">{titulo}</h1>
        {descricao && (
          <p className="mt-1 text-sm" style={{ color: "var(--tinta-2)" }}>
            {descricao}
          </p>
        )}
      </div>
      {acao}
    </div>
  );
}

export function Cartao({
  titulo,
  descricao,
  children,
  className = "",
}: {
  titulo?: string;
  descricao?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`cartao ${className}`}>
      {titulo && (
        <header className="border-b px-4 py-3">
          <h2 className="display text-base font-semibold">{titulo}</h2>
          {descricao && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--tinta-3)" }}>
              {descricao}
            </p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

export function Indicador({
  rotulo,
  valor,
  detalhe,
  destaque = false,
}: {
  rotulo: string;
  valor: string | number;
  detalhe?: string;
  destaque?: boolean;
}) {
  return (
    <div className="cartao px-4 py-3">
      <div className="rotulo-campo mb-1">{rotulo}</div>
      <div
        className="display text-2xl font-semibold tabular-nums"
        style={destaque ? { color: "var(--marinho)" } : undefined}
      >
        {valor}
      </div>
      {detalhe && (
        <div className="mt-0.5 text-xs" style={{ color: "var(--tinta-3)" }}>
          {detalhe}
        </div>
      )}
    </div>
  );
}

/** Selo verde/vinho conforme o desfecho. */
export function SeloDesfecho({
  favoravel,
  texto,
}: {
  favoravel: boolean | null | undefined;
  texto: string;
}) {
  if (favoravel === null || favoravel === undefined) {
    return <span className="selo selo-neutro">{texto}</span>;
  }
  return (
    <span className={`selo ${favoravel ? "selo-exito" : "selo-reves"}`}>{texto}</span>
  );
}

/**
 * Barra favorável/desfavorável proporcional. Mostra de imediato tanto a
 * proporção quanto o volume — uma taxa de 100% em 2 casos não deve
 * parecer igual a 100% em 40.
 */
export function BarraDesfecho({
  favoraveis,
  total,
}: {
  favoraveis: unknown;
  total: unknown;
}) {
  const f = num(favoraveis);
  const t = num(total);
  if (!t) return <span style={{ color: "var(--tinta-3)" }}>—</span>;
  const p = (f / t) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="barra-dupla w-24 shrink-0" title={`${f} de ${t}`}>
        <span className="parte-exito" style={{ width: `${p}%` }} />
        <span className="parte-reves" style={{ width: `${100 - p}%` }} />
      </div>
      <span className="tabular-nums text-xs" style={{ color: "var(--tinta-2)" }}>
        {pct(Math.round(p * 10) / 10)}
      </span>
    </div>
  );
}

/** Aviso de amostra pequena: taxa sobre poucos casos engana. */
export function AvisoAmostra({ total, minimo = 8 }: { total: unknown; minimo?: number }) {
  if (num(total) >= minimo) return null;
  return (
    <span
      className="ml-1 cursor-help text-xs"
      style={{ color: "var(--tinta-3)" }}
      title={`Amostra pequena (menos de ${minimo} casos): a taxa oscila muito.`}
    >
      ⚠
    </span>
  );
}

export function Vazio({ mensagem, acao }: { mensagem: string; acao?: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm" style={{ color: "var(--tinta-3)" }}>
        {mensagem}
      </p>
      {acao && <div className="mt-3">{acao}</div>}
    </div>
  );
}

/** Paginação por querystring, preservando os filtros já aplicados. */
export function Paginacao({
  pagina,
  total,
  porPagina,
  params,
  base,
}: {
  pagina: number;
  total: number;
  porPagina: number;
  params: Record<string, string | undefined>;
  base: string;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;

  const url = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("pagina", String(p));
    return `${base}?${q.toString()}`;
  };

  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
      <span style={{ color: "var(--tinta-3)" }}>
        Página {pagina} de {paginas} · {total.toLocaleString("pt-BR")} registro
        {total === 1 ? "" : "s"}
      </span>
      <div className="flex gap-2">
        {pagina > 1 && (
          <Link href={url(pagina - 1)} className="botao botao-secundario">
            Anterior
          </Link>
        )}
        {pagina < paginas && (
          <Link href={url(pagina + 1)} className="botao botao-secundario">
            Próxima
          </Link>
        )}
      </div>
    </div>
  );
}
