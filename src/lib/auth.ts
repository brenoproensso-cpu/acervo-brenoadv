import "server-only";
import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  createHash,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { consultar, consultarUm } from "./db";

// promisify perde a sobrecarga que aceita opções; o tipo é declarado aqui.
const scryptAsync = promisify(scrypt) as (
  senha: string,
  sal: string,
  keylen: number,
  opcoes: ScryptOptions,
) => Promise<Buffer>;

export const COOKIE_SESSAO = "acervo_sessao";
const DIAS_SESSAO = 7;

// Parâmetros do scrypt. N=2^15 leva ~100ms num servidor comum: lento o
// bastante para atrapalhar força bruta, rápido o bastante para o login.
//
// maxmem é obrigatório aqui: N=32768 com r=8 exige 128*N*r = 32 MiB, que
// é exatamente o teto padrão do Node — e o cálculo estoura por causa do
// overhead. Sem esta linha, todo login falha com "memory limit exceeded".
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

// ---------------------------------------------------------------------
// Senhas
// ---------------------------------------------------------------------

export async function gerarHashSenha(senha: string): Promise<{
  hash: string;
  sal: string;
}> {
  const sal = randomBytes(16).toString("hex");
  const derivada = await scryptAsync(senha, sal, SCRYPT.keylen, SCRYPT);
  return { hash: derivada.toString("hex"), sal };
}

export async function conferirSenha(
  senha: string,
  hash: string,
  sal: string,
): Promise<boolean> {
  const derivada = await scryptAsync(senha, sal, SCRYPT.keylen, SCRYPT);
  const guardada = Buffer.from(hash, "hex");
  // Comprimentos diferentes fazem timingSafeEqual lançar; comparar antes
  // evita o erro e não vaza informação (o tamanho é fixo em cadastro válido).
  if (derivada.length !== guardada.length) return false;
  return timingSafeEqual(derivada, guardada);
}

/**
 * Exigências mínimas de senha. Deliberadamente simples: comprimento faz
 * mais diferença que regra de símbolo obrigatório, que só empurra as
 * pessoas para "Senha@123".
 */
export function validarSenha(senha: string): string | null {
  if (senha.length < 10) return "A senha precisa ter ao menos 10 caracteres.";
  if (/^\d+$/.test(senha)) return "A senha não pode ser só números.";
  return null;
}

// ---------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------

/** O cookie leva o token; o banco guarda só o hash dele. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type Usuario = {
  id: string;
  email: string;
  nome: string;
  papel: "administrador" | "advogado" | "colaborador";
};

export async function criarSessao(
  usuarioId: string,
  contexto: { ip?: string | null; userAgent?: string | null } = {},
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + DIAS_SESSAO * 86_400_000);

  await consultar(
    `insert into sessao (usuario_id, token_hash, expira_em, ip, user_agent)
     values ($1::uuid, $2, $3::timestamptz, $4, $5)`,
    [usuarioId, hashToken(token), expira.toISOString(), contexto.ip ?? null, contexto.userAgent ?? null],
  );

  return token;
}

/** Usuário da requisição atual, ou null. Usada em toda página protegida. */
export async function usuarioAtual(): Promise<Usuario | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (!token) return null;

  const linha = await consultarUm<Usuario & { sessao_id: string }>(
    `select u.id, u.email, u.nome, u.papel, s.id as sessao_id
     from sessao s
     join usuario u on u.id = s.usuario_id
     where s.token_hash = $1
       and s.expira_em > now()
       and u.ativo
     limit 1`,
    [hashToken(token)],
  ).catch(() => null);

  if (!linha) return null;

  // Marca uso, sem bloquear a resposta.
  void consultar("update sessao set ultimo_uso = now() where id = $1::uuid", [
    linha.sessao_id,
  ]).catch(() => {});

  return { id: linha.id, email: linha.email, nome: linha.nome, papel: linha.papel };
}

export async function encerrarSessao(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) {
    await consultar("delete from sessao where token_hash = $1", [hashToken(token)]).catch(
      () => {},
    );
  }
  jar.delete(COOKIE_SESSAO);
}

