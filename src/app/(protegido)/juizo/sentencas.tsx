"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { coletarSentencas, diagnosticarDjen } from "../sincronizacao/actions";
import { dividirSentenca } from "@/lib/integracoes/extracao";
import { RESULTADO, rotulo } from "@/lib/labels";

/**
 * Coleta de sentenças no DJEN, por vara ou por magistrado.
 *
 * Diferente da coleta do DataJud (que traz o código do julgamento), esta
 * traz o TEOR publicado — é a que serve para estudar fundamentação.
 */
export function FormularioSentencas() {
  const [estado, acao] = useActionState(coletarSentencas, null);

  // O React 19 reseta o formulário ao fim da ação. Com campos não
  // controlados, tribunal, vara e datas somem a cada tentativa — e quem
  // acabou de receber um erro fica sem enxergar o que tinha pedido.
  const [campos, setCampos] = useState({
    tribunal: "TRF3",
    orgao: "",
    magistrado: "",
    contendo: "",
    de: "",
    ate: "",
    paginas: "3",
  });
  const muda = (nome: keyof typeof campos) => (e: { target: { value: string } }) =>
    setCampos((c) => ({ ...c, [nome]: e.target.value }));

  const [diagnostico, setDiagnostico] = useState<Record<string, unknown> | null>(null);
  const [diagnosticando, iniciarDiagnostico] = useTransition();

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form action={acao} className="cartao space-y-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="rotulo-campo" htmlFor="s_tribunal">
              Tribunal
            </label>
            <input
              id="s_tribunal"
              name="tribunal"
              className="campo"
              placeholder="TRF3"
              value={campos.tribunal}
              onChange={muda("tribunal")}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="rotulo-campo" htmlFor="s_orgao">
              Vara / órgão julgador
            </label>
            <input
              id="s_orgao"
              name="orgao"
              className="campo"
              placeholder="Juizado Especial Federal de Sorocaba"
              value={campos.orgao}
              onChange={muda("orgao")}
            />
          </div>
        </div>

        <div>
          <label className="rotulo-campo" htmlFor="s_magistrado">
            Magistrado (opcional)
          </label>
          <input
            id="s_magistrado"
            name="magistrado"
            className="campo"
            placeholder="Nome como assina nas sentenças"
            value={campos.magistrado}
            onChange={muda("magistrado")}
          />
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--tinta-3)" }}>
            O DJEN identifica o órgão, não quem assinou — mas quem assinou consta
            do próprio texto. O nome é procurado dentro do teor publicado, então
            precisa ser escrito como aparece na sentença.
          </p>
        </div>

        <div>
          <label className="rotulo-campo" htmlFor="s_contendo">
            Contendo no teor (opcional)
          </label>
          <input
            id="s_contendo"
            name="contendo"
            className="campo"
            placeholder="auxílio por incapacidade"
            value={campos.contendo}
            onChange={muda("contendo")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="rotulo-campo" htmlFor="s_de">
              De
            </label>
            <input
              id="s_de"
              name="de"
              type="date"
              className="campo"
              value={campos.de}
              onChange={muda("de")}
            />
          </div>
          <div>
            <label className="rotulo-campo" htmlFor="s_ate">
              Até
            </label>
            <input
              id="s_ate"
              name="ate"
              type="date"
              className="campo"
              value={campos.ate}
              onChange={muda("ate")}
            />
          </div>
          <div>
            <label className="rotulo-campo" htmlFor="s_paginas">
              Páginas (100 cada)
            </label>
            <input
              id="s_paginas"
              name="paginas"
              type="number"
              min={1}
              max={30}
              className="campo"
              value={campos.paginas}
              onChange={muda("paginas")}
            />
          </div>
        </div>
        <p className="-mt-2 text-xs" style={{ color: "var(--tinta-3)" }}>
          Sem datas, busca os últimos 30 dias. O diário publica muito: para
          alcançar um período longo, aumente as páginas.
        </p>

        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="somente_decisoes"
            defaultChecked
            className="mt-1 h-4 w-4"
          />
          <span>
            Contar só o que tem cara de sentença
            <span className="block text-xs" style={{ color: "var(--tinta-3)" }}>
              Despacho e ato ordinatório entram no mesmo diário e contariam como
              decisão. Marcado, eles ficam fora da estatística — mas continuam
              listados para leitura de qualquer forma.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" name="dry_run" defaultChecked className="mt-1 h-4 w-4" />
          <span>
            Apenas testar
            <span className="block text-xs" style={{ color: "var(--tinta-3)" }}>
              Não grava. Mostra os órgãos encontrados e deixa ler as sentenças.
            </span>
          </span>
        </label>

        {estado?.erro && (
          <div
            className="cartao px-3 py-2 text-sm leading-relaxed"
            style={{ background: "var(--reves-suave)", color: "var(--reves)" }}
            role="alert"
          >
            <p>{estado.erro}</p>
            <button
              type="button"
              className="botao botao-secundario mt-2"
              disabled={diagnosticando}
              onClick={() =>
                iniciarDiagnostico(async () => {
                  const r = await diagnosticarDjen();
                  setDiagnostico(r as Record<string, unknown>);
                })
              }
            >
              {diagnosticando ? "Testando conexão…" : "Descobrir o que está barrando"}
            </button>
          </div>
        )}

        <Botao />
      </form>

      <div className="cartao px-4 py-4">
        <div className="rotulo-campo">Resultado</div>
        {estado?.ok ? (
          <Resultado dados={estado.resultado as Record<string, unknown>} />
        ) : diagnostico ? (
          <Diagnostico dados={diagnostico} />
        ) : (
          <p className="text-sm" style={{ color: "var(--tinta-3)" }}>
            Nenhuma coleta executada nesta tela ainda.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Uma sentença da busca, aberta para leitura.
 *
 * Fechada mostra só a identificação; aberta, o texto dividido em
 * relatório, fundamentação e dispositivo. Sem isso a busca respondia
 * quantas sentenças existem sem deixar ler nenhuma.
 */
function Sentenca({ dados }: { dados: Record<string, unknown> }) {
  const teor = dados.teor ? String(dados.teor) : "";
  const partes = dividirSentenca(teor);

  return (
    <details className="mb-2 border-l-2 pl-3" style={{ borderColor: "var(--marinho)" }}>
      <summary className="cursor-pointer text-sm">
        <span className="font-medium">{String(dados.numeroCnj ?? "sem número")}</span>
        {Boolean(dados.tipo) && (
          <span className="selo selo-neutro ml-2">{String(dados.tipo)}</span>
        )}
        {Boolean(dados.resultado) && (
          <span className="selo selo-neutro ml-2">
            {rotulo(RESULTADO, String(dados.resultado))}
          </span>
        )}
        <span className="block text-xs" style={{ color: "var(--tinta-3)" }}>
          {String(dados.orgao ?? "—")} · {String(dados.data ?? "—")}
        </span>
        {Boolean(dados.motivoDescarte) && (
          <span className="block text-xs" style={{ color: "var(--reves)" }}>
            Não conta como sentença: {String(dados.motivoDescarte)}
          </span>
        )}
      </summary>

      {partes.dividida ? (
        <div className="mt-2 space-y-3">
          {Boolean(partes.fundamentacao) && (
            <div>
              <div className="rotulo-campo">
                {partes.relatorioSeparado ? "Fundamentação" : "Relatório e fundamentação"}
              </div>
              <p className="texto-peca text-xs">{partes.fundamentacao}</p>
            </div>
          )}
          {Boolean(partes.dispositivo) && (
            <div>
              <div className="rotulo-campo">Dispositivo</div>
              <p className="texto-peca text-xs">{partes.dispositivo}</p>
            </div>
          )}
          {Boolean(partes.relatorio) && (
            <div>
              <div className="rotulo-campo">Relatório</div>
              <p className="texto-peca text-xs">{partes.relatorio}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="texto-peca mt-2 text-xs">{teor}</p>
      )}
    </details>
  );
}

/**
 * Mostra o que cada chamada de teste respondeu.
 *
 * A conclusão vem escrita porque a tabela sozinha não diz o que fazer:
 * três 403 seguidos e um 200 no meio querem dizer coisas opostas.
 */
function Diagnostico({ dados }: { dados: Record<string, unknown> }) {
  if (dados.erro) {
    return <p className="text-sm">{String(dados.erro)}</p>;
  }

  const r = (dados.resultado ?? {}) as Record<string, unknown>;
  const testes = (r.testes as Record<string, unknown>[]) ?? [];

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed">{String(r.leitura ?? "")}</p>

      <div>
        <div className="rotulo-campo">Chamadas de teste</div>
        <ul className="text-sm">
          {testes.map((t, i) => (
            <li key={i} className="border-b py-1">
              <div className="flex justify-between gap-3">
                <span>{String(t.nome)}</span>
                <span
                  className="tabular-nums font-medium"
                  style={{
                    color: t.status === 200 ? "var(--exito)" : "var(--reves)",
                  }}
                >
                  {t.status === 0 ? "sem resposta" : String(t.status)}
                </span>
              </div>
              {Boolean(t.corpo) && (
                <p className="text-xs" style={{ color: "var(--tinta-3)" }}>
                  {String(t.corpo)}
                </p>
              )}
              {Boolean(t.servidor) && (
                <p className="text-xs" style={{ color: "var(--tinta-3)" }}>
                  respondeu: {String(t.servidor)}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs" style={{ color: "var(--tinta-3)" }}>
        Endereço consultado: <code>{String(r.base ?? "")}</code>
      </p>
    </div>
  );
}

function Resultado({ dados }: { dados: Record<string, unknown> }) {
  const porOrgao = (dados.porOrgao as Record<string, number>) ?? {};
  const porResultado = (dados.porResultado as Record<string, number>) ?? {};
  const amostra = (dados.amostra as Record<string, unknown>[]) ?? [];
  const sentencas = amostra.filter((a) => !a.motivoDescarte);
  const descartadas = amostra.filter((a) => a.motivoDescarte);

  return (
    <div className="space-y-3">
      {Boolean(dados.aviso) && (
        <p className="text-sm leading-relaxed">{String(dados.aviso)}</p>
      )}

      {Object.keys(porResultado).length > 0 && (
        <div>
          <div className="rotulo-campo">Desfechos lidos do dispositivo</div>
          <ul className="text-sm">
            {Object.entries(porResultado).map(([r, n]) => (
              <li key={r} className="flex justify-between border-b py-1">
                <span>{r.replace(/_/g, " ")}</span>
                <span className="tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(porOrgao).length > 0 && (
        <div>
          <div className="rotulo-campo">Órgãos encontrados</div>
          <p className="mb-1 text-xs" style={{ color: "var(--tinta-3)" }}>
            Use a grafia exata daqui no campo da vara.
          </p>
          <ul className="text-sm" style={{ color: "var(--tinta-2)" }}>
            {Object.entries(porOrgao)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12)
              .map(([o, n]) => (
                <li key={o}>
                  · {o} <span style={{ color: "var(--tinta-3)" }}>({n})</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {amostra.length > 0 && (
        <>
          {sentencas.length > 0 && (
            <div>
              <div className="rotulo-campo">Sentenças encontradas</div>
              <p className="mb-2 text-xs" style={{ color: "var(--tinta-3)" }}>
                Clique para ler, dividida em relatório, fundamentação e
                dispositivo.
              </p>
              {sentencas.map((a, i) => (
                <Sentenca key={i} dados={a} />
              ))}
            </div>
          )}

          {/* O que o filtro recusou também precisa ser legível. Sem isto a
              busca terminava em beco sem saída: "nenhuma com cara de
              sentença" e nada para conferir. */}
          {descartadas.length > 0 && (
            <div>
              <div className="rotulo-campo">Publicações sem cara de sentença</div>
              <p className="mb-2 text-xs leading-relaxed" style={{ color: "var(--tinta-3)" }}>
                Ficam fora da contagem de desfechos, mas estão aqui para leitura.
                Cada uma diz por que não passou. Se alguma for sentença de
                verdade, é o reconhecimento que precisa de ajuste.
              </p>
              {descartadas.map((a, i) => (
                <Sentenca key={i} dados={a} />
              ))}
            </div>
          )}

          {Number(dados.amostraDe ?? 0) > amostra.length && (
            <p className="text-xs" style={{ color: "var(--tinta-3)" }}>
              Mostrando {amostra.length} das {String(dados.amostraDe)} publicações
              que casaram com o recorte.
            </p>
          )}
        </>
      )}

      <pre
        className="max-h-60 overflow-auto rounded px-3 py-2 text-xs"
        style={{ background: "var(--papel-2)" }}
      >
        {JSON.stringify({ ...dados, amostra: undefined }, null, 2)}
      </pre>
    </div>
  );
}

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="botao w-full justify-center" disabled={pending}>
      {pending ? "Buscando no diário…" : "Buscar sentenças"}
    </button>
  );
}
