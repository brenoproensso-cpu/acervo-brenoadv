import Link from "next/link";
import { notFound } from "next/navigation";
import { consultar, consultarUm } from "@/lib/db";
import { CONCLUSAO, RESULTADO, dataBR, num, rotulo } from "@/lib/labels";
import { Cartao, SeloDesfecho } from "@/components/ui";

export const dynamic = "force-dynamic";

const CATEGORIA: Record<string, string> = {
  laudo: "Laudo pericial",
  sentenca: "Sentença",
  acordao: "Acórdão",
  inicial: "Petição inicial",
  contestacao: "Contestação",
  replica: "Réplica",
  impugnacao_laudo: "Impugnação ao laudo",
  recurso: "Recurso",
  quesitos: "Quesitos",
  decisao: "Decisão",
  despacho: "Despacho",
  procuracao: "Procuração",
  outros: "Outros",
};

export default async function DetalheDocumento({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const d = await consultarUm(
    `select doc.*, p.cliente_nome, p.numero_cnj as processo_numero, p.proprio
     from documento_externo doc
     left join processo p on p.id = doc.processo_id
     where doc.id = $1::uuid`,
    [id],
  ).catch(() => null);

  if (!d) notFound();

  // O que foi derivado deste documento — é o que dá sentido a ele estar aqui.
  const [laudos, decisoes] = await Promise.all([
    consultar(
      `select l.id, l.conclusao, l.confianca, l.revisado_em, pe.nome as perito_nome
       from laudo_pericial l left join perito pe on pe.id = l.perito_id
       where l.documento_externo_id = $1::uuid`,
      [id],
    ),
    consultar(
      `select id, titulo, resultado, favoravel, origem_dado
       from decisao where documento_externo_id = $1::uuid`,
      [id],
    ),
  ]);

  return (
    <>
      <div className="mb-4">
        <Link href="/documentos" className="text-sm" style={{ color: "var(--marinho)" }}>
          ← Documentos
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="selo selo-marinho">
          {CATEGORIA[String(d.categoria)] ?? String(d.categoria ?? "—")}
        </span>
        {Boolean(d.via_ocr) && <span className="selo selo-reves">OCR</span>}
        {Boolean(d.numero_cnj ?? d.processo_numero) && (
          <span className="selo selo-neutro tabular-nums">
            {String(d.processo_numero ?? d.numero_cnj)}
          </span>
        )}
      </div>

      <h1 className="display mb-6 text-2xl font-semibold">
        {String(d.nome ?? "Documento sem nome")}
      </h1>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Cartao titulo="Inteiro teor">
            {d.texto ? (
              <div className="texto-peca max-h-[46rem] overflow-y-auto px-4 py-4">
                {String(d.texto)}
              </div>
            ) : (
              <p className="px-4 py-8 text-sm" style={{ color: "var(--tinta-3)" }}>
                Este documento não teve texto extraído. Pode ser imagem sem OCR
                legível ou arquivo cujo conteúdo a fonte não disponibilizou.
              </p>
            )}
          </Cartao>
        </div>

        <div className="space-y-5">
          <Cartao titulo="Ficha">
            <dl className="px-4 py-3">
              {(
                [
                  ["Tipo na origem", String(d.tipo_origem ?? "—")],
                  ["Cliente", String(d.cliente_nome ?? "—")],
                  ["Juntada", dataBR(d.data_juntada as string)],
                  ["Páginas", d.paginas ? String(d.paginas) : "—"],
                  [
                    "Tamanho do texto",
                    d.texto
                      ? `${Math.round(String(d.texto).length / 1000)} mil caracteres`
                      : "—",
                  ],
                  ["Origem", String(d.fonte ?? "—").toUpperCase()],
                  ["Baixado em", dataBR(d.baixado_em as string)],
                ] as [string, string][]
              ).map(([r, v]) => (
                <div key={r} className="border-b py-2 last:border-b-0">
                  <dt className="rotulo-campo mb-0.5">{r}</dt>
                  <dd className="text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          </Cartao>

          {laudos.length > 0 && (
            <Cartao
              titulo="Laudo derivado"
              descricao="O que a extração leu deste documento."
            >
              <ul className="px-4 py-2">
                {laudos.map((l) => (
                  <li key={String(l.id)} className="border-b py-3 last:border-b-0">
                    <div className="text-sm font-medium">
                      {rotulo(CONCLUSAO, l.conclusao as string)}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: "var(--tinta-3)" }}>
                      {String(l.perito_nome ?? "perito não identificado")} · confiança{" "}
                      {Math.round(num(l.confianca) * 100)}%
                    </div>
                    <div className="mt-1">
                      {l.revisado_em ? (
                        <span className="selo selo-exito">Conferido</span>
                      ) : (
                        <Link href="/revisao" className="selo selo-reves">
                          Aguarda conferência
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}

          {decisoes.length > 0 && (
            <Cartao titulo="Decisão derivada">
              <ul className="px-4 py-2">
                {decisoes.map((dec) => (
                  <li key={String(dec.id)} className="border-b py-3 last:border-b-0">
                    <Link
                      href={`/decisoes/${dec.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {String(dec.titulo)}
                    </Link>
                    <div className="mt-1">
                      <SeloDesfecho
                        favoravel={dec.favoravel as boolean | null}
                        texto={rotulo(RESULTADO, String(dec.resultado))}
                      />
                    </div>
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
