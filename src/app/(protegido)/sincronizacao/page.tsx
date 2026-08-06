import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";
import { consultar } from "@/lib/db";
import { Cartao, TituloPagina, Vazio } from "@/components/ui";
import { FormularioSincronizacao } from "./formulario";

export const dynamic = "force-dynamic";

const FONTE: Record<string, string> = {
  djen: "DJEN",
  datajud: "DataJud",
  pdpj: "PDPJ",
  manual: "Manual",
};

export default async function Sincronizacao() {
  const eu = await usuarioAtual();
  if (!eu || eu.papel === "colaborador") redirect("/");

  const historico = await consultar(
    `select fonte, escopo, ultimo_sucesso, ultima_tentativa,
            itens_recebidos, itens_novos, status, erro
     from sincronizacao
     order by ultima_tentativa desc nulls last
     limit 15`,
  );

  return (
    <>
      <TituloPagina
        titulo="Sincronização"
        descricao="Busca dados nas fontes oficiais e traz para o acervo."
      />

      <div
        className="cartao mb-5 px-4 py-3 text-sm leading-relaxed"
        style={{ background: "var(--papel-2)" }}
      >
        Na primeira execução de cada fonte, deixe <strong>Apenas testar</strong>{" "}
        marcado. Nada é gravado e o resultado mostra como cada campo foi
        interpretado — é assim que se descobre um nome de campo divergente antes
        de sujar a base.
      </div>

      <FormularioSincronizacao />

      <Cartao titulo="Execuções anteriores" className="mt-5">
        {historico.length === 0 ? (
          <Vazio mensagem="Nenhuma sincronização registrada." />
        ) : (
          <div className="tabela-rolavel">
            <table className="dados">
              <thead>
                <tr>
                  <th>Fonte</th>
                  <th>Escopo</th>
                  <th>Última tentativa</th>
                  <th className="num">Recebidos</th>
                  <th className="num">Novos</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h, i) => (
                  <tr key={i}>
                    <td>{FONTE[String(h.fonte)] ?? String(h.fonte)}</td>
                    <td style={{ color: "var(--tinta-2)" }}>{String(h.escopo)}</td>
                    <td className="tabular-nums" style={{ color: "var(--tinta-2)" }}>
                      {h.ultima_tentativa
                        ? new Date(String(h.ultima_tentativa)).toLocaleString("pt-BR")
                        : "—"}
                    </td>
                    <td className="num tabular-nums">{Number(h.itens_recebidos)}</td>
                    <td className="num tabular-nums">{Number(h.itens_novos)}</td>
                    <td>
                      <span
                        className={`selo ${
                          h.status === "ok" ? "selo-exito" : "selo-reves"
                        }`}
                        title={h.erro ? String(h.erro) : undefined}
                      >
                        {h.status === "ok" ? "Sucesso" : "Erro"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </>
  );
}
