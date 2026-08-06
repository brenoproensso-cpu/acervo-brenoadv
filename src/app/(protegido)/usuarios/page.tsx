import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";
import { consultar } from "@/lib/db";
import { dataBR } from "@/lib/labels";
import { Cartao, TituloPagina, Vazio } from "@/components/ui";
import { FormularioUsuario } from "./formulario";
import { Desbloquear, RedefinirSenha } from "./acoes-senha";

export const dynamic = "force-dynamic";

const PAPEL: Record<string, string> = {
  administrador: "Administrador",
  advogado: "Advogado",
  colaborador: "Colaborador",
};

const EVENTO: Record<string, string> = {
  login_ok: "Entrou",
  login_falha: "Senha incorreta",
  bloqueio: "Conta bloqueada",
  logout: "Saiu",
};

export default async function Usuarios() {
  const eu = await usuarioAtual();
  // Só administrador gerencia acesso.
  if (eu?.papel !== "administrador") redirect("/");

  const [usuarios, acessos] = await Promise.all([
    consultar(
      `select u.id, u.nome, u.email, u.papel, u.ativo, u.ultimo_acesso,
              u.bloqueado_ate,
              (select count(*) from sessao s
                where s.usuario_id = u.id and s.expira_em > now()) as sessoes_ativas
       from usuario u order by u.nome`,
    ),
    consultar(
      `select email, evento, ip, criado_em from log_acesso
       order by criado_em desc limit 25`,
    ),
  ]);

  return (
    <>
      <TituloPagina
        titulo="Usuários e acessos"
        descricao="Quem entra no sistema e o registro das últimas tentativas."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Cartao titulo="Usuários">
            <div className="tabela-rolavel">
              <table className="dados">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Papel</th>
                    <th>Último acesso</th>
                    <th className="num">Sessões</th>
                    <th>Senha</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={String(u.id)}>
                      <td>
                        {String(u.nome)}
                        {!u.ativo && (
                          <span className="selo selo-reves ml-2">inativo</span>
                        )}
                        {Boolean(u.bloqueado_ate) && (
                          <span className="ml-2 inline-block">
                            <Desbloquear usuarioId={String(u.id)} />
                          </span>
                        )}
                        {u.id === eu.id && (
                          <span className="selo selo-neutro ml-2">você</span>
                        )}
                      </td>
                      <td style={{ color: "var(--tinta-2)" }}>{String(u.email)}</td>
                      <td>{PAPEL[String(u.papel)] ?? String(u.papel)}</td>
                      <td style={{ color: "var(--tinta-2)" }}>
                        {u.ultimo_acesso ? dataBR(u.ultimo_acesso as string) : "nunca"}
                      </td>
                      <td className="num tabular-nums">{Number(u.sessoes_ativas)}</td>
                      <td>
                        <RedefinirSenha
                          usuarioId={String(u.id)}
                          nome={String(u.nome)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>

          <Cartao
            titulo="Últimos acessos"
            descricao="Guardado porque a base tem dado sensível de saúde."
          >
            {acessos.length === 0 ? (
              <Vazio mensagem="Sem registros." />
            ) : (
              <div className="tabela-rolavel">
                <table className="dados">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>E-mail</th>
                      <th>Evento</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acessos.map((a, i) => (
                      <tr key={i}>
                        <td className="tabular-nums" style={{ color: "var(--tinta-2)" }}>
                          {new Date(String(a.criado_em)).toLocaleString("pt-BR")}
                        </td>
                        <td>{String(a.email ?? "—")}</td>
                        <td>
                          <span
                            className={`selo ${
                              a.evento === "login_ok" ? "selo-exito" : "selo-reves"
                            }`}
                          >
                            {EVENTO[String(a.evento)] ?? String(a.evento)}
                          </span>
                        </td>
                        <td style={{ color: "var(--tinta-3)" }}>{String(a.ip ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Cartao>
        </div>

        <Cartao titulo="Novo usuário">
          <div className="px-4 py-4">
            <FormularioUsuario />
          </div>
        </Cartao>
      </div>
    </>
  );
}
