import Link from "next/link";
import { notFound } from "next/navigation";
import { decisao, decisaoTeses, decisaoLaudos } from "@/lib/queries";
import {
  CONCLUSAO,
  INSTANCIA,
  NIVEL_AUTORIDADE,
  ORIGEM,
  RESULTADO,
  TIPO_DOCUMENTO,
  TIPO_PERITO,
  dataBR,
  rotulo,
} from "@/lib/labels";
import { Cartao, SeloDesfecho } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DetalheDecisao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const d = await decisao(id).catch(() => null);
  if (!d) notFound();

  const [teses, laudos] = await Promise.all([
    decisaoTeses(id),
    d.processo_id ? decisaoLaudos(String(d.processo_id)) : Promise.resolve([]),
  ]);

  const campos: [string, React.ReactNode][] = [
    ["Origem", rotulo(ORIGEM, String(d.origem))],
    ["Tipo", rotulo(TIPO_DOCUMENTO, String(d.tipo))],
    ["Instância", rotulo(INSTANCIA, String(d.instancia))],
    ["Órgão julgador", d.orgao_nome ? String(d.orgao_nome) : "—"],
    ["Tribunal", d.orgao_tribunal || d.tribunal ? String(d.orgao_tribunal ?? d.tribunal) : "—"],
    ["Magistrado", d.magistrado_nome ? String(d.magistrado_nome) : "—"],
    ["Relator", d.relator ? String(d.relator) : "—"],
    ["Data da decisão", dataBR(d.data_decisao as string)],
    ["Publicação", dataBR(d.data_publicacao as string)],
    ["Processo", d.processo_numero ? String(d.processo_numero) : String(d.numero_cnj ?? "—")],
    ["Cliente", d.cliente_nome ? String(d.cliente_nome) : "—"],
    [
      "Benefício",
      d.beneficio_codigo ? `${d.beneficio_codigo} — ${d.beneficio_nome}` : "—",
    ],
    [
      "Autoridade",
      d.nivel_autoridade ? rotulo(NIVEL_AUTORIDADE, String(d.nivel_autoridade)) : "—",
    ],
    ["Fonte", d.fonte ? String(d.fonte) : "—"],
  ];

  return (
    <>
      <div className="mb-4">
        <Link href="/decisoes" className="text-sm" style={{ color: "var(--marinho)" }}>
          ← Decisões
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="selo selo-marinho">
          {rotulo(TIPO_DOCUMENTO, String(d.tipo))}
        </span>
        {Boolean(d.resultado) && (
          <SeloDesfecho
            favoravel={d.favoravel as boolean | null}
            texto={rotulo(RESULTADO, String(d.resultado))}
          />
        )}
        {d.origem === "jurisprudencia_externa" && (
          <span className="selo selo-neutro">Referência externa</span>
        )}
        {(d.tags as string[])?.map((t) => (
          <span key={t} className="selo selo-neutro">
            {t}
          </span>
        ))}
      </div>

      <h1 className="display mb-6 text-2xl font-semibold">
        {String(d.titulo ?? "Decisão sem título")}
      </h1>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {Boolean(d.ementa) && (
            <Cartao titulo="Ementa">
              <p className="texto-peca px-4 py-4">{String(d.ementa)}</p>
            </Cartao>
          )}

          {Boolean(d.dispositivo) && (
            <Cartao titulo="Dispositivo">
              <p className="texto-peca px-4 py-4">{String(d.dispositivo)}</p>
            </Cartao>
          )}

          {Boolean(d.texto_integral) && (
            <Cartao titulo="Inteiro teor">
              <div className="texto-peca max-h-[32rem] overflow-y-auto px-4 py-4">
                {String(d.texto_integral)}
              </div>
            </Cartao>
          )}

          {Boolean(d.observacoes) && (
            <Cartao titulo="Observações internas">
              <p className="texto-peca px-4 py-4">{String(d.observacoes)}</p>
            </Cartao>
          )}
        </div>

        <div className="space-y-5">
          <Cartao titulo="Identificação">
            <dl className="px-4 py-3">
              {campos.map(([r, v]) => (
                <div key={r} className="border-b py-2 last:border-b-0">
                  <dt className="rotulo-campo mb-0.5">{r}</dt>
                  <dd className="text-sm">{v}</dd>
                </div>
              ))}
            </dl>
            {Boolean(d.url_fonte) && (
              <div className="border-t px-4 py-3">
                <a
                  href={String(d.url_fonte)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm"
                  style={{ color: "var(--marinho)" }}
                >
                  Inteiro teor na origem →
                </a>
              </div>
            )}
          </Cartao>

          {/* O contexto pericial é o que dá sentido ao desfecho. */}
          {laudos.length > 0 && (
            <Cartao
              titulo="Perícia no processo"
              descricao="Laudos juntados ao mesmo processo desta decisão."
            >
              <ul className="px-4 py-2">
                {laudos.map((l) => (
                  <li key={String(l.id)} className="border-b py-3 last:border-b-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/peritos/${l.perito_id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {String(l.perito_nome ?? "Perito não informado")}
                        </Link>
                        <div className="text-xs" style={{ color: "var(--tinta-3)" }}>
                          {rotulo(TIPO_PERITO, String(l.perito_tipo))}
                          {l.especialidade ? ` · ${l.especialidade}` : ""}
                        </div>
                      </div>
                      <span
                        className={`selo ${
                          l.reconheceu_incapacidade ? "selo-exito" : "selo-reves"
                        }`}
                      >
                        {l.reconheceu_incapacidade ? "Reconheceu" : "Não reconheceu"}
                      </span>
                    </div>
                    <div className="mt-1.5 text-sm">
                      {rotulo(CONCLUSAO, l.conclusao as string)}
                    </div>
                    <div
                      className="mt-1 flex flex-wrap gap-x-3 text-xs"
                      style={{ color: "var(--tinta-3)" }}
                    >
                      <span>Laudo: {dataBR(l.data_laudo as string)}</span>
                      {Boolean(l.cid_principal) && <span>CID {String(l.cid_principal)}</span>}
                      {Boolean(l.dii) && <span>DII: {dataBR(l.dii as string)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}

          {teses.length > 0 && (
            <Cartao titulo="Teses">
              <ul className="px-4 py-2">
                {teses.map((t) => (
                  <li
                    key={String(t.id)}
                    className="flex items-start justify-between gap-2 border-b py-2.5 last:border-b-0"
                  >
                    <span className="text-sm">{String(t.nome)}</span>
                    {t.acolhida === null ? (
                      <span className="selo selo-neutro">Não avaliada</span>
                    ) : (
                      <span
                        className={`selo ${t.acolhida ? "selo-exito" : "selo-reves"}`}
                      >
                        {t.acolhida ? "Acolhida" : "Rejeitada"}
                      </span>
                    )}
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
