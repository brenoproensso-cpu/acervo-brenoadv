import Link from "next/link";
import { notFound } from "next/navigation";
import { perito, peritoPorConclusao, peritoCasos } from "@/lib/queries";
import {
  CONCLUSAO,
  RESULTADO,
  TIPO_PERITO,
  dataBR,
  num,
  pct,
  rotulo,
} from "@/lib/labels";
import {
  AvisoAmostra,
  BarraDesfecho,
  Cartao,
  Indicador,
  SeloDesfecho,
  TituloPagina,
  Vazio,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DetalhePerito({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const p = await perito(id).catch(() => null);
  if (!p) notFound();

  const [porConclusao, casos] = await Promise.all([
    peritoPorConclusao(id),
    peritoCasos(id),
  ]);

  return (
    <>
      <div className="mb-4">
        <Link href="/peritos" className="text-sm" style={{ color: "var(--marinho)" }}>
          ← Peritos
        </Link>
      </div>

      <TituloPagina
        titulo={String(p.nome)}
        descricao={[
          rotulo(TIPO_PERITO, String(p.tipo)),
          p.especialidade,
          p.crm,
          p.uf,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Casos no acervo"
          valor={num(p.total_casos)}
          detalhe={
            p.ultima_decisao
              ? `Última decisão em ${dataBR(p.ultima_decisao as string)}`
              : undefined
          }
        />
        <Indicador
          rotulo="Reconhece incapacidade"
          valor={pct(p.taxa_reconhecimento)}
          detalhe={`${num(p.laudos_com_incapacidade)} de ${num(p.total_casos)} laudos`}
        />
        <Indicador
          rotulo="Êxito c/ incapacidade"
          valor={pct(p.taxa_exito_com_incapacidade)}
          detalhe={`${num(p.favoraveis_com_incapacidade)} favoráveis`}
          destaque
        />
        <Indicador
          rotulo="Êxito s/ incapacidade"
          valor={pct(p.taxa_exito_sem_incapacidade)}
          detalhe={`${num(p.favoraveis_sem_incapacidade)} favoráveis`}
        />
      </div>

      {Boolean(p.observacoes) && (
        <Cartao titulo="Anotações do escritório" className="mb-5">
          <p className="texto-peca px-4 py-4">{String(p.observacoes)}</p>
        </Cartao>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao titulo="Por tipo de conclusão" className="lg:col-span-1">
          {porConclusao.length === 0 ? (
            <Vazio mensagem="Sem casos julgados." />
          ) : (
            <div className="tabela-rolavel">
              <table className="dados">
                <thead>
                  <tr>
                    <th>Conclusão</th>
                    <th className="num">Casos</th>
                    <th>Êxito</th>
                  </tr>
                </thead>
                <tbody>
                  {porConclusao.map((c) => (
                    <tr key={String(c.conclusao)}>
                      <td>{rotulo(CONCLUSAO, c.conclusao as string)}</td>
                      <td className="num tabular-nums">{num(c.total)}</td>
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
          )}
        </Cartao>

        <Cartao
          titulo="Casos"
          descricao="Cada processo aparece pela sua última decisão."
          className="lg:col-span-2"
        >
          {casos.length === 0 ? (
            <Vazio mensagem="Nenhum caso julgado com laudo deste perito." />
          ) : (
            <div className="tabela-rolavel">
              <table className="dados">
                <thead>
                  <tr>
                    <th>Processo</th>
                    <th>Conclusão do laudo</th>
                    <th>Desfecho</th>
                    <th>Juízo</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {casos.map((c) => (
                    <tr key={String(c.laudo_id)}>
                      <td>
                        <Link
                          href={`/decisoes/${c.decisao_id}`}
                          className="tabular-nums hover:underline"
                        >
                          {String(c.numero_cnj ?? "—")}
                        </Link>
                        <div className="text-xs" style={{ color: "var(--tinta-3)" }}>
                          {String(c.cliente_nome ?? "")}
                          {c.beneficio_codigo ? ` · ${c.beneficio_codigo}` : ""}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`selo ${
                            c.reconheceu_incapacidade ? "selo-exito" : "selo-neutro"
                          }`}
                        >
                          {rotulo(CONCLUSAO, c.conclusao as string)}
                        </span>
                      </td>
                      <td>
                        <SeloDesfecho
                          favoravel={c.favoravel as boolean | null}
                          texto={rotulo(RESULTADO, String(c.resultado))}
                        />
                      </td>
                      <td style={{ color: "var(--tinta-2)" }}>
                        {String(c.orgao_nome ?? "—")}
                        <div className="text-xs" style={{ color: "var(--tinta-3)" }}>
                          {String(c.magistrado_nome ?? "")}
                        </div>
                      </td>
                      <td className="tabular-nums" style={{ color: "var(--tinta-2)" }}>
                        {dataBR(c.data_decisao as string)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      </div>
    </>
  );
}
