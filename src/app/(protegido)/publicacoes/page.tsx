import Link from "next/link";
import { consultar } from "@/lib/db";
import { Filtros } from "@/lib/db";
import { dataBR, num } from "@/lib/labels";
import { Cartao, Paginacao, TituloPagina, Vazio } from "@/components/ui";
import { Trecho } from "@/components/trecho";

export const dynamic = "force-dynamic";

const POR_PAGINA = 25;
type Busca = Promise<Record<string, string | string[] | undefined>>;
const texto = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Publicacoes({ searchParams }: { searchParams: Busca }) {
  const sp = await searchParams;
  const q = texto(sp.q);
  const situacao = texto(sp.situacao);
  const pagina = Math.max(1, Number(texto(sp.pagina) ?? 1) || 1);

  const filtros = new Filtros();
  if (situacao === "nao_lidas") filtros.addCru("p.lida is false");
  if (situacao === "com_prazo") filtros.addCru("p.prazo_fatal is not null");
  filtros.add("p.tsv @@ busca_tsquery(?)", q);

  const where = filtros.where;
  const [{ total }] = await consultar<{ total: string }>(
    `select count(*)::int as total from publicacao p ${where}`,
    [...filtros.params],
  );

  const termo = filtros.proximo(q ?? "");
  const limite = filtros.proximo(POR_PAGINA);
  const desloc = filtros.proximo((pagina - 1) * POR_PAGINA);

  const linhas = await consultar(
    `select p.id, p.numero_cnj, p.tribunal, p.orgao, p.tipo_comunicacao,
            p.data_disponibilizacao, p.lida, p.prazo_dias, p.prazo_fatal,
            p.processo_id,
            left(coalesce(p.teor, ''), 400) as resumo,
            case when busca_tsquery(${termo}) is null then null
                 else ts_headline('portugues_sem_acento', coalesce(p.teor, ''),
                        busca_tsquery(${termo}),
                        'StartSel=@@R@@,StopSel=@@/R@@,MaxWords=45,MinWords=20,MaxFragments=1')
            end as trecho
     from publicacao p
     ${where}
     order by p.data_disponibilizacao desc nulls last, p.created_at desc
     limit ${limite} offset ${desloc}`,
    filtros.params,
  );

  const totalNum = Number(total);

  return (
    <>
      <TituloPagina
        titulo="Publicações"
        descricao="Comunicações e intimações recebidas do Diário de Justiça Eletrônico Nacional."
      />

      <form action="/publicacoes" method="get" className="cartao mb-5 px-4 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <label className="rotulo-campo" htmlFor="q">
              Busca no teor
            </label>
            <input id="q" name="q" defaultValue={q ?? ""} className="campo" />
          </div>
          <div className="min-w-[170px]">
            <label className="rotulo-campo" htmlFor="situacao">
              Situação
            </label>
            <select
              id="situacao"
              name="situacao"
              defaultValue={situacao ?? ""}
              className="campo"
            >
              <option value="">Todas</option>
              <option value="nao_lidas">Não lidas</option>
              <option value="com_prazo">Com prazo estimado</option>
            </select>
          </div>
          <button type="submit" className="botao">
            Filtrar
          </button>
          {(q || situacao) && (
            <Link href="/publicacoes" className="botao botao-secundario">
              Limpar
            </Link>
          )}
        </div>
      </form>

      <Cartao>
        {linhas.length === 0 ? (
          <Vazio
            mensagem={
              totalNum === 0 && !q && !situacao
                ? "Nenhuma publicação importada ainda. Rode: npm run ingerir -- djen --oab SEU_NUMERO --uf SP"
                : "Nenhuma publicação encontrada com esses filtros."
            }
          />
        ) : (
          <>
            <ul>
              {linhas.map((p) => (
                <li key={String(p.id)} className="border-b px-4 py-4 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {!p.lida && <span className="selo selo-marinho">Não lida</span>}
                    {Boolean(p.tipo_comunicacao) && (
                      <span className="selo selo-neutro">
                        {String(p.tipo_comunicacao)}
                      </span>
                    )}
                    {Boolean(p.prazo_dias) && (
                      <span
                        className="selo selo-reves"
                        title="Estimativa a partir do tipo de comunicação — confira a contagem real"
                      >
                        prazo sugerido: {num(p.prazo_dias)} dias
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-baseline gap-x-3 text-sm">
                    <span className="tabular-nums font-medium">
                      {String(p.numero_cnj ?? "sem número")}
                    </span>
                    <span className="text-xs" style={{ color: "var(--tinta-3)" }}>
                      {[p.tribunal, p.orgao].filter(Boolean).join(" · ")}
                      {Boolean(p.data_disponibilizacao) &&
                        ` · disponibilizada em ${dataBR(p.data_disponibilizacao as string)}`}
                    </span>
                  </div>

                  {p.trecho ? (
                    <Trecho
                      html={String(p.trecho)}
                      className="mt-2 text-sm leading-relaxed"
                    />
                  ) : (
                    Boolean(p.resumo) && (
                      <p
                        className="mt-2 text-sm leading-relaxed"
                        style={{ color: "var(--tinta-2)" }}
                      >
                        {String(p.resumo)}
                      </p>
                    )
                  )}
                </li>
              ))}
            </ul>

            <Paginacao
              pagina={pagina}
              total={totalNum}
              porPagina={POR_PAGINA}
              base="/publicacoes"
              params={{ q, situacao }}
            />
          </>
        )}
      </Cartao>

      <p className="mt-5 text-xs leading-relaxed" style={{ color: "var(--tinta-3)" }}>
        O prazo exibido é uma sugestão derivada do tipo de comunicação. Suspensão
        de expediente, feriado local e intimação pessoal não constam do payload do
        DJEN — a contagem definitiva continua sendo conferida no processo.
      </p>
    </>
  );
}
