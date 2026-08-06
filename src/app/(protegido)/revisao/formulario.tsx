"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { confirmarDecisao, confirmarLaudo, descartarLaudo } from "./actions";

type Item = { valor: string; texto: string };

export function FormularioRevisao({
  laudoId,
  conclusaoSugerida,
  peritoSugerido,
  peritoNome,
  conclusoes,
  peritos,
}: {
  laudoId: string;
  conclusaoSugerida: string;
  peritoSugerido: string;
  peritoNome: string | null;
  conclusoes: Item[];
  peritos: Item[];
}) {
  const [estado, confirmar] = useActionState(confirmarLaudo, null);
  const [estadoDescarte, descartar] = useActionState(descartarLaudo, null);

  const erro = estado?.erro ?? estadoDescarte?.erro;

  if (estado?.ok) {
    return (
      <p className="text-sm" style={{ color: "var(--exito)" }}>
        Confirmado. Já conta nas estatísticas.
      </p>
    );
  }
  if (estadoDescarte?.ok) {
    return (
      <p className="text-sm" style={{ color: "var(--tinta-3)" }}>
        Descartado.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {erro && (
        <p className="text-sm" style={{ color: "var(--reves)" }} role="alert">
          {erro}
        </p>
      )}

      <form action={confirmar} className="space-y-3">
        <input type="hidden" name="laudo_id" value={laudoId} />

        <div>
          <label className="rotulo-campo" htmlFor={`conclusao-${laudoId}`}>
            Conclusão pericial
          </label>
          <select
            id={`conclusao-${laudoId}`}
            name="conclusao"
            defaultValue={conclusaoSugerida}
            className="campo"
            required
          >
            <option value="">Escolha…</option>
            {conclusoes.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.texto}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs" style={{ color: "var(--tinta-3)" }}>
            Sugestão da extração já selecionada. Corrija se estiver errada.
          </p>
        </div>

        <div>
          <label className="rotulo-campo" htmlFor={`perito-${laudoId}`}>
            Perito
          </label>
          <select
            id={`perito-${laudoId}`}
            name="perito_id"
            defaultValue={peritoSugerido}
            className="campo"
          >
            <option value="">Manter{peritoNome ? `: ${peritoNome}` : " sem perito"}</option>
            {peritos.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.texto}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="rotulo-campo" htmlFor={`revisor-${laudoId}`}>
            Conferido por
          </label>
          <input
            id={`revisor-${laudoId}`}
            name="revisor"
            className="campo"
            placeholder="Seu nome"
          />
        </div>

        <BotaoConfirmar />
      </form>

      <form action={descartar}>
        <input type="hidden" name="laudo_id" value={laudoId} />
        <BotaoDescartar />
      </form>
    </div>
  );
}

function BotaoConfirmar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="botao w-full justify-center" disabled={pending}>
      {pending ? "Confirmando…" : "Confirmar e incluir nas estatísticas"}
    </button>
  );
}

function BotaoDescartar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="botao botao-secundario w-full justify-center"
      disabled={pending}
      title="Use quando o documento não era um laudo pericial"
    >
      {pending ? "Descartando…" : "Não é laudo — descartar"}
    </button>
  );
}

// ---------------------------------------------------------------------
// Conferência de sentenças e acórdãos
// ---------------------------------------------------------------------

export function FormularioDecisao({
  decisaoId,
  resultadoSugerido,
  favoravelSugerido,
  resultados,
}: {
  decisaoId: string;
  resultadoSugerido: string;
  favoravelSugerido: boolean | null;
  resultados: Item[];
}) {
  const [estado, confirmar] = useActionState(confirmarDecisao, null);

  if (estado?.ok) {
    return (
      <p className="text-sm" style={{ color: "var(--exito)" }}>
        Confirmada. Já conta nas estatísticas.
      </p>
    );
  }

  return (
    <form action={confirmar} className="space-y-3">
      <input type="hidden" name="decisao_id" value={decisaoId} />

      {estado?.erro && (
        <p className="text-sm" style={{ color: "var(--reves)" }} role="alert">
          {estado.erro}
        </p>
      )}

      <div>
        <label className="rotulo-campo" htmlFor={`resultado-${decisaoId}`}>
          Resultado
        </label>
        <select
          id={`resultado-${decisaoId}`}
          name="resultado"
          defaultValue={resultadoSugerido}
          className="campo"
          required
        >
          <option value="">Escolha…</option>
          {resultados.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.texto}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="rotulo-campo" htmlFor={`favoravel-${decisaoId}`}>
          Foi favorável ao cliente?
        </label>
        <select
          id={`favoravel-${decisaoId}`}
          name="favoravel"
          defaultValue={
            favoravelSugerido === true ? "sim" : favoravelSugerido === false ? "nao" : ""
          }
          className="campo"
        >
          <option value="">Manter dedução automática</option>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </select>
        <p className="mt-1 text-xs" style={{ color: "var(--tinta-3)" }}>
          Confira sempre em recurso: um &quot;nego provimento&quot; ao recurso do
          INSS é favorável ao cliente.
        </p>
      </div>

      <BotaoConfirmarDecisao />
    </form>
  );
}

function BotaoConfirmarDecisao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="botao w-full justify-center" disabled={pending}>
      {pending ? "Confirmando…" : "Confirmar e incluir nas estatísticas"}
    </button>
  );
}
