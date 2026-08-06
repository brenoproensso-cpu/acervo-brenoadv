import Link from "next/link";
import { consultar, Filtros } from "@/lib/db";
import { dataBR, num } from "@/lib/labels";
import { Cartao, Paginacao, TituloPagina, Vazio } from "@/components/ui";
import { Trecho } from "@/components/trecho";

export const dynamic = "force-dynamic";

const POR_PAGINA = 20;
type Busca = Promise<Record<string, string | string[] | undefined>>;
const texto = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) || undefined;

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

export default async function Documentos({ searchParams }: { searchParams: Busca }) {
  const sp = await searchParams;
  const q = texto(sp.q);
  const categoria = texto(sp.categoria);
  const pagina = Math.max(1, Number(texto(sp.pagina) ?? 1) || 1);

  const filtros = new Filtros();
  filtros.add("d.categoria = ?", categoria);
  filtros.add("d.tsv @@ busca_tsquery(?)", q);

  const where = filtros.where;
  const [{ total }] = await consultar<{ total: string }>(
    `select count(*)::int as total from documento_externo d ${where}`,
    [...filtros.params],
  );

  const termo = filtros.proximo(q ?? "");
  const limite = filtros.proximo(POR_PAGINA);
  const desloc = filtros.proximo((pagina - 1) * POR_PAGINA);

  const linhas = await consultar(
    `select d.id, d.nome, d.categoria, d.tipo_origem, d.data_juntada, d.via_ocr,
            d.numero_cnj, d.paginas, length(d.texto) as tamanho,
            p.cliente_nome,
            case when busca_tsquery(${termo}) is null then null
                 else ts_headline('portugues_sem_acento', coalesce(d.texto, ''),
                        busca_tsquery(${termo}),
                        'StartSel=@@R@@,StopSel=@@/R@@,MaxWords=45,MinWords=20,MaxFragments=1')
            end as trecho
     from documento_externo d
     left join processo p on p.id = d.processo_id
     ${where}
     order by d.data_juntada desc nulls last, d.baixado_em desc
     limit ${limite} offset ${desloc}`,
    filtros.params,
  );

  const totalNum = Number(total);

  return (
    <>
      <TituloPagina
        titulo="Documentos"
        descricao="Inteiro teor das peças, sentenças e laudos importados do PDPJ."
      />

      <div
        className="cartao mb-5 px-4 py-3 text-sm leading-relaxed"
        style={{ background: "var(--papel-2)" }}
      >
        Só o PDPJ entrega texto de documento. As decisões coletadas do DataJud
        em <Link href="/juizo" style={{ color: "var(--marinho)" }}>Juízo</Link>{" "}
        não têm íntegra — de lá vem o código do julgamento, não o arquivo. E o
        que aparece em{" "}
        <Link href="/publicacoes" style={{ color: "var(--marinho)" }}>
          Publicações
        </Link>{" "}
        é o teor publicado no diário, que às vezes traz a sentença inteira e às
        vezes só o aviso de que ela existe.
      </div>

      <form action="/documentos" method="get" className="cartao mb-5 px-4 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <label className="rotulo-campo" htmlFor="q">
              Busca no texto integral
            </label>
            <input id="q" name="q" defaultValue={q ?? ""} className="campo" />
          </div>
          <div className="min-w-[190px]">
            <label className="rotulo-campo" htmlFor="categoria">
              Tipo
            </label>
            <select
              id="categoria"
              name="categoria"
              defaultValue={categoria ?? ""}
              className="campo"
            >
              <option value="">Todos</option>
              {Object.entries(CATEGORIA).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="botao">
            Filtrar
          </button>
          {(q || categoria) && (
            <Link href="/documentos" className="botao botao-secundario">
              Limpar
            </Link>
          )}
        </div>
      </form>

      <Cartao>
        {linhas.length === 0 ? (
          <Vazio
            mensagem={
              totalNum === 0 && !q && !categoria
                ? "Nenhum documento importado ainda. Use Sincronizar → PDPJ."
                : "Nenhum documento encontrado com esses filtros."
            }
          />
        ) : (
          <>
            <ul>
              {linhas.map((d) => (
                <li key={String(d.id)} className="border-b px-4 py-4 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="selo selo-marinho">
                      {CATEGORIA[String(d.categoria)] ?? String(d.categoria ?? "—")}
                    </span>
                    {Boolean(d.via_ocr) && (
                      <span
                        className="selo selo-reves"
                        title="Texto obtido por OCR — sujeito a erro de leitura"
                      >
                        OCR
                      </span>
                    )}
                    {Boolean(d.numero_cnj) && (
                      <span className="selo selo-neutro tabular-nums">
                        {String(d.numero_cnj)}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-2">
                    <Link
                      href={`/documentos/${d.id}`}
                      className="display text-base font-semibold hover:underline"
                    >
                      {String(d.nome ?? "Documento sem nome")}
                    </Link>
                  </h3>

                  <div
                    className="mt-1 flex flex-wrap gap-x-3 text-xs"
                    style={{ color: "var(--tinta-3)" }}
                  >
                    {Boolean(d.cliente_nome) && <span>{String(d.cliente_nome)}</span>}
                    {Boolean(d.data_juntada) && (
                      <span>· juntado em {dataBR(d.data_juntada as string)}</span>
                    )}
                    <span>
                      ·{" "}
                      {num(d.tamanho) > 0
                        ? `${Math.round(num(d.tamanho) / 1000)} mil caracteres`
                        : "sem texto extraído"}
                    </span>
                  </div>

                  {Boolean(d.trecho) && (
                    <Trecho
                      html={String(d.trecho)}
                      className="mt-2 text-sm leading-relaxed"
                    />
                  )}
                </li>
              ))}
            </ul>

            <Paginacao
              pagina={pagina}
              total={totalNum}
              porPagina={POR_PAGINA}
              base="/documentos"
              params={{ q, categoria }}
            />
          </>
        )}
      </Cartao>
    </>
  );
}
