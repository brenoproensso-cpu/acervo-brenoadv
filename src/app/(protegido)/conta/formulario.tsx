"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { trocarSenha } from "./actions";

export function FormularioSenha() {
  const [estado, acao] = useActionState(trocarSenha, null);

  if (estado?.ok) {
    return (
      <div className="px-4 py-4">
        <p className="text-sm" style={{ color: "var(--exito)" }}>
          {estado.aviso}
        </p>
      </div>
    );
  }

  return (
    <form action={acao} className="space-y-4 px-4 py-4">
      {estado?.erro && (
        <p
          className="cartao px-3 py-2 text-sm"
          style={{ background: "var(--reves-suave)", color: "var(--reves)" }}
          role="alert"
        >
          {estado.erro}
        </p>
      )}

      <div>
        <label className="rotulo-campo" htmlFor="atual">
          Senha atual
        </label>
        <input
          id="atual"
          name="atual"
          type="password"
          autoComplete="current-password"
          required
          className="campo"
        />
      </div>

      <div>
        <label className="rotulo-campo" htmlFor="nova">
          Nova senha
        </label>
        <input
          id="nova"
          name="nova"
          type="password"
          autoComplete="new-password"
          required
          className="campo"
        />
        <p className="mt-1 text-xs" style={{ color: "var(--tinta-3)" }}>
          Ao menos 10 caracteres.
        </p>
      </div>

      <div>
        <label className="rotulo-campo" htmlFor="confirmacao">
          Repita a nova senha
        </label>
        <input
          id="confirmacao"
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          required
          className="campo"
        />
      </div>

      <Botao />
    </form>
  );
}

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="botao" disabled={pending}>
      {pending ? "Trocando…" : "Trocar senha"}
    </button>
  );
}
