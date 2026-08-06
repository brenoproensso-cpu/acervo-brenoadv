import Link from "next/link";
import { listarDecisoes, catalogos, POR_PAGINA } from "@/lib/queries";
import {
  ORIGEM,
  TIPO_DOCUMENTO,
  RESULTADO,
  INSTANCIA,
  opcoes,
  rotulo,
  dataBR,
} from "@/lib/labels";
import { BarraFiltros, paraSelect } from "@/components/filtros";
import { Paginacao, SeloDesfecho, TituloPagina, Vazio } from "@/components/ui";
import { Trecho } from "@/components/trecho";

export const dynamic = "force-dynamic";

type Busca = Promise<Record<string, string | string[] | undefined>>;

const texto = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Decisoes({ searchParams }: { searchParams: Busca }) {
  const sp = await searchParams;
  const f = {
    q: texto(sp.q),
    acervo: texto(sp.acervo),
    origem: texto(sp.origem),
    tipo: texto(sp.tipo),
    resultado: texto(sp.resultado),
    beneficio: texto(sp.beneficio),
    orgao: texto(sp.orgao),
    favoravel: texto(sp.favoravel),
    pagina: Number(texto(sp.pagina) ?? 1) || 1,
  };

  const [{ linhas, total, pagina }, beneficios, orgaos] = await Promise.all([
    listarDecisoes(f),
    catalogos.beneficios(),
    catalogos.orgaos(),
  ]);

  const temFiltro = Object.entries(f).some(
    ([k, v]) => k !== "pagina" && v !== undefined,
  );

  return (
    <>
      <TituloPagina
        titulo="Decisões e jurisprudência"
        descricao="Sentenças e acórdãos do acervo próprio e material de referência externo."
        acao={
          <Link href="/decisoes/nova" className="botao">
            Cadastrar decisão
          </Link>
        }
      />

      <BarraFiltros
        action="/decisoes"
        busca={f.q}
        placeholder="Ementa, dispositivo, inteiro teor, relator…"
        temFiltro={temFiltro}
        campos={[
          {
            nome: "acervo",
            rotulo: "Acervo",
            valor: f.acervo,
            opcoes: [
              { valor: "coleta", texto: "Coleta do juízo (terceiros)" },
              { valor: "todos", texto: "Tudo junto" },
            ],
            vazio: "Do escritório",
          },
          {
            nome: "origem",
            rotulo: "Origem",
            valor: f.origem,
            opcoes: opcoes(ORIGEM).map((o) => ({ valor: o.valor, texto: o.texto })),
          },
          {
            nome: "tipo",
            rotulo: "Tipo",
            valor: f.tipo,
            opcoes: opcoes(TIPO_DOCUMENTO).map((o) => ({
              valor: o.valor,
              texto: o.texto,
            })),
          },
          {
            nome: "resultado",
            rotulo: "Resultado",
            valor: f.resultado,
            opcoes: opcoes(RESULTADO).map((o) => ({ valor: o.valor, texto: o.texto })),
          },
          {
            nome: "favoravel",
            rotulo: "Desfecho",
            valor: f.favoravel,
            opcoes: [
              { valor: "sim", texto: "Favorável" },
              { valor: "nao", texto: "Desfavorável" },
            ],
            vazio: "Qualquer",
          },
          {
            nome: "beneficio",
            rotulo: "Benefício",
            valor: f.beneficio,
            opcoes: paraSelect(beneficios),
          },
          {
            nome: "orgao",
            rotulo: "Órgão",
            valor: f.orgao,
            opcoes: paraSelect(orgaos),
          },
        ]}
      />

      <div className="cartao">
        {linhas.length === 0 ? (
          <Vazio
            mensagem={
              temFiltro
                ? "Nenhuma decisão encontrada com esses filtros."
                : "O acervo de decisões ainda está vazio."
            }
            acao={
              <Link href="/decisoes/nova" className="botao">
                Cadastrar a primeira
              </Link>
            }
          />
        ) : (
          <>
            <ul>
              {linhas.map((d) => (
                <li key={String(d.id)} className="border-b px-4 py-4 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="selo selo-marinho">
                      {rotulo(TIPO_DOCUMENTO, String(d.tipo))}
                    </span>
                    {d.origem === "jurisprudencia_externa" && (
                      <span className="selo selo-neutro">Referência externa</span>
                    )}
                    {d.proprio === false && (
                      <span
                        className="selo selo-neutro"
                        title="Processo de terceiro, coletado para medir o comportamento do juízo"
                      >
                        Coleta do juízo
                      </span>
                    )}
                    {d.tem_texto === false && (
                      <span
                        className="selo selo-neutro"
                        title="O DataJud entrega o código do julgamento, não o documento"
                      >
                        sem íntegra
                      </span>
                    )}
                    {Boolean(d.resultado) && (
                      <SeloDesfecho
                        favoravel={d.favoravel as boolean | null}
                        texto={rotulo(RESULTADO, String(d.resultado))}
                      />
                    )}
                    {Boolean(d.nivel_autoridade) && (
                      <span
                        className="selo selo-neutro"
                        title="Nível de autoridade do precedente"
                      >
                        Nível {String(d.nivel_autoridade)}
                      </span>
                    )}
                    {Boolean(d.beneficio_codigo) && (
                      <span className="selo selo-neutro">
                        {String(d.beneficio_codigo)}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-2">
                    <Link
                      href={`/decisoes/${d.id}`}
                      className="display text-base font-semibold hover:underline"
                    >
                      {String(d.titulo ?? "Decisão sem título")}
                    </Link>
                  </h3>

                  <div
                    className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs"
                    style={{ color: "var(--tinta-3)" }}
                  >
                    <span>{rotulo(INSTANCIA, String(d.instancia))}</span>
                    {Boolean(d.orgao_nome) && <span>· {String(d.orgao_nome)}</span>}
                    {Boolean(d.tribunal) && <span>· {String(d.tribunal)}</span>}
                    {Boolean(d.magistrado_nome) && <span>· {String(d.magistrado_nome)}</span>}
                    {Boolean(d.relator) && <span>· Rel. {String(d.relator)}</span>}
                    {Boolean(d.data_decisao) && <span>· {dataBR(String(d.data_decisao))}</span>}
                    {Boolean(d.numero_cnj) && (
                      <span className="tabular-nums">· {String(d.numero_cnj)}</span>
                    )}
                  </div>

                  {d.trecho ? (
                    <Trecho
                      html={String(d.trecho)}
                      className="mt-2 text-sm leading-relaxed"
                    />
                  ) : (
                    Boolean(d.resumo) && (
                      <p
                        className="mt-2 text-sm leading-relaxed"
                        style={{ color: "var(--tinta-2)" }}
                      >
                        {String(d.resumo)}
                      </p>
                    )
                  )}
                </li>
              ))}
            </ul>

            <Paginacao
              pagina={pagina}
              total={total}
              porPagina={POR_PAGINA}
              base="/decisoes"
              params={{
                q: f.q,
                acervo: f.acervo,
                origem: f.origem,
                tipo: f.tipo,
                resultado: f.resultado,
                beneficio: f.beneficio,
                orgao: f.orgao,
                favoravel: f.favoravel,
              }}
            />
          </>
        )}
      </div>
    </>
  );
}
