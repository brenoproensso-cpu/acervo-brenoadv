"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { coletar } from "../sincronizacao/actions";

export function FormularioColeta() {
  const [estado, acao] = useActionState(coletar, null);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form action={acao} className="cartao space-y-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="rotulo-campo" htmlFor="tribunal">
              Tribunal
            </label>
            <input
              id="tribunal"
              name="tribunal"
              className="campo"
              placeholder="trf3"
              defaultValue="trf3"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="rotulo-campo" htmlFor="orgao">
              Órgão julgador
            </label>
            <input
              id="orgao"
              name="orgao"
              className="campo"
              placeholder="1ª Vara Federal de Sorocaba"
            />
          </div>
        </div>
        <p className="-mt-1 text-xs leading-relaxed" style={{ color: "var(--tinta-3)" }}>
          O nome precisa bater com o usado pelo tribunal. Rode em modo de teste
          primeiro: o resultado lista os órgãos que apareceram, e você ajusta a
          grafia a partir dali.
        </p>

        <div>
          <label className="rotulo-campo" htmlFor="classe">
            Classe processual (opcional)
          </label>
          <input
            id="classe"
            name="classe"
            className="campo"
            placeholder="Procedimento do Juizado Especial Cível"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="rotulo-campo" htmlFor="julgado_de">
              Julgado de
            </label>
            <input id="julgado_de" name="julgado_de" type="date" className="campo" />
          </div>
          <div>
            <label className="rotulo-campo" htmlFor="julgado_ate">
              Julgado até
            </label>
            <input id="julgado_ate" name="julgado_ate" type="date" className="campo" />
          </div>
        </div>

        <details>
          <summary className="cursor-pointer text-sm" style={{ color: "var(--tinta-2)" }}>
            Recorte por distribuição e volume
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="rotulo-campo" htmlFor="ajuizado_de">
                Ajuizado de
              </label>
              <input id="ajuizado_de" name="ajuizado_de" type="date" className="campo" />
            </div>
            <div>
              <label className="rotulo-campo" htmlFor="ajuizado_ate">
                Ajuizado até
              </label>
              <input id="ajuizado_ate" name="ajuizado_ate" type="date" className="campo" />
            </div>
            <div>
              <label className="rotulo-campo" htmlFor="paginas">
                Páginas (100 cada)
              </label>
              <input
                id="paginas"
                name="paginas"
                type="number"
                min={1}
                max={10}
                defaultValue={1}
                className="campo"
              />
            </div>
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--tinta-3)" }}>
            O filtro de julgamento é aplicado depois da busca. Se a vara tem muito
            volume, aumente as páginas para alcançar o período desejado.
          </p>
        </details>

        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" name="dry_run" defaultChecked className="mt-1 h-4 w-4" />
          <span>
            Apenas testar
            <span className="block text-xs" style={{ color: "var(--tinta-3)" }}>
              Não grava. Mostra quantos processos há, quais órgãos casaram com o
              nome e como os desfechos foram classificados.
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
          <ResultadoColeta dados={estado.resultado as Record<string, unknown>} />
        ) : (
          <p className="text-sm" style={{ color: "var(--tinta-3)" }}>
            Nenhuma coleta executada nesta tela ainda.
          </p>
        )}
      </div>
    </div>
  );
}

function ResultadoColeta({ dados }: { dados: Record<string, unknown> }) {
  const orgaos = (dados.orgaosEncontrados as string[]) ?? [];
  const naoClass = (dados.movimentosNaoClassificados as string[]) ?? [];
  const porResultado = (dados.porResultado as Record<string, number>) ?? {};

  return (
    <div className="space-y-3">
      {Boolean(dados.aviso) && (
        <p className="text-sm leading-relaxed">{String(dados.aviso)}</p>
      )}

      {Object.keys(porResultado).length > 0 && (
        <div>
          <div className="rotulo-campo">Desfechos reconhecidos</div>
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

      {orgaos.length > 0 && (
        <div>
          <div className="rotulo-campo">Órgãos que casaram com o nome</div>
          <ul className="text-sm" style={{ color: "var(--tinta-2)" }}>
            {orgaos.map((o) => (
              <li key={o}>· {o}</li>
            ))}
          </ul>
        </div>
      )}

      {naoClass.length > 0 && (
        <div
          className="cartao px-3 py-2"
          style={{ background: "var(--papel-2)" }}
        >
          <div className="rotulo-campo">Movimentos não classificados</div>
          <p className="mb-2 text-xs leading-relaxed" style={{ color: "var(--tinta-3)" }}>
            Códigos que apareceram e não estão na tabela de desfechos. Se houver
            julgamento entre eles, me mostre esta lista que eu acrescento.
          </p>
          <ul className="text-xs" style={{ color: "var(--tinta-2)" }}>
            {naoClass.map((m) => (
              <li key={m}>· {m}</li>
            ))}
          </ul>
        </div>
      )}

      <pre
        className="max-h-72 overflow-auto rounded px-3 py-2 text-xs"
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
      {pending ? "Coletando…" : "Coletar"}
    </button>
  );
}
