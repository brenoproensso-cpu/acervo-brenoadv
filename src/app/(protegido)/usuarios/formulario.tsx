"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { criarUsuario } from "./actions";

export function FormularioUsuario() {
  const [estado, acao] = useActionState(criarUsuario, null);

  return (
    <form action={acao} className="space-y-4">
      {estado?.erro && (
        <p
          className="cartao px-3 py-2 text-sm"
          style={{ background: "var(--reves-suave)", color: "var(--reves)" }}
          role="alert"
        >
          {estado.erro}
        </p>
      )}
      {estado?.ok && (
        <p className="text-sm" style={{ color: "var(--exito)" }}>
          Usuário criado. Passe a senha a ele por um canal seguro.
        </p>
      )}

      <div>
        <label className="rotulo-campo" htmlFor="nome">
          Nome
        </label>
        <input id="nome" name="nome" required className="campo" />
      </div>

      <div>
        <label className="rotulo-campo" htmlFor="email">
          E-mail
        </label>
        <input id="email" name="email" type="email" required className="campo" />
      </div>

      <div>
        <label className="rotulo-campo" htmlFor="papel">
          Papel
        </label>
        <select id="papel" name="papel" defaultValue="colaborador" className="campo">
          <option value="colaborador">Colaborador — consulta e conferência</option>
          <option value="advogado">Advogado — acesso completo ao acervo</option>
          <option value="administrador">Administrador — também gerencia usuários</option>
        </select>
      </div>

      <div>
        <label className="rotulo-campo" htmlFor="senha">
          Senha provisória
        </label>
        <input
          id="senha"
          name="senha"
          type="text"
          required
          className="campo"
          autoComplete="off"
        />
        <p className="mt-1 text-xs" style={{ color: "var(--tinta-3)" }}>
          Ao menos 10 caracteres. Fica visível para você conseguir repassar.
        </p>
      </div>

      <Botao />
    </form>
  );
}

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="botao w-full justify-center" disabled={pending}>
      {pending ? "Criando…" : "Criar usuário"}
    </button>
  );
}