export function opcoesCookie(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    // Em produção o cookie só trafega por HTTPS.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DIAS_SESSAO * 86_400,
  };
}

// ---------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------

const MAX_TENTATIVAS = 5;
const MINUTOS_BLOQUEIO = 15;

type ResultadoLogin =
  | { ok: true; usuario: Usuario }
  | { ok: false; erro: string };

export async function autenticar(
  email: string,
  senha: string,
  contexto: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoLogin> {
  const emailNormalizado = email.trim().toLowerCase();

  const u = await consultarUm<{
    id: string;
    email: string;
    nome: string;
    papel: Usuario["papel"];
    senha_hash: string;
    senha_sal: string;
    ativo: boolean;
    tentativas_falhas: number;
    bloqueado_ate: string | null;
  }>(
    `select id, email, nome, papel, senha_hash, senha_sal, ativo,
            tentativas_falhas, bloqueado_ate
     from usuario where email = $1`,
    [emailNormalizado],
  );

  // Mensagem única para usuário inexistente e senha errada: dizer qual
  // dos dois falhou entregaria a lista de e-mails válidos.
  const generico = "E-mail ou senha incorretos.";

  if (!u || !u.ativo) {
    await registrarAcesso(null, emailNormalizado, "login_falha", contexto);
    // Gasta tempo parecido com o de uma verificação real, para que a
    // demora da resposta não revele se o e-mail existe.
    await gerarHashSenha(senha);
    return { ok: false, erro: generico };
  }

  if (u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()) {
    const restam = Math.ceil(
      (new Date(u.bloqueado_ate).getTime() - Date.now()) / 60000,
    );
    return {
      ok: false,
      erro: `Conta bloqueada por tentativas seguidas. Tente em ${restam} min.`,
    };
  }

  const senhaOk = await conferirSenha(senha, u.senha_hash, u.senha_sal);

  if (!senhaOk) {
    const tentativas = u.tentativas_falhas + 1;
    const bloquear = tentativas >= MAX_TENTATIVAS;

    await consultar(
      `update usuario set
         tentativas_falhas = $2,
         bloqueado_ate = case when $3 then now() + ($4 || ' minutes')::interval else null end
       where id = $1::uuid`,
      [u.id, tentativas, bloquear, String(MINUTOS_BLOQUEIO)],
    );

    await registrarAcesso(u.id, emailNormalizado, bloquear ? "bloqueio" : "login_falha", contexto);
    return { ok: false, erro: generico };
  }

  await consultar(
    `update usuario set tentativas_falhas = 0, bloqueado_ate = null, ultimo_acesso = now()
     where id = $1::uuid`,
    [u.id],
  );
  await consultar("select limpar_sessoes_vencidas()").catch(() => {});
  await registrarAcesso(u.id, emailNormalizado, "login_ok", contexto);

  return {
    ok: true,
    usuario: { id: u.id, email: u.email, nome: u.nome, papel: u.papel },
  };
}

export async function registrarAcesso(
  usuarioId: string | null,
  email: string | null,
  evento: string,
  contexto: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await consultar(
    `insert into log_acesso (usuario_id, email, evento, ip, user_agent)
     values ($1::uuid, $2, $3, $4, $5)`,
    [usuarioId, email, evento, contexto.ip ?? null, contexto.userAgent ?? null],
  ).catch(() => {});
}

/**
 * Existe ao menos um usuário? Define se o sistema mostra o primeiro
 * cadastro.
 *
 * Deliberadamente NÃO engole erro de banco. A versão anterior devolvia
 * `false` quando a consulta falhava, e o efeito foi ruim: com o banco
 * inacessível, a tela anunciava "Primeiro acesso — nenhum usuário
 * cadastrado", afirmando algo que não tinha como saber. Quem visse aquilo
 * concluiria que a base estava vazia, quando na verdade estava
 * inalcançável.
 */
export async function existeAlgumUsuario(): Promise<boolean> {
  const r = await consultarUm<{ n: string }>("select count(*)::int as n from usuario");
  return r ? Number(r.n) > 0 : false;
}
