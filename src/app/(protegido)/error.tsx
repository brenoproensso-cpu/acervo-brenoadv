"use client";

import { useEffect } from "react";

/**
 * Tela de erro das páginas protegidas.
 *
 * O caso mais comum, e o mais confuso de diagnosticar, é o banco estar
 * numa versão anterior à do código: a aplicação foi publicada com uma
 * migration nova e ninguém a aplicou. O Postgres responde "column does
 * not exist" e o Next mostra apenas um dígito de erro, que não diz nada
 * a quem está usando.
 *
 * Aqui a causa é traduzida e o conserto vem junto.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const msg = error.message ?? "";
  const bancoDesatualizado =
    /column .* does not exist|relation .* does not exist|does not exist/i.test(msg);

  return (
    <div className="mx-auto max-w-2xl py-10">
      <h1 className="display text-2xl font-semibold">
        {bancoDesatualizado ? "Banco desatualizado" : "Algo deu errado nesta tela"}
      </h1>

      {bancoDesatualizado ? (
        <>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--tinta-2)" }}>
            O sistema foi publicado com uma alteração de banco que ainda não foi
            aplicada. O código procura uma tabela ou coluna que não existe no
            banco atual.
          </p>

          <div className="cartao mt-5 px-4 py-4">
            <div className="rotulo-campo">Como resolver</div>
            <ol
              className="list-decimal space-y-1 pl-5 text-sm leading-relaxed"
              style={{ color: "var(--tinta-2)" }}
            >
              <li>
                Abra o arquivo <code>db/instalar.sql</code> do repositório e copie
                tudo.
              </li>
              <li>
                No painel do Supabase, vá em <strong>SQL Editor → New query</strong>,
                cole e execute.
              </li>
              <li>Recarregue esta página.</li>
            </ol>
            <p className="mt-3 text-xs" style={{ color: "var(--tinta-3)" }}>
              Reaplicar é seguro: o arquivo é idempotente e não apaga nem duplica
              nada. Ele só acrescenta o que falta.
            </p>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--tinta-2)" }}>
          Tente novamente. Se persistir, o detalhe técnico abaixo ajuda a
          identificar a causa.
        </p>
      )}

      <div className="cartao mt-5 px-4 py-3">
        <div className="rotulo-campo">Detalhe técnico</div>
        <code className="block text-xs" style={{ color: "var(--reves)" }}>
          {msg || "sem mensagem"}
        </code>
        {error.digest && (
          <p className="mt-2 text-xs" style={{ color: "var(--tinta-3)" }}>
            Digest {error.digest} — use este número para achar o erro completo em
            Vercel → Deployments → Runtime Logs.
          </p>
        )}
      </div>

      <button onClick={reset} className="botao mt-5">
        Tentar de novo
      </button>
    </div>
  );
}
