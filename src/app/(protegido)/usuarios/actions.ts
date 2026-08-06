"use server";

import { revalidatePath } from "next/cache";
import { gerarHashSenha, usuarioAtual, validarSenha } from "@/lib/auth";
import { consultar } from "@/lib/db";

export async function criarUsuario(_estado: unknown, form: FormData) {
  // Autorização é verificada aqui também, não só na tela: server action é
  // um endpoint, e endpoint não pode confiar em quem o chamou.
  const eu = await usuarioAtual();
  if (eu?.papel !== "administrador") {
    return { erro: "Apenas administradores podem criar usuários." };
  }

  const nome = String(form.get("nome") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const papel = String(form.get("papel") ?? "colaborador");

  if (!nome || !email) return { erro: "Informe nome e e-mail." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: "E-mail inválido." };
  if (!["administrador", "advogado", "colaborador"].includes(papel)) {
    return { erro: "Papel inválido." };
  }

  const problema = validarSenha(senha);
  if (problema) return { erro: problema };

  try {
    const { hash, sal } = await gerarHashSenha(senha);
    await consultar(
      `insert into usuario (email, nome, senha_hash, senha_sal, papel)
       values ($1, $2, $3, $4, $5::papel_usuario)`,
      [email, nome, hash, sal, papel],
    );
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    if (msg.includes("usuario_email_key")) {
      return { erro: "Já existe usuário com esse e-mail." };
    }
    return { erro: msg };
  }
}
