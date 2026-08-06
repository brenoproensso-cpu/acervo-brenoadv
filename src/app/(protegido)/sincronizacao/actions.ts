"use server";

import { revalidatePath } from "next/cache";
import { usuarioAtual } from "@/lib/auth";
import { executarIngestao, type Corpo } from "@/lib/integracoes/executar";

/**
 * Dispara a ingestão a partir da tela, com a sessão do usuário como
 * autorização. É a mesma função que a rota HTTP chama — só muda quem
 * autentica.
 */
export async function sincronizar(_estado: unknown, form: FormData) {
  const eu = await usuarioAtual();
  if (!eu || eu.papel === "colaborador") {
    return { erro: "Sem permissão para sincronizar." };
  }

  const fonte = String(form.get("fonte") ?? "");
  if (!["djen", "datajud", "pdpj"].includes(fonte)) {
    return { erro: "Escolha uma fonte." };
  }

  const corpo: Corpo = {
    fonte: fonte as Corpo["fonte"],
    dryRun: form.get("dry_run") === "on",
  };

  if (fonte === "djen") {
    corpo.numeroOab = String(form.get("oab") ?? "").trim();
    corpo.ufOab = String(form.get("uf") ?? "").trim().toUpperCase();
    if (!corpo.numeroOab || !corpo.ufOab) {
      return { erro: "Informe o número da OAB e a UF." };
    }
    const dias = Math.min(Math.max(Number(form.get("dias") ?? 7), 1), 90);
    const hoje = new Date();
    corpo.dataFim = hoje.toISOString().slice(0, 10);
    corpo.dataInicio = new Date(hoje.getTime() - dias * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }

  if (fonte === "datajud") {
    const cnj = String(form.get("cnj") ?? "").trim();
    if (cnj) corpo.numeroCnj = cnj;
    else corpo.pendentes = true;
    corpo.limite = 50;
  }

  if (fonte === "pdpj") {
    const cnj = String(form.get("cnj") ?? "").trim();
    if (!cnj) return { erro: "Informe o número do processo." };
    corpo.numeroCnj = cnj;
  }

  try {
    const resultado = await executarIngestao(corpo);
    revalidatePath("/sincronizacao");
    revalidatePath("/");
    return { ok: true, resultado };
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : "Falha na sincronização.",
    };
  }
}
