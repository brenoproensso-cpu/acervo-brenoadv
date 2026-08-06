"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { coletarSentencas } from "../sincronizacao/actions";

/**
 * Coleta de sentenças no DJEN, por vara ou por magistrado.
 *
 * Diferente da coleta do DataJud (que traz o código do julgamento), esta
 * traz o TEOR publicado — é a que serve para estudar fundamentação.
 */
export function FormularioSentencas() {
  const [estado, acao] = useActionState(coletarSentencas, null);

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
              defaultValue="TRF3"
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
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="rotulo-campo" htmlFor="s_de">
              De
            </label>
            <input id="s_de" name="de" type="date" className="campo" />
          </div>
          <div>
            <label className="rotulo-campo" htmlFor="s_ate">
              Até
            </label>
            <input id="s_ate" name="ate" type="date" className="campo" />
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
              defaultValue={3}
              className="campo"
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
            Só o que tem cara de sentença
            <span className="block text-xs" style={{ color: "var(--tinta-3)" }}>
              Descarta despacho e ato ordinatório, que entram no mesmo diário e
              contariam como decisão.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" name="dry_run" defaultChecked className="mt-1 h-4 w-4" />
          <span>
            Apenas testar
            <span className="block text-xs" style={{ color: "var(--tinta-3)" }}>
              Não grava. Mostra os órgãos encontrados e uma amostra do teor.
            </span>
          </span>
        </label>

        {estado?.erro && (
          <p
            className="cartao px-3 py-2 text-sm"
            style={{ background: "var(--reves-suave)", color: "var(--reves)" }}
            role="alert"
          >
            {estado.erro}
          </p>
        )}

        <Botao />
      </form>

      <div className="cartao px-4 py-4">
        <div className="rotulo-campo">Resultado</div>
        {estado?.ok ? (
          <Resultado dados={estado.resultado as Record<string, unknown>} />
        ) : (
          <p className="text-sm" style={{ color: "var(--tinta-3)" }}>
            Nenhuma coleta executada nesta tela ainda.
          </p>
        )}
      </div>
    </div>
  );
}

function Resultado({ dados }: { dados: Record<string, unknown> }) {
  const porOrgao = (dados.porOrgao as Record<string, number>) ?? {};
  const porResultado = (dados.porResultado as Record<string, number>) ?? {};
  const amostra = (dados.amostra as Record<string, unknown>[]) ?? [];

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
        <div>
          <div className="rotulo-campo">Amostra do teor</div>
          {amostra.map((a, i) => (
            <div key={i} className="mb-2 border-l-2 pl-3" style={{ borderColor: "var(--marinho)" }}>
              <div className="text-xs" style={{ color: "var(--tinta-3)" }}>
                {String(a.numeroCnj ?? "—")} · {String(a.orgao ?? "—")} ·{" "}
                {String(a.data ?? "—")}
              </div>
              <p className="texto-peca max-h-40 overflow-y-auto text-xs">
                {String(a.teor ?? "")}
              </p>
            </div>
          ))}
        </div>
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
