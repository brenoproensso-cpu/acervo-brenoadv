import Link from "next/link";
import {
  resumo,
  incapacidadeXExito,
  peritoDesempenho,
  beneficioDesempenho,
  exitoMensal,
} from "@/lib/queries";
import { num, pct, mesBR } from "@/lib/labels";
import {
  BarraDesfecho,
  Cartao,
  Indicador,
  TituloPagina,
  Vazio,
  AvisoAmostra,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Painel() {
  const [r, incapacidade, peritos, beneficios, mensal] = await Promise.all([
    resumo(),
    incapacidadeXExito(),
    peritoDesempenho(),
    beneficioDesempenho(),
    exitoMensal(),
  ]);

  const comIncapacidade = incapacidade.find((l) => l.reconheceu_incapacidade === true);
  const semIncapacidade = incapacidade.find((l) => l.reconheceu_incapacidade === false);
  const maxMensal = Math.max(1, ...mensal.map((m) => num(m.total)));

  return (
    <>
      <TituloPagina
        titulo="Painel"
        descricao="Visão geral do acervo e dos padrões observados nos casos já julgados."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador
          rotulo="Casos julgados"
          valor={num(r?.casos_julgados).toLocaleString("pt-BR")}
          detalhe={`${num(r?.processos).toLocaleString("pt-BR")} processos cadastrados`}
        />
        <Indicador
          rotulo="Índice de êxito"
          valor={pct(r?.taxa_exito_geral)}
          detalhe={`${num(r?.casos_favoraveis).toLocaleString("pt-BR")} desfechos favoráveis`}
          destaque
        />
        <Indicador
          rotulo="Decisões no acervo"
          valor={num(r?.decisoes_proprias).toLocaleString("pt-BR")}
          detalhe={`+ ${num(r?.jurisprudencia_externa)} de jurisprudência externa`}
        />
        <Indicador
          rotulo="Peças"
          valor={num(r?.pecas).toLocaleString("pt-BR")}
          detalhe={`${num(r?.pecas_modelo)} marcadas como modelo`}
        />
        <Indicador
          rotulo="Laudos periciais"
          valor={num(r?.laudos).toLocaleString("pt-BR")}
          detalhe={`${num(r?.peritos)} peritos cadastrados`}
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao
          titulo="A perícia decide o caso?"
          descricao="Desfecho conforme o laudo do perito judicial ter reconhecido ou não a incapacidade."
          className="self-start lg:col-span-1"
        >
          {incapacidade.length === 0 ? (
            <Vazio mensagem="Ainda não há casos julgados com laudo vinculado." />
          ) : (
            <div className="space-y-4 px-4 py-4">
              {[
                { linha: comIncapacidade, titulo: "Laudo reconheceu incapacidade" },
                { linha: semIncapacidade, titulo: "Laudo não reconheceu" },
              ].map(({ linha, titulo }) => (
                <div key={titulo}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="text-sm">{titulo}</span>
                    <span
                      className="display text-xl font-semibold tabular-nums"
                      style={{
                        color: linha?.reconheceu_incapacidade
                          ? "var(--exito)"
                          : "var(--reves)",
                      }}
                    >
                      {pct(linha?.taxa_exito)}
                    </span>
                  </div>
                  <BarraDesfecho
                    favoraveis={linha?.favoraveis}
                    total={linha?.total}
                  />
                  <div className="mt-1 text-xs" style={{ color: "var(--tinta-3)" }}>
                    {num(linha?.favoraveis)} favoráveis em {num(linha?.total)} casos
                  </div>
                </div>
              ))}

              <p
                className="border-t pt-3 text-xs leading-relaxed"
                style={{ color: "var(--tinta-3)" }}
              >
                A diferença entre as duas faixas mede o peso concreto do laudo
                pericial no desfecho.{" "}
                <Link href="/padroes" style={{ color: "var(--marinho)" }}>
                  Ver abertura completa →
                </Link>
              </p>
            </div>
          )}
        </Cartao>

        {/* -------------------------------------------------------------- */}
        <Cartao
          titulo="Peritos com maior volume"
          descricao="Taxa de êxito conforme a conclusão do laudo."
          className="lg:col-span-2"
        >
          {peritos.length === 0 ? (
            <Vazio mensagem="Nenhum perito com casos julgados." />
          ) : (
            <div className="tabela-rolavel">
              <table className="dados">
                <thead>
                  <tr>
                    <th>Perito</th>
                    <th className="num">Casos</th>
                    <th className="num">Reconhece</th>
                    <th>Êxito c/ incapacidade</th>
                    <th>Êxito s/ incapacidade</th>
                  </tr>
                </thead>
                <tbody>
                  {peritos.slice(0, 8).map((p) => (
                    <tr key={String(p.perito_id)}>
                      <td>
                        <Link
                          href={`/peritos/${p.perito_id}`}
                          className="font-medium hover:underline"
                        >
                          {String(p.perito_nome)}
                        </Link>
                        <div className="text-xs" style={{ color: "var(--tinta-3)" }}>
                          {String(p.especialidade ?? "—")}
                        </div>
                      </td>
                      <td className="num tabular-nums">{num(p.total_casos)}</td>
                      <td className="num tabular-nums">{pct(p.taxa_reconhecimento)}</td>
                      <td>
                        <div className="flex items-center">
                          <BarraDesfecho
                            favoraveis={p.favoraveis_com_incapacidade}
                            total={p.laudos_com_incapacidade}
                          />
                          <AvisoAmostra total={p.laudos_com_incapacidade} />
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center">
                          <BarraDesfecho
                            favoraveis={p.favoraveis_sem_incapacidade}
                            total={p.laudos_sem_incapacidade}
                          />
                          <AvisoAmostra total={p.laudos_sem_incapacidade} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      </div>

      {/* ---------------------------------------------------------------- */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Êxito por benefício">
          {beneficios.length === 0 ? (
            <Vazio mensagem="Sem dados." />
          ) : (
            <div className="tabela-rolavel">
              <table className="dados">
                <thead>
                  <tr>
                    <th>Benefício</th>
                    <th className="num">Casos</th>
                    <th>Êxito</th>
                  </tr>
                </thead>
                <tbody>
                  {beneficios.map((b) => (
                    <tr key={String(b.beneficio_id)}>
                      <td>
                        <span className="selo selo-neutro mr-2">
                          {String(b.beneficio_codigo)}
                        </span>
                        {String(b.beneficio_nome)}
                      </td>
                      <td className="num tabular-nums">{num(b.total)}</td>
                      <td>
                        <div className="flex items-center">
                          <BarraDesfecho favoraveis={b.favoraveis} total={b.total} />
                          <AvisoAmostra total={b.total} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>

        <Cartao
          titulo="Evolução mensal"
          descricao="Volume julgado e índice de êxito nos últimos 24 meses."
        >
          {mensal.length === 0 ? (
            <Vazio mensagem="Sem decisões datadas no período." />
          ) : (
            <div className="px-4 py-4">
              {/* items-stretch dá altura concreta a cada coluna, para que as
                  alturas percentuais das barras tenham base de cálculo. */}
              <div className="flex h-40 items-stretch gap-1">
                {mensal.map((m) => {
                  const total = num(m.total);
                  const taxa = num(m.taxa_exito);
                  const altura = (total / maxMensal) * 100;
                  return (
                    <div
                      key={String(m.mes)}
                      className="flex flex-1 flex-col justify-end"
                      title={`${mesBR(String(m.mes))}: ${total} julgados, ${pct(m.taxa_exito)} de êxito`}
                    >
                      {/* Altura total = volume do mês; parte verde = proporção favorável. */}
                      <div
                        className="flex w-full flex-col justify-end rounded-t"
                        style={{
                          height: `${Math.max(3, altura)}%`,
                          background: "var(--neutro-suave)",
                        }}
                      >
                        <div
                          className="w-full"
                          style={{ height: `${taxa}%`, background: "var(--exito)" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div
                className="mt-2 flex justify-between text-xs"
                style={{ color: "var(--tinta-3)" }}
              >
                <span>{mesBR(String(mensal[0]?.mes))}</span>
                <span>
                  altura = volume · parte verde = proporção favorável
                </span>
                <span>{mesBR(String(mensal[mensal.length - 1]?.mes))}</span>
              </div>
            </div>
          )}
        </Cartao>
      </div>

    </>
  );
}
