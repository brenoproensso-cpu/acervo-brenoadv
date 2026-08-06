import Link from "next/link";
import { listarPeritos } from "@/lib/queries";
import { TIPO_PERITO, num, pct, rotulo } from "@/lib/labels";
import { AvisoAmostra, Cartao, TituloPagina, Vazio } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Peritos() {
  const peritos = await listarPeritos();

  return (
    <>
      <TituloPagina
        titulo="Peritos"
        descricao="Histórico de cada perito no acervo: com que frequência reconhece incapacidade e o que o juízo decide depois."
      />

      <Cartao>
        {peritos.length === 0 ? (
          <Vazio mensagem="Nenhum perito cadastrado." />
        ) : (
          <div className="tabela-rolavel">
            <table className="dados">
              <thead>
                <tr>
                  <th>Perito</th>
                  <th>Função</th>
                  <th>Especialidade</th>
                  <th className="num">Casos</th>
                  <th className="num">Reconhece</th>
                  <th className="num">Êxito c/ inc.</th>
                  <th className="num">Êxito s/ inc.</th>
                </tr>
              </thead>
              <tbody>
                {peritos.map((p) => (
                  <tr key={String(p.id)}>
                    <td>
                      <Link
                        href={`/peritos/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {String(p.nome)}
                      </Link>
                      {Boolean(p.observacoes) && (
                        <div
                          className="mt-0.5 max-w-md text-xs"
                          style={{ color: "var(--tinta-3)" }}
                        >
                          {String(p.observacoes)}
                        </div>
                      )}
                    </td>
                    <td style={{ color: "var(--tinta-2)" }}>
                      {rotulo(TIPO_PERITO, String(p.tipo))}
                    </td>
                    <td style={{ color: "var(--tinta-2)" }}>
                      {String(p.especialidade ?? "—")}
                    </td>
                    <td className="num tabular-nums">{num(p.total_casos)}</td>
                    <td className="num tabular-nums">{pct(p.taxa_reconhecimento)}</td>
                    <td className="num tabular-nums">
                      {pct(p.taxa_exito_com_incapacidade)}
                      <AvisoAmostra total={p.total_casos} />
                    </td>
                    <td className="num tabular-nums">
                      {pct(p.taxa_exito_sem_incapacidade)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </>
  );
}
