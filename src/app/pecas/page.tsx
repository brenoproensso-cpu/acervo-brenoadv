import Link from "next/link";
import { listarPecas, catalogos, POR_PAGINA } from "@/lib/queries";
import { TIPO_PECA, opcoes, rotulo, dataBR } from "@/lib/labels";
import { BarraFiltros, paraSelect } from "@/components/filtros";
import { Paginacao, TituloPagina, Vazio } from "@/components/ui";
import { Trecho } from "@/components/trecho";

export const dynamic = "force-dynamic";

type Busca = Promise<Record<string, string | string[] | undefined>>;

const texto = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Pecas({ searchParams }: { searchParams: Busca }) {
  const sp = await searchParams;
  const f = {
    q: texto(sp.q),
    tipo: texto(sp.tipo),
    beneficio: texto(sp.beneficio),
    modelo: texto(sp.modelo),
    pagina: Number(texto(sp.pagina) ?? 1) || 1,
  };

  const [{ linhas, total, pagina }, beneficios] = await Promise.all([
    listarPecas(f),
    catalogos.beneficios(),
  ]);

  const temFiltro = Object.entries(f).some(
    ([k, v]) => k !== "pagina" && v !== undefined,
  );

  return (
    <>
      <TituloPagina
        titulo="Acervo de peças"
        descricao="Petições, recursos, quesitos e impugnações já produzidos pelo escritório."
        acao={
          <Link href="/pecas/nova" className="botao">
            Cadastrar peça
          </Link>
        }
      />

      <BarraFiltros
        action="/pecas"
        busca={f.q}
        placeholder="Texto da peça, título, resumo…"
        temFiltro={temFiltro}
        campos={[
          {
            nome: "tipo",
            rotulo: "Tipo",
            valor: f.tipo,
            opcoes: opcoes(TIPO_PECA).map((o) => ({ valor: o.valor, texto: o.texto })),
          },
          {
            nome: "beneficio",
            rotulo: "Benefício",
            valor: f.beneficio,
            opcoes: paraSelect(beneficios),
          },
          {
            nome: "modelo",
            rotulo: "Modelos",
            valor: f.modelo,
            opcoes: [{ valor: "sim", texto: "Apenas modelos" }],
            vazio: "Todas",
          },
        ]}
      />

      <div className="cartao">
        {linhas.length === 0 ? (
          <Vazio
            mensagem={
              temFiltro
                ? "Nenhuma peça encontrada com esses filtros."
                : "O acervo de peças ainda está vazio."
            }
            acao={
              <Link href="/pecas/nova" className="botao">
                Cadastrar a primeira
              </Link>
            }
          />
        ) : (
          <>
            <ul>
              {linhas.map((p) => (
                <li key={String(p.id)} className="border-b px-4 py-4 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="selo selo-marinho">
                      {rotulo(TIPO_PECA, String(p.tipo))}
                    </span>
                    {p.modelo === true && (
                      <span className="selo selo-exito">Modelo</span>
                    )}
                    {Boolean(p.beneficio_codigo) && (
                      <span className="selo selo-neutro">
                        {String(p.beneficio_codigo)}
                      </span>
                    )}
                    {(p.tags as string[])?.slice(0, 4).map((t) => (
                      <span key={t} className="selo selo-neutro">
                        {t}
                      </span>
                    ))}
                  </div>

                  <h3 className="mt-2">
                    <Link
                      href={`/pecas/${p.id}`}
                      className="display text-base font-semibold hover:underline"
                    >
                      {String(p.titulo)}
                    </Link>
                  </h3>

                  <div
                    className="mt-1 flex flex-wrap gap-x-3 text-xs"
                    style={{ color: "var(--tinta-3)" }}
                  >
                    {Boolean(p.autor) && <span>{String(p.autor)}</span>}
                    {Boolean(p.data_peca) && <span>· {dataBR(String(p.data_peca))}</span>}
                  </div>

                  {p.trecho ? (
                    <Trecho
                      html={String(p.trecho)}
                      className="mt-2 text-sm leading-relaxed"
                    />
                  ) : (
                    Boolean(p.resumo) && (
                      <p
                        className="mt-2 text-sm leading-relaxed"
                        style={{ color: "var(--tinta-2)" }}
                      >
                        {String(p.resumo)}
                      </p>
                    )
                  )}
                </li>
              ))}
            </ul>

            <Paginacao
              pagina={pagina}
              total={total}
              porPagina={POR_PAGINA}
              base="/pecas"
              params={{
                q: f.q,
                tipo: f.tipo,
                beneficio: f.beneficio,
                modelo: f.modelo,
              }}
            />
          </>
        )}
      </div>
    </>
  );
}
