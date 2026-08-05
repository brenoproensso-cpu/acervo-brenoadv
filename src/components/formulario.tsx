"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

type Estado = { erro?: string } | null;

export function Formulario({
  action,
  children,
  rotuloEnvio = "Salvar",
}: {
  action: (estado: unknown, form: FormData) => Promise<Estado>;
  children: React.ReactNode;
  rotuloEnvio?: string;
}) {
  const [estado, enviar] = useActionState(action, null);

  return (
    <form action={enviar} className="space-y-5">
      {estado?.erro && (
        <div
          className="cartao px-4 py-3 text-sm"
          style={{ background: "var(--reves-suave)", color: "var(--reves)" }}
          role="alert"
        >
          {estado.erro}
        </div>
      )}
      {children}
      <BotaoEnvio rotulo={rotuloEnvio} />
    </form>
  );
}

function BotaoEnvio({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="botao" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </button>
  );
}

// ---------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------

export function Campo({
  nome,
  rotulo,
  tipo = "text",
  obrigatorio = false,
  dica,
  padrao,
}: {
  nome: string;
  rotulo: string;
  tipo?: string;
  obrigatorio?: boolean;
  dica?: string;
  padrao?: string;
}) {
  return (
    <div>
      <label className="rotulo-campo" htmlFor={nome}>
        {rotulo}
        {obrigatorio && <span style={{ color: "var(--reves)" }}> *</span>}
      </label>
      <input
        id={nome}
        name={nome}
        type={tipo}
        required={obrigatorio}
        defaultValue={padrao}
        className="campo"
      />
      {dica && (
        <p className="mt-1 text-xs" style={{ color: "var(--tinta-3)" }}>
          {dica}
        </p>
      )}
    </div>
  );
}

export function Selecao({
  nome,
  rotulo,
  opcoes,
  vazio = "—",
  padrao,
  dica,
}: {
  nome: string;
  rotulo: string;
  opcoes: { valor: string; texto: string }[];
  vazio?: string;
  padrao?: string;
  dica?: string;
}) {
  return (
    <div>
      <label className="rotulo-campo" htmlFor={nome}>
        {rotulo}
      </label>
      <select id={nome} name={nome} defaultValue={padrao ?? ""} className="campo">
        <option value="">{vazio}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      {dica && (
        <p className="mt-1 text-xs" style={{ color: "var(--tinta-3)" }}>
          {dica}
        </p>
      )}
    </div>
  );
}

export function AreaTexto({
  nome,
  rotulo,
  linhas = 5,
  dica,
}: {
  nome: string;
  rotulo: string;
  linhas?: number;
  dica?: string;
}) {
  return (
    <div>
      <label className="rotulo-campo" htmlFor={nome}>
        {rotulo}
      </label>
      <textarea id={nome} name={nome} rows={linhas} className="campo" />
      {dica && (
        <p className="mt-1 text-xs" style={{ color: "var(--tinta-3)" }}>
          {dica}
        </p>
      )}
    </div>
  );
}

export function MultiSelecao({
  nome,
  rotulo,
  opcoes,
  dica,
}: {
  nome: string;
  rotulo: string;
  opcoes: { valor: string; texto: string }[];
  dica?: string;
}) {
  return (
    <div>
      <label className="rotulo-campo" htmlFor={nome}>
        {rotulo}
      </label>
      <select id={nome} name={nome} multiple size={6} className="campo">
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      {dica && (
        <p className="mt-1 text-xs" style={{ color: "var(--tinta-3)" }}>
          {dica}
        </p>
      )}
    </div>
  );
}

export function Secao({
  titulo,
  descricao,
  children,
  colunas = 2,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  colunas?: 1 | 2 | 3;
}) {
  const grid =
    colunas === 1 ? "" : colunas === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <section className="cartao">
      <header className="border-b px-4 py-3">
        <h2 className="display text-base font-semibold">{titulo}</h2>
        {descricao && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--tinta-3)" }}>
            {descricao}
          </p>
        )}
      </header>
      <div className={`grid gap-4 px-4 py-4 ${grid}`}>{children}</div>
    </section>
  );
}
