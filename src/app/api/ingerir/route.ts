/**
 * Porta HTTP da ingestão, para cron e automação externa.
 *
 * A lógica em si vive em @/lib/integracoes/executar, compartilhada com a
 * tela de Sincronização. Aqui fica só a autenticação por token e a
 * tradução de erro para status HTTP.
 *
 * Protegido por INGESTAO_TOKEN. Sem a variável definida, aceita apenas
 * chamadas locais — o que, publicado na internet, significa que a rota
 * fica fechada até alguém definir o token.
 */

import { NextResponse } from "next/server";
import { executarIngestao, registrarSincronizacao, escopoDe, type Corpo } from "@/lib/integracoes/executar";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function autorizado(req: Request): boolean {
  const token = process.env.INGESTAO_TOKEN;
  if (!token) {
    const host = req.headers.get("host") ?? "";
    return host.startsWith("localhost") || host.startsWith("127.0.0.1");
  }
  return req.headers.get("authorization") === `Bearer ${token}`;
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json(
      { erro: "Não autorizado. Defina INGESTAO_TOKEN e envie no header Authorization." },
      { status: 401 },
    );
  }

  let corpo: Corpo;
  try {
    corpo = (await req.json()) as Corpo;
  } catch {
    return NextResponse.json({ erro: "Corpo JSON inválido." }, { status: 400 });
  }

  try {
    return NextResponse.json(await executarIngestao(corpo));
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await registrarSincronizacao(corpo.fonte, escopoDe(corpo), {
      recebidos: 0,
      novos: 0,
      erro: mensagem,
    }).catch(() => {});
    return NextResponse.json({ erro: mensagem }, { status: 502 });
  }
}
