import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acervo Jurídico — Breno Proenço Advogado",
  description:
    "Base de jurisprudência, sentenças, decisões e peças, com análise de padrões judiciais.",
  // Sistema interno com dado sensível: fora de buscador.
  robots: { index: false, follow: false },
};

/**
 * Casca mínima. O cabeçalho e a verificação de sessão ficam no layout do
 * grupo (protegido), para que a tela de login não herde nem um nem outro.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
