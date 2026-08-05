import Link from "next/link";
import { notFound } from "next/navigation";
import { peca, pecaTeses } from "@/lib/queries";
import { TIPO_PECA, dataBR, rotulo } from "@/lib/labels";
import { Cartao } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DetalhePeca({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const p = await peca(id).catch(() => null);
  if (!p) notFound();

  const teses = await pecaTeses(id);

  return (
    <>
      <div className="mb-4">
        <Link href="/pecas" className="text-sm" style={{ color: "var(--marinho)" }}>
          ← Peças
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="selo selo-marinho">{rotulo(TIPO_PECA, String(p.tipo))}</span>
        {p.modelo === true && <span className="selo selo-exito">Modelo</span>}
        {Boolean(p.beneficio_codigo) && (
          <span className="selo selo-neutro">{String(p.beneficio_codigo)}</span>
        )}
        {(p.tags as string[])?.map((t) => (
          <span key={t} className="selo selo-neutro">
            {t}
          </span>
        ))}
      </div>

      <h1 className="display mb-6 text-2xl font-semibold">{String(p.titulo)}</h1>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {Boolean(p.resumo) && (
            <Cartao titulo="Resumo">
              <p className="texto-peca px-4 py-4">{String(p.resumo)}</p>
            </Cartao>
          )}

          <Cartao titulo="Texto da peça">
            {p.texto ? (
              <div className="texto-peca max-h-[40rem] overflow-y-auto px-4 py-4">
                {String(p.texto)}
              </div>
            ) : (
              <p className="px-4 py-6 text-sm" style={{ color: "var(--tinta-3)" }}>
                Nenhum texto cadastrado para esta peça.
              </p>
            )}
          </Cartao>

          {Boolean(p.observacoes) && (
            <Cartao titulo="Observações internas">
              <p className="texto-peca px-4 py-4">{String(p.observacoes)}</p>
            </Cartao>
          )}
        </div>

        <div className="space-y-5">
          <Cartao titulo="Ficha">
            <dl className="px-4 py-3">
              {(
                [
                  ["Tipo", rotulo(TIPO_PECA, String(p.tipo))],
                  ["Autor", p.autor ? String(p.autor) : "—"],
                  ["Data", dataBR(p.data_peca as string)],
                  ["Modelo reutilizável", p.modelo ? "Sim" : "Não"],
                  [
                    "Benefício",
                    p.beneficio_codigo
                      ? `${p.beneficio_codigo} — ${p.beneficio_nome}`
                      : "—",
                  ],
                  [
                    "Processo",
                    p.processo_numero ? String(p.processo_numero) : "—",
                  ],
                  ["Cliente", p.cliente_nome ? String(p.cliente_nome) : "—"],
                ] as [string, string][]
              ).map(([r, v]) => (
                <div key={r} className="border-b py-2 last:border-b-0">
                  <dt className="rotulo-campo mb-0.5">{r}</dt>
                  <dd className="text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          </Cartao>

          {teses.length > 0 && (
            <Cartao
              titulo="Teses"
              descricao="Veja em Padrões como cada tese vem sendo recebida."
            >
              <ul className="px-4 py-2">
                {teses.map((t) => (
                  <li key={String(t.id)} className="border-b py-2.5 text-sm last:border-b-0">
                    {String(t.nome)}
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </div>
      </div>
    </>
  );
}
