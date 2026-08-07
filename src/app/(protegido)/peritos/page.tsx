import Link from "next/link";
import { listarPeritos, peritosDaColeta } from "@/lib/queries";
import { TIPO_PERITO, num, pct, rotulo } from "@/lib/labels";
import { AvisoAmostra, Cartao, TituloPagina, Vazio } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Peritos() {
  const [peritos, daColeta] = await Promise.all([listarPeritos(), peritosDaColeta()]);

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

      {daColeta.length > 0 && (
        <Cartao
          titulo="Peritos vistos na coleta do juízo"
          descricao="Processos de terceiros, com a conclusão pericial lida do resumo que a sentença faz do laudo."
          className="mt-6"
        >
          <p
            className="border-b px-4 pb-3 text-xs leading-relaxed"
            style={{ color: "var(--tinta-3)" }}
          >
            Estes números não têm o mesmo grau de certeza da tabela acima. Ali a
            conclusão vem do laudo, conferida por uma pessoa; aqui vem do que o
            juiz escreveu sobre o laudo, lido automaticamente. Servem para
            apontar tendência e escolher onde olhar — não para citar em peça.
          </p>
          <div className="tabela-rolavel">
            <table className="dados">
              <thead>
                <tr>
                  <th>Perito</th>
                  <th className="num">Casos</th>
                  <th className="num">Reconhece</th>
                  <th className="num">Reconheceu → concedido</th>
                  <th className="num">Reconheceu → negado</th>
                  <th className="num">Negou → concedido</th>
                  <th className="num">Negou → negado</th>
                </tr>
              </thead>
              <tbody>
                {daColeta.map((p, i) => (
                  <tr key={i}>
                    <td className="font-medium">{String(p.perito_nome)}</td>
                    <td className="num tabular-nums">{num(p.total_casos)}</td>
                    <td className="num tabular-nums">
                      {pct(p.taxa_reconhecimento)}
                      <AvisoAmostra total={p.total_casos} />
                    </td>
                    <td className="num tabular-nums">{num(p.reconheceu_e_concedido)}</td>
                    <td className="num tabular-nums">{num(p.reconheceu_e_negado)}</td>
                    <td className="num tabular-nums">{num(p.negou_e_concedido)}</td>
                    <td className="num tabular-nums">{num(p.negou_e_negado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}
    </>
  );
}
