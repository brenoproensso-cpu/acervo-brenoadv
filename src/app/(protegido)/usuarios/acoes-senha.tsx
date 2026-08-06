"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { desbloquear, redefinirSenhaDe } from "../conta/actions";

/**
 * Redefinição de senha pelo administrador.
 *
 * É o único caminho de recuperação do sistema — não há envio de e-mail.
 * A senha nova fica visível para quem a define, porque ela precisa ser
 * repassada ao usuário.
 */
export function RedefinirSenha({ usuarioId, nome }: { usuarioId: string; nome: string }) {
  const [estado, acao] = useActionState(redefinirSenhaDe, null);

  if (estado?.ok) {
    return (
      <span className="text-xs" style={{ color: "var(--exito)" }}>
        {estado.aviso}
      </span>
    );
  }

  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <input
        name="nova"
        type="text"
        className="campo w-44 py-1 text-xs"
        placeholder="nova senha"
        autoComplete="off"
        aria-label={`Nova senha de ${nome}`}
      />
      <button type="submit" className="botao botao-secundario px-2 py-1 text-xs">
        Redefinir
      </button>
      {estado?.erro && (
        <span className="text-xs" style={{ color: "var(--reves)" }}>
          {estado.erro}
        </span>
      )}
    </form>
  );
}

export function Desbloquear({ usuarioId }: { usuarioId: string }) {
  const [estado, acao] = useActionState(desbloquear, null);

  if (estado?.ok) {
    return (
      <span className="text-xs" style={{ color: "var(--exito)" }}>
        Desbloqueada
      </span>
    );
  }

  return (
    <form action={acao}>
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <BotaoDesbloqueio />
    </form>
  );
}

function BotaoDesbloqueio() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="selo selo-reves"
      disabled={pending}
      title="Zera as tentativas e libera o acesso"
    >
      {pending ? "…" : "desbloquear"}
    </button>
  );
}
