import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";
import { consultar } from "@/lib/db";
import { Cartao, TituloPagina, Vazio } from "@/components/ui";
import { FormularioSenha } from "./formulario";

export const dynamic = "force-dynamic";

const PAPEL: Record<string, string> = {
  administrador: "Administrador",
  advogado: "Advogado",
  colaborador: "Colaborador",
};

export default async function Conta() {
  const eu = await usuarioAtual();
  if (!eu) redirect("/login");

  const sessoes = await consultar(
    `select criada_em, ultimo_uso, ip, user_agent, expira_em
     from sessao where usuario_id = $1::uuid
     order by ultimo_uso desc`,
    [eu.id],
  );

  return (
    <>
      <TituloPagina titulo="Minha conta" descricao={`${eu.nome} · ${eu.email}`} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao
          titulo="Trocar senha"
          descricao="A senha atual é exigida mesmo com a sessão aberta."
        >
          <FormularioSenha />
        </Cartao>

        <div className="space-y-5">
          <Cartao titulo="Acesso">
            <dl className="px-4 py-3">
              {(
                [
                  ["Nome", eu.nome],
                  ["E-mail", eu.email],
                  ["Papel", PAPEL[eu.papel] ?? eu.papel],
                ] as [string, string][]
              ).map(([r, v]) => (
                <div key={r} className="border-b py-2 last:border-b-0">
                  <dt className="rotulo-campo mb-0.5">{r}</dt>
                  <dd className="text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          </Cartao>

          <Cartao
            titulo="Sessões abertas"
            descricao="Trocar a senha encerra todas, exceto a atual."
          >
            {sessoes.length === 0 ? (
              <Vazio mensagem="Nenhuma sessão registrada." />
            ) : (
              <ul className="px-4 py-2">
                {sessoes.map((s, i) => (
                  <li key={i} className="border-b py-2.5 text-sm last:border-b-0">
                    <div className="tabular-nums">
                      {new Date(String(s.ultimo_uso)).toLocaleString("pt-BR")}
                    </div>
                    <div className="text-xs" style={{ color: "var(--tinta-3)" }}>
                      {String(s.ip ?? "IP desconhecido")} ·{" "}
                      {String(s.user_agent ?? "").slice(0, 60) || "sem identificação"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>

      <div
        className="cartao mt-5 px-4 py-3 text-sm leading-relaxed"
        style={{ background: "var(--papel-2)" }}
      >
        <strong>Esqueceu a senha?</strong> O sistema não envia e-mail de
        recuperação. Peça a um administrador que redefina a sua em{" "}
        <em>Usuários</em>. Se você for o único administrador, a saída é apagar o
        usuário direto no banco e refazer o primeiro acesso — o README explica
        como.
      </div>
    </>
  );
}
