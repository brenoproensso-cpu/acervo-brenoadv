import { sair } from "@/app/login/actions";

const PAPEL: Record<string, string> = {
  administrador: "Administrador",
  advogado: "Advogado",
  colaborador: "Colaborador",
};

/**
 * Identificação do usuário logado e saída. É um form em vez de link
 * porque sair precisa ser POST — um GET de logout pode ser disparado por
 * qualquer imagem ou pré-carregamento.
 */
export function MenuUsuario({ nome, papel }: { nome: string; papel: string }) {
  const primeiro = nome.split(" ")[0];

  return (
    <div className="flex items-center gap-2 border-l pl-2">
      <div className="hidden text-right leading-tight sm:block">
        <div className="text-sm font-medium">{primeiro}</div>
        <div className="text-xs" style={{ color: "var(--tinta-3)" }}>
          {PAPEL[papel] ?? papel}
        </div>
      </div>
      <form action={sair}>
        <button type="submit" className="nav-link" title={`Sair (${nome})`}>
          Sair
        </button>
      </form>
    </div>
  );
}
