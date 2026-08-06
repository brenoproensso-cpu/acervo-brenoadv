"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  COOKIE_SESSAO,
  autenticar,
  criarSessao,
  encerrarSessao,
  existeAlgumUsuario,
  gerarHashSenha,
  usuarioAtual,
  opcoesCookie,
  registrarAcesso,
  validarSenha,
} from "@/lib/auth";
import { consultar, consultarUm } from "@/lib/db";

async function contexto() {
  const h = await headers();
  return {
    // Atrás de proxy (Vercel), o IP real vem no cabeçalho encaminhado.
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
}

export async function entrar(_estado: unknown, form: FormData) {
  const email = String(form.get("email") ?? "");
  const senha = String(form.get("senha") ?? "");

  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const ctx = await contexto();
  const r = await autenticar(email, senha, ctx);
  if (!r.ok) return { erro: r.erro };

  const token = await criarSessao(r.usuario.id, ctx);
  (await cookies()).set(COOKIE_SESSAO, token, opcoesCookie());

  redirect(destinoSeguro(form.get("destino")));
}

/**
 * Só aceita caminho interno. Sem isso, um link
 * `/login?destino=https://sitefalso` levaria o usuário para fora logo
 * após digitar a senha, com a aparência de que o sistema o mandou lá.
 */
function destinoSeguro(valor: FormDataEntryValue | null): string {
  if (typeof valor !== "string") return "/";
  // Exige barra única no início: "//host" é URL absoluta protocol-relative.
  if (!valor.startsWith("/") || valor.startsWith("//")) return "/";
  if (valor.startsWith("/login")) return "/";
  return valor;
}

export async function sair() {
  const eu = await usuarioAtual();
  if (eu) await registrarAcesso(eu.id, eu.email, "logout", await contexto());
  await encerrarSessao();
  redirect("/login");
}

/**
 * Primeiro acesso: cria o administrador inicial.
 *
 * Só funciona enquanto não existir nenhum usuário. Depois disso a rota
 * fica inerte — senão qualquer visitante criaria a própria conta.
 */
export async function criarPrimeiroUsuario(_estado: unknown, form: FormData) {
  if (await existeAlgumUsuario()) {
    return { erro: "O sistema já tem usuários. Peça acesso ao administrador." };
  }

  const nome = String(form.get("nome") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const confirmacao = String(form.get("confirmacao") ?? "");

  if (!nome || !email) return { erro: "Informe nome e e-mail." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: "E-mail inválido." };
  if (senha !== confirmacao) return { erro: "As senhas não conferem." };

  const problema = validarSenha(senha);
  if (problema) return { erro: problema };

  const { hash, sal } = await gerarHashSenha(senha);

  try {
    const novo = await consultarUm<{ id: string }>(
      `insert into usuario (email, nome, senha_hash, senha_sal, papel)
       values ($1, $2, $3, $4, 'administrador')
       returning id`,
      [email, nome, hash, sal],
    );
    if (!novo) return { erro: "Não foi possível criar o usuário." };

    const ctx = await contexto();
    // A criação do administrador inicial também entra na trilha: é o
    // primeiro evento da vida do sistema e precisa estar registrado.
    await registrarAcesso(novo.id, email, "primeiro_acesso", ctx);
    const token = await criarSessao(novo.id, ctx);
    (await cookies()).set(COOKIE_SESSAO, token, opcoesCookie());
  } catch (erro) {
    if (erro && typeof erro === "object" && "digest" in erro) throw erro;
    return {
      erro: erro instanceof Error ? erro.message : "Erro ao criar o usuário.",
    };
  }

  redirect("/");
}

/** Encerra todas as sessões do usuário — útil se um dispositivo se perdeu. */
export async function encerrarTodasSessoes(usuarioId: string) {
  await consultar("delete from sessao where usuario_id = $1::uuid", [usuarioId]);
}
