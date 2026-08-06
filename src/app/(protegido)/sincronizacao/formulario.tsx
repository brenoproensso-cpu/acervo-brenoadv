"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { sincronizar } from "./actions";

const FONTES = [
  {
    valor: "djen",
    nome: "DJEN — publicações",
    descricao:
      "Comunicações e intimações dos últimos dias, buscadas pela sua OAB. Quando o tribunal publica a sentença inteira no teor, a decisão também é extraída.",
  },
  {
    valor: "datajud",
    nome: "DataJud — processos e movimentos",
    descricao:
      "Metadados e linha do tempo. Sem número, atualiza os processos já cadastrados; com número, consulta um só. Não traz texto de documento.",
  },
  {
    valor: "pdpj",
    nome: "PDPJ — documentos do processo",
    descricao:
      "Petições, sentenças e laudos periciais. É a única fonte que alimenta a análise por perito. Exige credencial própria configurada.",
  },
];

export function FormularioSincronizacao() {
  const [estado, acao] = useActionState(sincronizar, null);
  const [fonte, setFonte] = useState("djen");

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form action={acao} className="cartao space-y-4 px-4 py-4">
        <div>
          <label className="rotulo-campo" htmlFor="fonte">
            Fonte
          </label>
          <select
            id="fonte"
            name="fonte"
            value={fonte}
            onChange={(e) => setFonte(e.target.value)}
            className="campo"
          >
            {FONTES.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.nome}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--tinta-3)" }}>
            {FONTES.find((f) => f.valor === fonte)?.descricao}
          </p>
        </div>

        {fonte === "djen" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="rotulo-campo" htmlFor="oab">
                OAB
              </label>
              <input id="oab" name="oab" className="campo" placeholder="123456" />
            </div>
            <div>
              <label className="rotulo-campo" htmlFor="uf">
                UF
              </label>
              <input id="uf" name="uf" className="campo" placeholder="SP" maxLength={2} />
            </div>
            <div>
              <label className="rotulo-campo" htmlFor="dias">
                Últimos dias
              </label>
              <input
                id="dias"
                name="dias"
                type="number"
                min={1}
                max={90}
                defaultValue={7}
                className="campo"
              />
            </div>
          </div>
        )}

        {(fonte === "datajud" || fonte === "pdpj") && (
          <div>
            <label className="rotulo-campo" htmlFor="cnj">
              Número do processo{fonte === "datajud" ? " (opcional)" : ""}
            </label>
            <input
              id="cnj"
              name="cnj"
              className="campo"
              placeholder="1000123-45.2024.4.03.6110"
            />
            {fonte === "datajud" && (
              <p className="mt-1 text-xs" style={{ color: "var(--tinta-3)" }}>
                Em branco, atualiza até 50 processos já cadastrados. O tribunal de
                cada um sai do próprio número.
              </p>
            )}
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" name="dry_run" defaultChecked className="mt-1 h-4 w-4" />
          <span>
            Apenas testar
            <span className="block text-xs" style={{ color: "var(--tinta-3)" }}>
              Não grava nada. Mostra como os campos foram interpretados — use na
              primeira vez de cada fonte.
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
            Nenhuma sincronização executada nesta tela ainda.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Mostra o retorno de forma legível. O diagnóstico de contrato ganha
 * destaque: é ele que revela nome de campo errado na primeira execução.
 */
function Resultado({ dados }: { dados: Record<string, unknown> }) {
  const diag = dados.diagnostico as Record<string, string[]> | undefined;
  const vazios = diag?.camposQueSairamVazios ?? [];
  const ignorados = diag?.camposQueIgnoramos ?? [];

  return (
    <div className="space-y-3">
      {Boolean(dados.aviso) && (
        <p className="text-sm leading-relaxed">{String(dados.aviso)}</p>
      )}

      {vazios.length > 0 && (
        <div
          className="cartao px-3 py-2 text-sm leading-relaxed"
          style={{ background: "var(--reves-suave)", color: "var(--reves)" }}
        >
          <strong>Campos que não vieram preenchidos:</strong> {vazios.join(", ")}.
          O nome usado pela API provavelmente é outro — me mostre esta tela que eu
          corrijo o mapeamento.
        </div>
      )}

      {ignorados.length > 0 && (
        <p className="text-xs" style={{ color: "var(--tinta-3)" }}>
          A API também mandou, e não estamos usando: {ignorados.join(", ")}.
        </p>
      )}

      <pre
        className="max-h-96 overflow-auto rounded px-3 py-2 text-xs"
        style={{ background: "var(--papel-2)" }}
      >
        {JSON.stringify(dados, null, 2)}
      </pre>
    </div>
  );
}

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="botao w-full justify-center" disabled={pending}>
      {pending ? "Sincronizando…" : "Executar"}
    </button>
  );
}
