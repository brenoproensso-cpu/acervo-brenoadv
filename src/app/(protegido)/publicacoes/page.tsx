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
  // Publicação de terceiro, trazida pela coleta por vara, não entra na
  // lista de prazos do escritório — senão o controle de prazo some no
  // meio de centenas de intimações que não são nossas.
  const acervo = texto(sp.acervo) ?? "proprio";
  const pagina = Math.max(1, Number(texto(sp.pagina) ?? 1) || 1);

  const filtros = new Filtros();
  if (acervo === "proprio") filtros.addCru("p.coletada is false");
  if (acervo === "coleta") filtros.addCru("p.coletada is true");
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
            p.processo_id, p.coletada,
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
        descricao="Tudo o que veio do Diário de Justiça Eletrônico Nacional: as intimações do escritório e as publicações trazidas pela coleta por vara."
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
            <label className="rotulo-campo" htmlFor="acervo">
              Acervo
            </label>
            <select id="acervo" name="acervo" defaultValue={acervo} className="campo">
              <option value="proprio">Do escritório</option>
              <option value="coleta">Coleta do juízo</option>
              <option value="todos">Todos</option>
            </select>
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
          {(q || situacao || acervo !== "proprio") && (
            <Link href="/publicacoes" className="botao botao-secundario">
              Limpar
            </Link>
          )}
        </div>
      </form>

      <Cartao>
        {/* O total precisa aparecer: quem coletou 272 publicações quer
            confirmar que as 272 estão ali, não contar linha por linha. */}
        {linhas.length > 0 && (
          <p className="border-b px-4 py-2 text-sm" style={{ color: "var(--tinta-2)" }}>
            {num(totalNum)} {totalNum === 1 ? "publicação" : "publicações"}
            {acervo === "coleta"
              ? " na coleta do juízo"
              : acervo === "proprio"
                ? " do escritório"
                : ""}
            {q ? ` com "${q}"` : ""}.
          </p>
        )}

        {linhas.length === 0 ? (
          <Vazio
            mensagem={
              acervo === "proprio" && totalNum === 0 && !q && !situacao
                ? "Nenhuma publicação do escritório. As trazidas pela coleta por vara ficam em Acervo → Coleta do juízo."
                : acervo === "coleta" && totalNum === 0
                  ? "Nada coletado ainda. Use Juízo → Buscar sentenças no DJEN, sem marcar \"Apenas testar\"."
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
                    {Boolean(p.coletada) && (
                      <span
                        className="selo selo-neutro"
                        title="Trazida pela coleta por vara. Processo de terceiro, sem prazo a controlar."
                      >
                        Coleta do juízo
                      </span>
                    )}
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
              params={{ q, situacao, acervo }}
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
