"use server";

import { revalidatePath } from "next/cache";
import { consultar } from "@/lib/db";

/**
 * Confirma (ou corrige) a conclusão pericial extraída automaticamente.
 *
 * Gravar `revisado_em` é o que faz o laudo passar a contar nas
 * estatísticas — a view vw_laudo_decisao só marca `confirmado` depois
 * disso.
 */
export async function confirmarLaudo(_estado: unknown, form: FormData) {
  const laudoId = String(form.get("laudo_id") ?? "");
  const conclusao = String(form.get("conclusao") ?? "");
  const revisor = String(form.get("revisor") ?? "").trim() || "escritório";

  if (!laudoId) return { erro: "Laudo não identificado." };
  if (!conclusao) return { erro: "Escolha a conclusão pericial." };

  const peritoId = String(form.get("perito_id") ?? "").trim();

  try {
    await consultar(
      `update laudo_pericial set
         conclusao    = $2::conclusao_pericial,
         perito_id    = coalesce($3::uuid, perito_id),
         revisado_em  = now(),
         revisado_por = $4,
         origem_dado  = 'manual'
       where id = $1::uuid`,
      [laudoId, conclusao, peritoId || null, revisor],
    );

    revalidatePath("/revisao");
    revalidatePath("/padroes");
    revalidatePath("/peritos");
    revalidatePath("/");
    return { ok: true };
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : "Erro ao confirmar o laudo.",
    };
  }
}

/**
 * Confirma (ou corrige) o resultado extraído de uma sentença ou acórdão.
 *
 * `favoravel` é perguntado de forma explícita porque o dispositivo não
 * revela quem recorreu: "nego provimento" ao recurso do INSS é favorável
 * ao cliente, e nenhuma extração de texto acerta isso sozinha.
 */
export async function confirmarDecisao(_estado: unknown, form: FormData) {
  const decisaoId = String(form.get("decisao_id") ?? "");
  const resultado = String(form.get("resultado") ?? "");
  const favoravel = String(form.get("favoravel") ?? "");

  if (!decisaoId) return { erro: "Decisão não identificada." };
  if (!resultado) return { erro: "Escolha o resultado." };

  try {
    await consultar(
      `update decisao set
         resultado   = $2::resultado_julgamento,
         favoravel   = case when $3 = 'sim' then true
                            when $3 = 'nao' then false
                            else favoravel end,
         origem_dado = 'manual'
       where id = $1::uuid`,
      [decisaoId, resultado, favoravel],
    );

    revalidatePath("/revisao");
    revalidatePath("/padroes");
    revalidatePath("/decisoes");
    revalidatePath("/");
    return { ok: true };
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : "Erro ao confirmar a decisão.",
    };
  }
}

/** Descarta um laudo extraído por engano (documento que não era laudo). */
export async function descartarLaudo(_estado: unknown, form: FormData) {
  const laudoId = String(form.get("laudo_id") ?? "");
  if (!laudoId) return { erro: "Laudo não identificado." };

  try {
    await consultar("delete from laudo_pericial where id = $1::uuid", [laudoId]);
    revalidatePath("/revisao");
    revalidatePath("/");
    return { ok: true };
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : "Erro ao descartar o laudo.",
    };
  }
}
