import Link from "next/link";
import {
  conclusaoXResultado,
  incapacidadeXExito,
  peritoDesempenho,
  orgaoDesempenho,
  magistradoDesempenho,
  beneficioDesempenho,
  teseDesempenho,
} from "@/lib/queries";
import { CONCLUSAO, num, pct, rotulo } from "@/lib/labels";
import {
  AvisoAmostra,
  BarraDesfecho,
  Cartao,
  TituloPagina,
  Vazio,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Padroes() {
  const [conclusoes, agregado, peritos, orgaos, magistrados, beneficios, teses] =
    await Promise.all([
      conclusaoXResultado(),
      incapacidadeXExito(),
      peritoDesempenho(),
      orgaoDesempenho(),
      magistradoDesempenho(),
      beneficioDesempenho(),
      teseDesempenho(),
    ]);

  const com = agregado.find((l) => l.reconheceu_incapacidade === true);
  const sem = agregado.find((l) => l.reconheceu_incapacidade === false);
  const diferenca =
    com && sem ? num(com.taxa_exito) - num(sem.taxa_exito) : null;

  return (
    <>
      <TituloPagina
        titulo="Padrões judiciais"
        descricao="Cruzamentos sobre as decisões do acervo próprio. Cada caso entra uma vez, pela sua última decisão."
      />

      {/* ================================================================ */}
      <Cartao
        titulo="Conclusão pericial × desfecho"
        descricao="Considera apenas o laudo do perito judicial, que é o que o juízo usa como prova técnica."
        className="mb-5"
      >
        {conclusoes.length === 0 ? (
          <Vazio mensagem="Ainda não há casos julgados com laudo pericial vinculado." />
        ) : (
          <>
            {diferenca !== null && (
              <div
                className="border-b px-4 py-4 text-sm leading-relaxed"
                style={{ background: "var(--papel-2)" }}
              >
                Quando o laudo reconheceu incapacidade, o desfecho foi favorável em{" "}
                <strong style={{ color: "var(--exito)" }}>
                  {pct(com?.taxa_exito)}
                </strong>{" "}
                dos {num(com?.total)} casos. Quando não reconheceu, em{" "}
                <strong style={{ color: "var(--reves)" }}>
                  {pct(sem?.taxa_exito)}
                </strong>{" "}
                dos {num(sem?.total)}. A diferença de{" "}
                <strong>{pct(Math.round(diferenca * 10) / 10)}</strong> é o peso
                que a perícia tem no resultado dentro deste acervo.
              </div>
            )}

            <div className="tabela-rolavel">
              <table className="dados">
                <thead>
                  <tr>
                    <th>Conclusão do laudo</th>
                    <th className="num">Casos</th>
                    <th className="num">Favoráveis</th>
                    <th className="num">Desfavoráveis</th>
                    <th>Índice de êxito</th>
                  </tr>
                </thead>
                <tbody>
                  {conclusoes.map((c) => (
                    <tr key={String(c.conclusao)}>
                      <td>
                        <span
                          className={`selo ${
                            c.reconheceu_incapacidade ? "selo-exito" : "selo-neutro"
                          } mr-2`}
                        >
                          {c.reconheceu_incapacidade ? "Reconheceu" : "Não"}
                        </span>
                        {rotulo(CONCLUSAO, c.conclusao as string)}
                      </td>
                      <td className="num tabular-nums">{num(c.total)}</td>
                      <td className="num tabular-nums">{num(c.favoraveis)}</td>
                      <td className="num tabular-nums">{num(c.desfavoraveis)}</td>
                      <td>
                        <div className="flex items-center">
                          <BarraDesfecho favoraveis={c.favoraveis} total={c.total} />
                          <AvisoAmostra total={c.total} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Cartao>

      {/* ================================================================ */}
      <Cartao
        titulo="Desempenho por perito"
        descricao="As duas últimas colunas são o que interessa na estratégia: o que acontece quando o perito reconhece e quando não reconhece."
        className="mb-5"
      >
        {peritos.length === 0 ? (
          <Vazio mensagem="Nenhum perito com casos julgados." />
        ) : (
          <div className="tabela-rolavel">
            <table className="dados">
              <thead>
                <tr>
                  <th>Perito</th>
                  <th>Especialidade</th>
                  <th className="num">Casos</th>
                  <th className="num">Reconhece</th>
                  <th className="num">Êxito geral</th>
                  <th>Êxito c/ incapacidade</th>
                  <th>Êxito s/ incapacidade</th>
                </tr>
              </thead>
              <tbody>
                {peritos.map((p) => (
                  <tr key={String(p.perito_id)}>
                    <td>
                      <Link
                        href={`/peritos/${p.perito_id}`}
                        className="font-medium hover:underline"
                      >
                        {String(p.perito_nome)}
                      </Link>
                    </td>
                    <td style={{ color: "var(--tinta-2)" }}>
                      {String(p.especialidade ?? "—")}
                    </td>
                    <td className="num tabular-nums">{num(p.total_casos)}</td>
                    <td className="num tabular-nums">{pct(p.taxa_reconhecimento)}</td>
                    <td className="num tabular-nums">{pct(p.taxa_exito_geral)}</td>
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

      {/* ================================================================ */}
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <TabelaSimples
          titulo="Por órgão julgador"
          colunas={["Órgão", "Tribunal"]}
          linhas={orgaos.map((o) => ({
            chave: String(o.orgao_julgador_id),
            celulas: [String(o.orgao_nome), String(o.tribunal ?? "—")],
            total: o.total,
            favoraveis: o.favoraveis,
          }))}
        />

        <TabelaSimples
          titulo="Por magistrado"
          colunas={["Magistrado"]}
          linhas={magistrados.map((m) => ({
            chave: String(m.magistrado_id),
            celulas: [String(m.magistrado_nome)],
            total: m.total,
            favoraveis: m.favoraveis,
          }))}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <TabelaSimples
          titulo="Por benefício"
          colunas={["Benefício"]}
          linhas={beneficios.map((b) => ({
            chave: String(b.beneficio_id),
            celulas: [`${b.beneficio_codigo} — ${b.beneficio_nome}`],
            total: b.total,
            favoraveis: b.favoraveis,
          }))}
        />

        <Cartao
          titulo="Por tese"
          descricao="Acolhimento é a tese aceita na fundamentação; êxito é o desfecho do caso em que ela foi suscitada."
        >
          {teses.length === 0 ? (
            <Vazio mensagem="Nenhuma tese vinculada a decisões ou peças." />
          ) : (
            <div className="tabela-rolavel">
              <table className="dados">
                <thead>
                  <tr>
                    <th>Tese</th>
                    <th className="num">Casos</th>
                    <th className="num">Acolhida</th>
                    <th className="num">Peças</th>
                    <th>Êxito</th>
                  </tr>
                </thead>
                <tbody>
                  {teses.map((t) => (
                    <tr key={String(t.tese_id)}>
                      <td>{String(t.tese_nome)}</td>
                      <td className="num tabular-nums">{num(t.total)}</td>
                      <td className="num tabular-nums">
                        {t.vezes_avaliada && num(t.vezes_avaliada) > 0
                          ? `${num(t.vezes_acolhida)}/${num(t.vezes_avaliada)}`
                          : "—"}
                      </td>
                      <td className="num tabular-nums">{num(t.pecas_vinculadas)}</td>
                      <td>
                        <div className="flex items-center">
                          <BarraDesfecho favoraveis={t.favoraveis} total={t.total} />
                          <AvisoAmostra total={t.total} />
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

      <p
        className="mt-6 text-xs leading-relaxed"
        style={{ color: "var(--tinta-3)" }}
      >
        O símbolo ⚠ marca recortes com menos de oito casos, em que a taxa
        oscila demais para orientar decisão. As correlações aqui descrevem o
        que já ocorreu no acervo e não projetam resultado futuro.
      </p>
    </>
  );
}

/** Tabela de desempenho com colunas descritivas variáveis. */
function TabelaSimples({
  titulo,
  colunas,
  linhas,
}: {
  titulo: string;
  colunas: string[];
  linhas: {
    chave: string;
    celulas: string[];
    total: unknown;
    favoraveis: unknown;
  }[];
}) {
  return (
    <Cartao titulo={titulo}>
      {linhas.length === 0 ? (
        <Vazio mensagem="Sem dados." />
      ) : (
        <div className="tabela-rolavel">
          <table className="dados">
            <thead>
              <tr>
                {colunas.map((c) => (
                  <th key={c}>{c}</th>
                ))}
                <th className="num">Casos</th>
                <th>Êxito</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.chave}>
                  {l.celulas.map((c, i) => (
                    <td key={i} style={i > 0 ? { color: "var(--tinta-2)" } : undefined}>
                      {c}
                    </td>
                  ))}
                  <td className="num tabular-nums">{num(l.total)}</td>
                  <td>
                    <div className="flex items-center">
                      <BarraDesfecho favoraveis={l.favoraveis} total={l.total} />
                      <AvisoAmostra total={l.total} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}
