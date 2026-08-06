"use server";

import { revalidatePath } from "next/cache";
import { usuarioAtual } from "@/lib/auth";
import {
  coletarDjenPorOrgao,
  coletarOrgao,
  executarIngestao,
  type Corpo,
} from "@/lib/integracoes/executar";

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


/**
 * Coleta processos de um órgão julgador para medir como ele decide.
 *
 * Separada de `sincronizar` porque a natureza é outra: não traz dado do
 * escritório, traz população de referência. Os processos entram marcados
 * como não-próprios e nunca se misturam ao índice de êxito do escritório.
 */
export async function coletar(_estado: unknown, form: FormData) {
  const eu = await usuarioAtual();
  if (!eu || eu.papel === "colaborador") {
    return { erro: "Sem permissão para coletar." };
  }

  const tribunal = String(form.get("tribunal") ?? "").trim().toLowerCase();
  const orgao = String(form.get("orgao") ?? "").trim();

  if (!tribunal) return { erro: "Informe o tribunal (ex.: trf3, tjsp)." };
  if (!orgao) return { erro: "Informe o nome do órgão julgador." };

  const texto = (n: string) => {
    const v = String(form.get(n) ?? "").trim();
    return v || undefined;
  };

  try {
    const resultado = await coletarOrgao({
      tribunal,
      orgao,
      classe: texto("classe"),
      ajuizadoDe: texto("ajuizado_de"),
      ajuizadoAte: texto("ajuizado_ate"),
      julgadoDe: texto("julgado_de"),
      julgadoAte: texto("julgado_ate"),
      paginas: Math.min(Math.max(Number(form.get("paginas") ?? 1), 1), 10),
      dryRun: form.get("dry_run") === "on",
    });
    revalidatePath("/sincronizacao");
    revalidatePath("/juizo");
    return { ok: true, resultado };
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : "Falha na coleta." };
  }
}


/**
 * Reúne sentenças de uma vara (ou de um magistrado) no DJEN, com o teor.
 *
 * É a coleta que permite estudar fundamentação: diferente do DataJud,
 * que devolve só o código do julgamento, aqui vem o texto publicado.
 */
export async function coletarSentencas(_estado: unknown, form: FormData) {
  const eu = await usuarioAtual();
  if (!eu || eu.papel === "colaborador") {
    return { erro: "Sem permissão para coletar." };
  }

  const t = (n: string) => {
    const v = String(form.get(n) ?? "").trim();
    return v || undefined;
  };

  const dias = Math.min(Math.max(Number(form.get("dias") ?? 30), 1), 365);
  const hoje = new Date();
  const dataFim = t("ate") ?? hoje.toISOString().slice(0, 10);
  const dataInicio =
    t("de") ?? new Date(hoje.getTime() - dias * 86_400_000).toISOString().slice(0, 10);

  if (!t("orgao") && !t("magistrado") && !t("contendo")) {
    return { erro: "Informe a vara, o magistrado ou um termo do teor." };
  }

  try {
    const resultado = await coletarDjenPorOrgao({
      tribunal: t("tribunal"),
      orgao: t("orgao"),
      magistrado: t("magistrado"),
      contendo: t("contendo"),
      dataInicio,
      dataFim,
      paginas: Math.min(Math.max(Number(form.get("paginas") ?? 3), 1), 30),
      somenteDecisoes: form.get("somente_decisoes") !== "off",
      dryRun: form.get("dry_run") === "on",
    });
    revalidatePath("/juizo");
    revalidatePath("/decisoes");
    return { ok: true, resultado };
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : "Falha na coleta." };
  }
}
