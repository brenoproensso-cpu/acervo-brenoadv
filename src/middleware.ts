import { NextResponse, type NextRequest } from "next/server";

/**
 * Primeira barreira: quem não traz cookie de sessão é mandado ao login
 * sem custar uma consulta ao banco.
 *
 * O middleware roda no runtime Edge, onde o driver `pg` não existe — por
 * isso aqui só se verifica a PRESENÇA do cookie. A validação de verdade
 * (token existe, não expirou, usuário ativo) acontece no layout do grupo
 * (protegido), que roda em Node. Um cookie forjado passa por aqui e
 * morre lá.
 */
export function middleware(req: NextRequest) {
  const temCookie = req.cookies.has("acervo_sessao");
  if (temCookie) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  // Guarda o destino para voltar depois do login.
  if (req.nextUrl.pathname !== "/") {
    url.searchParams.set("destino", req.nextUrl.pathname + req.nextUrl.search);
  }
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Protege tudo, menos:
     *  - /login            a própria tela de entrada
     *  - /api              tem autenticação própria por token
     *  - /_next, favicon   arquivos estáticos do framework
     */
    "/((?!login|api|_next/static|_next/image|favicon.ico).*)",
  ],
};
