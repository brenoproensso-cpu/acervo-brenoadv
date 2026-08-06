import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";
import { consultar } from "@/lib/db";
import { dataBR, num, pct } from "@/lib/labels";
import { AvisoAmostra, BarraDesfecho, Cartao, TituloPagina, Vazio } from "@/components/ui";
import { FormularioColeta } from "./coleta";
import { FormularioSentencas } from "./sentencas";

export const dynamic = "force-dynamic";

export default async function Juizo() {
  const eu = await usuarioAtual();
  if (!eu) redirect("/login");

  const [comparativo, porClasse] = await Promise.all([
    consultar("select * from vw_juizo_comparativo limit 50"),
    consultar(
      "select * from vw_juizo_por_classe order by total desc limit 30",
    ),
  ]);

  const podeColetar = eu.papel !== "colaborador";

  return (
    <>
      <TituloPagina
        titulo="Comportamento do juízo"
        descricao="Como cada vara vem decidindo, medido em processos de terceiros — e como o escritório se sai ali."
      />

      <div
        className="cartao mb-5 px-4 py-3 text-sm leading-relaxed"
        style={{ background: "var(--papel-2)" }}
      >
        Duas fontes alimentam esta tela. O <strong>DJEN</strong> traz o teor
        publicado das sentenças — dá para ler a fundamentação, e o desfecho é
        lido do dispositivo. O <strong>DataJud</strong> não traz texto, mas
        entrega o código oficial do julgamento e cobre todo o acervo do
        tribunal, servindo para volume. Nenhuma das duas nomeia o magistrado em
        campo próprio: no DJEN ele é procurado dentro do texto; no DataJud a
        unidade é o órgão julgador.
      </div>

      {comparativo.length === 0 ? (
        <Cartao className="mb-6">
          <Vazio mensagem="Nenhum juízo medido ainda. Use a coleta abaixo para trazer processos de uma vara." />
        </Cartao>
      ) : (
        <Cartao
          titulo="A vara × o escritório"
          descricao="Diferença positiva significa que o escritório vai melhor que a média do juízo."
          className="mb-6"
        >
          <div className="tabela-rolavel">
            <table className="dados">
              <thead>
                <tr>
                  <th>Órgão julgador</th>
                  <th>Tribunal</th>
                  <th className="num">Casos do juízo</th>
                  <th>Taxa do juízo</th>
                  <th className="num">Seus casos</th>
                  <th>Sua taxa</th>
                  <th className="num">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {comparativo.map((c) => {
                  const dif = c.diferenca === null ? null : num(c.diferenca);
                  return (
                    <tr key={String(c.orgao_julgador_id)}>
                      <td className="font-medium">{String(c.orgao_nome)}</td>
                      <td style={{ color: "var(--tinta-2)" }}>
                        {String(c.tribunal ?? "—")}
                      </td>
                      <td className="num tabular-nums">{num(c.casos_juizo)}</td>
                      <td>
                        {num(c.casos_juizo) > 0 ? (
                          <div className="flex items-center">
                            <BarraDesfecho
                              favoraveis={c.favoraveis_juizo}
                              total={c.casos_juizo}
                            />
                            <AvisoAmostra total={c.casos_juizo} minimo={20} />
                          </div>
                        ) : (
                          <span style={{ color: "var(--tinta-3)" }}>—</span>
                        )}
                      </td>
                      <td className="num tabular-nums">{num(c.casos_proprios)}</td>
                      <td>
                        {num(c.casos_proprios) > 0 ? (
                          <div className="flex items-center">
                            <BarraDesfecho
                              favoraveis={c.favoraveis_proprios}
                              total={c.casos_proprios}
                            />
                            <AvisoAmostra total={c.casos_proprios} />
                          </div>
                        ) : (
                          <span style={{ color: "var(--tinta-3)" }}>—</span>
                        )}
                      </td>
                      <td
                        className="num tabular-nums font-medium"
                        style={{
                          color:
                            dif === null
                              ? "var(--tinta-3)"
                              : dif >= 0
                                ? "var(--exito)"
                                : "var(--reves)",
                        }}
                      >
                        {dif === null ? "—" : `${dif > 0 ? "+" : ""}${pct(dif)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}

      {porClasse.length > 0 && (
        <Cartao titulo="Por classe processual" className="mb-6">
          <div className="tabela-rolavel">
            <table className="dados">
              <thead>
                <tr>
                  <th>Órgão</th>
                  <th>Classe</th>
                  <th className="num">Casos</th>
                  <th>Procedência</th>
                  <th>Período coletado</th>
                </tr>
              </thead>
              <tbody>
                {porClasse.map((c, i) => (
                  <tr key={i}>
                    <td>{String(c.orgao_nome ?? "—")}</td>
                    <td style={{ color: "var(--tinta-2)" }}>{String(c.classe_cnj)}</td>
                    <td className="num tabular-nums">{num(c.total)}</td>
                    <td>
                      <div className="flex items-center">
                        <BarraDesfecho favoraveis={c.favoraveis} total={c.total} />
                        <AvisoAmostra total={c.total} minimo={20} />
                      </div>
                    </td>
                    <td className="text-xs" style={{ color: "var(--tinta-3)" }}>
                      {dataBR(c.de as string)} — {dataBR(c.ate as string)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}

      {podeColetar && (
        <>
          <h2 className="display mb-1 text-lg font-semibold">
            Buscar sentenças no DJEN
          </h2>
          <p className="mb-3 text-sm" style={{ color: "var(--tinta-2)" }}>
            Traz o <strong>teor publicado</strong> das sentenças de uma vara ou de
            um magistrado. É a coleta que permite estudar fundamentação.
          </p>
          <FormularioSentencas />

          <h2 className="display mb-1 mt-8 text-lg font-semibold">
            Contar desfechos no DataJud
          </h2>
          <p className="mb-3 text-sm" style={{ color: "var(--tinta-2)" }}>
            Sem texto, mas com o <strong>código oficial do julgamento</strong> e
            cobertura de todo o acervo do tribunal. É a coleta que dá volume
            estatístico.
          </p>
          <FormularioColeta />
        </>
      )}

      <p className="mt-6 text-xs leading-relaxed" style={{ color: "var(--tinta-3)" }}>
        Os processos coletados entram marcados como não-próprios e nunca se
        misturam ao índice de êxito do escritório. O ⚠ marca amostras pequenas
        demais para orientar decisão.
      </p>
    </>
  );
}
