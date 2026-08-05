"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { consultar, consultarUm } from "@/lib/db";

function txt(f: FormData, nome: string): string | null {
  const v = f.get(nome);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function lista(f: FormData, nome: string): string[] {
  const v = txt(f, nome);
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function criarPeca(_estado: unknown, form: FormData) {
  const titulo = txt(form, "titulo");
  if (!titulo) return { erro: "Informe um título para a peça." };

  try {
    const nova = await consultarUm<{ id: string }>(
      `insert into peca (
         titulo, tipo, processo_id, beneficio_id, autor, data_peca,
         modelo, resumo, texto, tags, observacoes
       ) values (
         $1, $2::tipo_peca, $3::uuid, $4::uuid, $5, $6::date,
         $7::boolean, $8, $9, $10::text[], $11
       ) returning id`,
      [
        titulo,
        txt(form, "tipo") ?? "peticao_inicial",
        txt(form, "processo_id"),
        txt(form, "beneficio_id"),
        txt(form, "autor"),
        txt(form, "data_peca"),
        form.get("modelo") === "on",
        txt(form, "resumo"),
        txt(form, "texto"),
        lista(form, "tags"),
        txt(form, "observacoes"),
      ],
    );

    if (!nova) return { erro: "Não foi possível gravar a peça." };

    const teses = form.getAll("teses").filter((t): t is string => typeof t === "string");
    if (teses.length > 0) {
      await consultar(
        `insert into peca_tese (peca_id, tese_id)
         select $1::uuid, unnest($2::uuid[]) on conflict do nothing`,
        [nova.id, teses],
      );
    }

    revalidatePath("/pecas");
    revalidatePath("/");
    redirect(`/pecas/${nova.id}`);
  } catch (erro) {
    if (erro && typeof erro === "object" && "digest" in erro) throw erro;
    return { erro: erro instanceof Error ? erro.message : "Erro ao gravar a peça." };
  }
}
