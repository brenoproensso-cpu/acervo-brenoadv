import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acervo Jurídico — Breno Proenço Advogado",
  description:
    "Base de jurisprudência, sentenças, decisões e peças, com análise de padrões judiciais.",
};

const NAV = [
  { href: "/", texto: "Painel" },
  { href: "/decisoes", texto: "Decisões" },
  { href: "/pecas", texto: "Peças" },
  { href: "/padroes", texto: "Padrões" },
  { href: "/peritos", texto: "Peritos" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
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
      </body>
    </html>
  );
}
