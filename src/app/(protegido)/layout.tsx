import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";
import { MenuUsuario } from "@/components/menu-usuario";

// A verificação de sessão consulta o banco, então nada aqui pode ser
// pré-renderizado estaticamente.
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/", texto: "Painel" },
  { href: "/decisoes", texto: "Decisões" },
  { href: "/pecas", texto: "Peças" },
  { href: "/publicacoes", texto: "Publicações" },
  { href: "/padroes", texto: "Padrões" },
  { href: "/peritos", texto: "Peritos" },
  { href: "/revisao", texto: "Conferência" },
  { href: "/sincronizacao", texto: "Sincronizar" },
];

export default async function LayoutProtegido({
  children,
}: {
  children: React.ReactNode;
}) {
  // Único ponto de verificação: toda tela dentro deste grupo passa por aqui.
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/login");

  return (
    <>
      <header className="border-b" style={{ background: "var(--superficie)" }}>
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="display text-lg font-semibold">Acervo Jurídico</span>
            <span
              className="hidden text-xs sm:inline"
              style={{ color: "var(--tinta-3)" }}
            >
              Breno Proenço Advogado
            </span>
          </Link>

          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="nav-link">
                {item.texto}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/decisoes/nova" className="botao botao-secundario">
              + Decisão
            </Link>
            <Link href="/pecas/nova" className="botao">
              + Peça
            </Link>
            {usuario.papel === "administrador" && (
              <Link href="/usuarios" className="nav-link" title="Usuários e acessos">
                Usuários
              </Link>
            )}
            <MenuUsuario nome={usuario.nome} papel={usuario.papel} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-7">{children}</main>

      <footer
        className="mx-auto max-w-[1400px] px-5 pb-10 pt-4 text-xs"
        style={{ color: "var(--tinta-3)" }}
      >
        Uso interno. As estatísticas descrevem o acervo cadastrado e não
        constituem previsão de resultado.
      </footer>
    </>
  );
}
