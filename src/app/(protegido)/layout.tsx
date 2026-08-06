import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";
import { migracoesPendentes } from "@/lib/queries";
import { MenuUsuario } from "@/components/menu-usuario";

// A verificação de sessão consulta o banco, então nada aqui pode ser
// pré-renderizado estaticamente.
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/", texto: "Painel" },
  { href: "/decisoes", texto: "Decisões" },
  { href: "/pecas", texto: "Peças" },
  { href: "/publicacoes", texto: "Publicações" },
  { href: "/documentos", texto: "Documentos" },
  { href: "/padroes", texto: "Padrões" },
  { href: "/juizo", texto: "Juízo" },
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

  // O aviso vive aqui, e não no painel, porque a tela que quebra por
  // falta de migration pode ser qualquer uma — e em produção o Next não
  // entrega a mensagem do erro ao navegador, só um dígito. Sem este
  // aviso, a causa fica invisível justamente onde ela se manifesta.
  const pendentes = await migracoesPendentes();

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

      <main className="mx-auto max-w-[1400px] px-5 py-7">
        {pendentes.length > 0 && (
          <div
            className="cartao mb-5 px-4 py-3 text-sm leading-relaxed"
            style={{ background: "var(--reves-suave)", color: "var(--reves)" }}
          >
            <strong>
              Banco desatualizado — {pendentes.length} alteração
              {pendentes.length === 1 ? "" : "ões"} pendente
              {pendentes.length === 1 ? "" : "s"}.
            </strong>{" "}
            O sistema foi publicado com mudanças de estrutura que o banco ainda
            não recebeu, e algumas telas vão falhar até isso ser aplicado. Copie{" "}
            <code>db/instalar.sql</code> do repositório e execute no SQL Editor
            do Supabase. Reaplicar é seguro: o arquivo só acrescenta o que falta.
            <span className="mt-1 block text-xs opacity-80">
              Faltando: {pendentes.join(", ")}
            </span>
          </div>
        )}
        {children}
      </main>

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
