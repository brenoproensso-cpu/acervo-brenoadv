"use server";

import { revalidatePath } from "next/cache";
import {
  conferirSenha,
  gerarHashSenha,
  registrarAcesso,
  usuarioAtual,
  validarSenha,
} from "@/lib/auth";
import { consultar, consultarUm } from "@/lib/db";

/**
 * Troca a própria senha.
 *
 * Exige a senha atual mesmo com sessão válida: sessão aberta em máquina
 * emprestada não deve permitir que outra pessoa assuma a conta.
 */
export async function trocarSenha(_estado: unknown, form: FormData) {
  const eu = await usuarioAtual();
  if (!eu) return { erro: "Sessão expirada. Entre novamente." };

  const atual = String(form.get("atual") ?? "");
  const nova = String(form.get("nova") ?? "");
  const confirmacao = String(form.get("confirmacao") ?? "");

  if (!atual) return { erro: "Informe a senha atual." };
  if (nova !== confirmacao) return { erro: "As senhas novas não conferem." };
  if (nova === atual) return { erro: "A nova senha precisa ser diferente da atual." };

  const problema = validarSenha(nova);
  if (problema) return { erro: problema };

  const u = await consultarUm<{ senha_hash: string; senha_sal: string }>(
    "select senha_hash, senha_sal from usuario where id = $1::uuid",
    [eu.id],
  );
  if (!u) return { erro: "Usuário não encontrado." };

  if (!(await conferirSenha(atual, u.senha_hash, u.senha_sal))) {
    await registrarAcesso(eu.id, eu.email, "troca_senha_falha");
    return { erro: "Senha atual incorreta." };
  }

  const { hash, sal } = await gerarHashSenha(nova);

  await consultar(
    `update usuario set senha_hash = $2, senha_sal = $3,
       tentativas_falhas = 0, bloqueado_ate = null
     where id = $1::uuid`,
    [eu.id, hash, sal],
  );

  // Trocar a senha derruba as outras sessões. Se a troca foi motivada por
  // suspeita de acesso indevido, manter as demais abertas anularia o efeito.
  await consultar("delete from sessao where usuario_id = $1::uuid", [eu.id]);
  await registrarAcesso(eu.id, eu.email, "troca_senha");

  return {
    ok: true,
    aviso:
      "Senha trocada. As outras sessões foram encerradas — você precisará " +
      "entrar de novo nos demais dispositivos.",
  };
}

/**
 * Administrador define nova senha para outro usuário.
 *
 * É o caminho de recuperação: não há envio de e-mail, então quem esqueceu
 * a senha pede a um administrador. Ele nunca vê a senha antiga — apenas
 * define uma nova e a entrega por canal seguro.
 */
export async function redefinirSenhaDe(_estado: unknown, form: FormData) {
  const eu = await usuarioAtual();
  if (eu?.papel !== "administrador") {
    return { erro: "Apenas administradores podem redefinir senha de outros." };
  }

  const usuarioId = String(form.get("usuario_id") ?? "");
  const nova = String(form.get("nova") ?? "");

  if (!usuarioId) return { erro: "Usuário não identificado." };

  const problema = validarSenha(nova);
  if (problema) return { erro: problema };

  const alvo = await consultarUm<{ email: string; nome: string }>(
    "select email, nome from usuario where id = $1::uuid",
    [usuarioId],
  );
  if (!alvo) return { erro: "Usuário não encontrado." };

  const { hash, sal } = await gerarHashSenha(nova);

  await consultar(
    `update usuario set senha_hash = $2, senha_sal = $3,
       tentativas_falhas = 0, bloqueado_ate = null
     where id = $1::uuid`,
    [usuarioId, hash, sal],
  );
  await consultar("delete from sessao where usuario_id = $1::uuid", [usuarioId]);
  await registrarAcesso(usuarioId, alvo.email, "senha_redefinida_por_admin");

  revalidatePath("/usuarios");
  return {
    ok: true,
    aviso: `Senha de ${alvo.nome} redefinida e sessões encerradas. Entregue a nova senha por canal seguro.`,
  };
}

/** Desbloqueia conta travada por tentativas seguidas. */
export async function desbloquear(_estado: unknown, form: FormData) {
  const eu = await usuarioAtual();
  if (eu?.papel !== "administrador") {
    return { erro: "Apenas administradores podem desbloquear contas." };
  }

  const usuarioId = String(form.get("usuario_id") ?? "");
  if (!usuarioId) return { erro: "Usuário não identificado." };

  await consultar(
    "update usuario set tentativas_falhas = 0, bloqueado_ate = null where id = $1::uuid",
    [usuarioId],
  );
  revalidatePath("/usuarios");
  return { ok: true, aviso: "Conta desbloqueada." };
}
