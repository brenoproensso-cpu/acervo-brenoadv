import Link from "next/link";
import { consultar } from "@/lib/db";
import { catalogos } from "@/lib/queries";
import { CONCLUSAO, RESULTADO, dataBR, num, opcoes, rotulo } from "@/lib/labels";
import { Cartao, TituloPagina, Vazio } from "@/components/ui";
import { FormularioDecisao, FormularioRevisao } from "./formulario";

export const dynamic = "force-dynamic";

export default async function Revisao() {
  const [pendentes, decisoesPendentes, peritos] = await Promise.all([
    consultar(`select * from vw_laudos_pendentes limit 50`),
    consultar(`select * from vw_decisoes_pendentes limit 50`),
    catalogos.peritos(),
  ]);

  const total = pendentes.length;
  const totalDecisoes = decisoesPendentes.length;

  return (
    <>
      <TituloPagina
        titulo="Conferência de laudos"
        descricao="Laudos importados do PDPJ cuja conclusão foi inferida do texto. Ficam fora das estatísticas até serem confirmados aqui."
      />

      {total === 0 && totalDecisoes === 0 ? (
        <Cartao>
          <Vazio
            mensagem="Nada aguardando conferência."
            acao={
              <Link href="/padroes" className="botao botao-secundario">
                Ver padrões judiciais
              </Link>
            }
          />
        </Cartao>
      ) : (
        <>
          {/* Decisões primeiro: sem o desfecho, o laudo conferido não
              forma par e não gera nenhum ponto na estatística. */}
          {totalDecisoes > 0 && (
            <section className="mb-8">
              <h2 className="display mb-3 text-lg font-semibold">
                Sentenças e acórdãos ({totalDecisoes})
              </h2>
              <div className="space-y-5">
                {decisoesPendentes.map((d) => (
                  <Cartao key={String(d.decisao_id)}>
                    <div className="grid gap-0 lg:grid-cols-5">
                      <div className="border-b p-4 lg:col-span-3 lg:border-b-0 lg:border-r">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="selo selo-marinho">
                            {String(d.tipo) === "acordao" ? "Acórdão" : "Sentença"}
                          </span>
                          <span className="selo selo-neutro">
                            {String(d.numero_cnj ?? "sem número CNJ")}
                          </span>
                          {Boolean(d.beneficio_codigo) && (
                            <span className="selo selo-neutro">
                              {String(d.beneficio_codigo)}
                            </span>
                          )}
                          {Boolean(d.via_ocr) && <span className="selo selo-reves">OCR</span>}
                        </div>

                        <div className="mb-1 text-sm">
                          {String(d.cliente_nome ?? "Cliente não identificado")}
                          {Boolean(d.data_decisao) && (
                            <span style={{ color: "var(--tinta-3)" }}>
                              {" · "}
                              {dataBR(d.data_decisao as string)}
                            </span>
                          )}
                        </div>
                        <div className="mb-3 text-xs" style={{ color: "var(--tinta-3)" }}>
                          Sugestão: {rotulo(RESULTADO, String(d.resultado ?? ""))}
                        </div>

                        <div className="rotulo-campo">Dispositivo</div>
                        <blockquote
                          className="texto-peca max-h-56 overflow-y-auto border-l-2 pl-3"
                          style={{ borderColor: "var(--marinho)" }}
                        >
                          {String(d.trecho_dispositivo ?? "Dispositivo não capturado.")}
                        </blockquote>
                      </div>

                      <div className="p-4 lg:col-span-2">
                        <FormularioDecisao
                          decisaoId={String(d.decisao_id)}
                          resultadoSugerido={String(d.resultado ?? "")}
                          favoravelSugerido={d.favoravel as boolean | null}
                          resultados={opcoes(RESULTADO)}
                        />
                      </div>
                    </div>
                  </Cartao>
                ))}
              </div>
            </section>
          )}

          {total > 0 && (
            <h2 className="display mb-3 text-lg font-semibold">
              Laudos periciais ({total})
            </h2>
          )}
          {total > 0 && (
            <div
              className="cartao mb-5 px-4 py-3 text-sm leading-relaxed"
              style={{ background: "var(--papel-2)" }}
            >
              Ordenados do menos confiável para o mais confiável. Uma conclusão
              classificada errado distorce a taxa de êxito do perito — que é
              justamente o número usado para decidir se vale impugnar o laudo.
            </div>
          )}

          <div className="space-y-5">
            {pendentes.map((l) => (
              <Cartao key={String(l.laudo_id)}>
                <div className="grid gap-0 lg:grid-cols-5">
                  {/* Trecho que originou o palpite */}
                  <div className="border-b p-4 lg:col-span-3 lg:border-b-0 lg:border-r">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="selo selo-neutro">
                        {String(l.numero_cnj ?? "sem número CNJ")}
                      </span>
                      {Boolean(l.beneficio_codigo) && (
                        <span className="selo selo-neutro">
                          {String(l.beneficio_codigo)}
                        </span>
                      )}
                      {Boolean(l.via_ocr) && (
                        <span
                          className="selo selo-reves"
                          title="Texto obtido por OCR — mais sujeito a erro de leitura"
                        >
                          OCR
                        </span>
                      )}
                      <span
                        className={`selo ${
                          num(l.confianca) >= 0.8
                            ? "selo-exito"
                            : num(l.confianca) >= 0.5
                              ? "selo-neutro"
                              : "selo-reves"
                        }`}
                      >
                        confiança {Math.round(num(l.confianca) * 100)}%
                      </span>
                    </div>

                    <div className="mb-1 text-sm">
                      {String(l.cliente_nome ?? "Cliente não identificado")}
                      {Boolean(l.data_laudo) && (
                        <span style={{ color: "var(--tinta-3)" }}>
                          {" · "}
                          {dataBR(l.data_laudo as string)}
                        </span>
                      )}
                    </div>
                    <div className="mb-3 text-xs" style={{ color: "var(--tinta-3)" }}>
                      {String(l.documento_nome ?? "documento sem nome")}
                      {Boolean(l.cid_principal) && ` · CID ${l.cid_principal}`}
                    </div>

                    <div className="rotulo-campo">Trecho da conclusão</div>
                    <blockquote
                      className="texto-peca max-h-56 overflow-y-auto border-l-2 pl-3"
                      style={{ borderColor: "var(--marinho)" }}
                    >
                      {String(l.trecho_conclusao ?? "Trecho não capturado.")}
                    </blockquote>
                  </div>

                  {/* Conferência */}
                  <div className="p-4 lg:col-span-2">
                    <FormularioRevisao
                      laudoId={String(l.laudo_id)}
                      conclusaoSugerida={String(l.conclusao ?? "")}
                      peritoSugerido={l.perito_id ? String(l.perito_id) : ""}
                      peritoNome={l.perito_nome ? String(l.perito_nome) : null}
                      conclusoes={opcoes(CONCLUSAO)}
                      peritos={peritos.map((p) => ({ valor: p.id, texto: p.texto }))}
                    />
                  </div>
                </div>
              </Cartao>
            ))}
          </div>

          {total === 50 && (
            <p className="mt-5 text-xs" style={{ color: "var(--tinta-3)" }}>
              Mostrando os 50 menos confiáveis. Confirme estes e recarregue para
              ver os próximos.
            </p>
          )}
        </>
      )}
    </>
  );
}
