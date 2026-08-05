"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { consultar, consultarUm } from "@/lib/db";

/** Campo de texto opcional: string vazia vira NULL no banco. */
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

export async function criarDecisao(_estado: unknown, form: FormData) {
  const titulo = txt(form, "titulo");
  if (!titulo) {
    return { erro: "Informe um título para a decisão." };
  }

  const origem = txt(form, "origem") ?? "acervo_proprio";
  const favoravelBruto = txt(form, "favoravel");

  try {
    const nova = await consultarUm<{ id: string }>(
      `insert into decisao (
         origem, tipo, titulo, processo_id, numero_cnj, orgao_julgador_id,
         magistrado_id, relator, tribunal, instancia, data_decisao, data_publicacao,
         resultado, favoravel, beneficio_id, nivel_autoridade,
         ementa, dispositivo, texto_integral, fonte, url_fonte, tags, observacoes
       ) values (
         $1::origem_documento, $2::tipo_documento, $3, $4::uuid, $5, $6::uuid,
         $7::uuid, $8, $9, $10::instancia, $11::date, $12::date,
         $13::resultado_julgamento,
         -- NULL deixa o trigger deduzir a partir do resultado e do polo.
         $14::boolean, $15::uuid, $16,
         $17, $18, $19, $20, $21, $22::text[], $23
       ) returning id`,
      [
        origem,
        txt(form, "tipo") ?? "sentenca",
        titulo,
        txt(form, "processo_id"),
        txt(form, "numero_cnj"),
        txt(form, "orgao_julgador_id"),
        txt(form, "magistrado_id"),
        txt(form, "relator"),
        txt(form, "tribunal"),
        txt(form, "instancia") ?? "primeiro_grau",
        txt(form, "data_decisao"),
        txt(form, "data_publicacao"),
        txt(form, "resultado"),
        favoravelBruto === "sim" ? true : favoravelBruto === "nao" ? false : null,
        txt(form, "beneficio_id"),
        txt(form, "nivel_autoridade"),
        txt(form, "ementa"),
        txt(form, "dispositivo"),
        txt(form, "texto_integral"),
        txt(form, "fonte"),
        txt(form, "url_fonte"),
        lista(form, "tags"),
        txt(form, "observacoes"),
      ],
    );

    if (!nova) return { erro: "Não foi possível gravar a decisão." };

    const teses = form.getAll("teses").filter((t): t is string => typeof t === "string");
    if (teses.length > 0) {
      await consultar(
        `insert into decisao_tese (decisao_id, tese_id, acolhida)
         select $1::uuid, unnest($2::uuid[]), $3::boolean
         on conflict do nothing`,
        [
          nova.id,
          teses,
          favoravelBruto === "sim" ? true : favoravelBruto === "nao" ? false : null,
        ],
      );
    }

    revalidatePath("/decisoes");
    revalidatePath("/padroes");
    revalidatePath("/");
    redirect(`/decisoes/${nova.id}`);
  } catch (erro) {
    // redirect() sinaliza através de uma exceção; não é falha.
    if (erro && typeof erro === "object" && "digest" in erro) throw erro;
    return {
      erro: erro instanceof Error ? erro.message : "Erro ao gravar a decisão.",
    };
  }
}
