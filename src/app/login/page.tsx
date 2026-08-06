import { redirect } from "next/navigation";
import { existeAlgumUsuario, usuarioAtual } from "@/lib/auth";
import { FormularioLogin, FormularioPrimeiroAcesso } from "./formulario";

export const dynamic = "force-dynamic";

type Busca = Promise<Record<string, string | string[] | undefined>>;

export default async function Login({ searchParams }: { searchParams: Busca }) {
  const sp = await searchParams;
  const destino = typeof sp.destino === "string" ? sp.destino : undefined;
  // Já logado não precisa ver esta tela.
  if (await usuarioAtual()) redirect("/");

  const temUsuario = await existeAlgumUsuario();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-8">
        <h1 className="display text-2xl font-semibold">Acervo Jurídico</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--tinta-2)" }}>
          Breno Proenço Advogado
        </p>
      </div>

      {temUsuario ? <FormularioLogin destino={destino} /> : <FormularioPrimeiroAcesso />}

      <p className="mt-6 text-xs leading-relaxed" style={{ color: "var(--tinta-3)" }}>
        Sistema de uso interno. Os acessos são registrados. A base contém dados
        pessoais sensíveis de clientes — não compartilhe suas credenciais.
      </p>
    </div>
  );
}
