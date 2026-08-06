import { redirect } from "next/navigation";
import { existeAlgumUsuario, usuarioAtual } from "@/lib/auth";
import { FormularioLogin, FormularioPrimeiroAcesso } from "./formulario";

export const dynamic = "force-dynamic";

type Busca = Promise<Record<string, string | string[] | undefined>>;

export default async function Login({ searchParams }: { searchParams: Busca }) {
  const sp = await searchParams;
  const destino = typeof sp.destino === "string" ? sp.destino : undefined;

  // Já logado não precisa ver esta tela.
  if (await usuarioAtual().catch(() => null)) redirect("/");

  // O banco pode estar inacessível — e nesse caso não dá para afirmar se
  // existe usuário ou não. A tela precisa dizer isso, em vez de escolher
  // um dos dois formulários e enganar quem está olhando.
  let temUsuario: boolean;
  try {
    temUsuario = await existeAlgumUsuario();
  } catch (erro) {
    return <BancoIndisponivel erro={erro} />;
  }

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

/**
 * Diagnóstico de conexão. Aparece só quando o banco não responde, e traz
 * a causa provável — é a tela que alguém vê no primeiro deploy, quando a
 * variável de ambiente ainda não está certa.
 */
function BancoIndisponivel({ erro }: { erro: unknown }) {
  const mensagem = erro instanceof Error ? erro.message : String(erro);

  const causa = mensagem.includes("password authentication failed")
    ? "A senha na DATABASE_URL não confere com a do banco."
    : mensagem.includes("does not exist")
      ? "O banco indicado na DATABASE_URL não existe."
      : mensagem.includes("ENOTFOUND") || mensagem.includes("EAI_AGAIN")
        ? "O endereço do banco não foi encontrado. Confira o host."
        : mensagem.includes("ETIMEDOUT") || mensagem.includes("timeout")
          ? "O banco não respondeu a tempo. Confira host e porta."
          : mensagem.includes("DATABASE_URL")
            ? "A variável DATABASE_URL não está definida no ambiente."
            : "Não consegui abrir conexão com o banco.";

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12">
      <h1 className="display text-2xl font-semibold">Banco de dados indisponível</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--tinta-2)" }}>
        {causa}
      </p>

      <div className="cartao mt-5 px-4 py-4">
        <div className="rotulo-campo">Erro técnico</div>
        <code className="block text-xs" style={{ color: "var(--reves)" }}>
          {mensagem}
        </code>
      </div>

      <div className="mt-5 text-sm leading-relaxed" style={{ color: "var(--tinta-2)" }}>
        <p className="mb-2 font-medium">O que conferir na DATABASE_URL:</p>
        <ul className="list-disc space-y-1 pl-5" style={{ color: "var(--tinta-3)" }}>
          <li>Sem colchetes em volta da senha</li>
          <li>
            Caracteres especiais codificados —{" "}
            <code>@</code> vira <code>%40</code>
          </li>
          <li>Usuário no formato <code>postgres.SEU_PROJETO</code> quando usar o pooler</li>
          <li>Porta 6543 (transaction pooler) ou 5432 (session pooler)</li>
          <li>Depois de alterar a variável, é preciso publicar de novo</li>
        </ul>
      </div>
    </div>
  );
}
