"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { criarPrimeiroUsuario, entrar } from "./actions";

export function FormularioLogin({ destino }: { destino?: string }) {
  const [estado, acao] = useActionState(entrar, null);

  return (
    <form action={acao} className="cartao space-y-4 px-5 py-5">
      <input type="hidden" name="destino" value={destino ?? ""} />

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
        <label className="rotulo-campo" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="campo"
        />
      </div>

      <div>
        <label className="rotulo-campo" htmlFor="senha">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="campo"
        />
      </div>

      <Botao rotulo="Entrar" carregando="Entrando…" />
    </form>
  );
}

export function FormularioPrimeiroAcesso() {
  const [estado, acao] = useActionState(criarPrimeiroUsuario, null);

  return (
    <form action={acao} className="cartao space-y-4 px-5 py-5">
      <div
        className="cartao px-3 py-2 text-sm leading-relaxed"
        style={{ background: "var(--papel-2)" }}
      >
        <strong>Primeiro acesso.</strong> Nenhum usuário cadastrado ainda — crie o
        administrador. Depois disso esta tela some e novos usuários passam a ser
        criados por quem já tem acesso.
      </div>

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
        <label className="rotulo-campo" htmlFor="nome">
          Nome completo
        </label>
        <input id="nome" name="nome" required autoFocus className="campo" />
      </div>

      <div>
        <label className="rotulo-campo" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="campo"
        />
      </div>

      <div>
        <label className="rotulo-campo" htmlFor="senha">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          required
          className="campo"
        />
        <p className="mt-1 text-xs" style={{ color: "var(--tinta-3)" }}>
          Ao menos 10 caracteres. Comprimento protege mais que símbolo obrigatório.
        </p>
      </div>

      <div>
        <label className="rotulo-campo" htmlFor="confirmacao">
          Repita a senha
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

      <Botao rotulo="Criar administrador" carregando="Criando…" />
    </form>
  );
}

function Botao({ rotulo, carregando }: { rotulo: string; carregando: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="botao w-full justify-center"
      disabled={pending}
    >
      {pending ? carregando : rotulo}
    </button>
  );
}
