import Link from "next/link";
import { catalogos } from "@/lib/queries";
import {
  INSTANCIA,
  NIVEL_AUTORIDADE,
  ORIGEM,
  RESULTADO,
  TIPO_DOCUMENTO,
  opcoes,
} from "@/lib/labels";
import { criarDecisao } from "../actions";
import {
  AreaTexto,
  Campo,
  Formulario,
  MultiSelecao,
  Secao,
  Selecao,
} from "@/components/formulario";
import { TituloPagina } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NovaDecisao() {
  const [beneficios, orgaos, magistrados, teses, processos] = await Promise.all([
    catalogos.beneficios(),
    catalogos.orgaos(),
    catalogos.magistrados(),
    catalogos.teses(),
    catalogos.processos(),
  ]);

  const sel = (l: { id: string; texto: string }[]) =>
    l.map((o) => ({ valor: o.id, texto: o.texto }));

  return (
    <>
      <div className="mb-4">
        <Link href="/decisoes" className="text-sm" style={{ color: "var(--marinho)" }}>
          ← Decisões
        </Link>
      </div>

      <TituloPagina
        titulo="Cadastrar decisão"
        descricao="Vale tanto para sentenças e acórdãos dos seus processos quanto para jurisprudência de referência."
      />

      <div className="max-w-4xl">
        <Formulario action={criarDecisao} rotuloEnvio="Salvar decisão">
          <Secao titulo="Classificação">
            <Selecao
              nome="origem"
              rotulo="Origem"
              padrao="acervo_proprio"
              vazio="Acervo próprio"
              opcoes={opcoes(ORIGEM)}
              dica="Só o acervo próprio entra nas estatísticas de êxito."
            />
            <Selecao
              nome="tipo"
              rotulo="Tipo de documento"
              padrao="sentenca"
              vazio="Sentença"
              opcoes={opcoes(TIPO_DOCUMENTO)}
            />
            <div className="sm:col-span-2">
              <Campo nome="titulo" rotulo="Título" obrigatorio />
            </div>
            <Selecao
              nome="instancia"
              rotulo="Instância"
              padrao="primeiro_grau"
              vazio="1º grau"
              opcoes={opcoes(INSTANCIA)}
            />
            <Selecao
              nome="nivel_autoridade"
              rotulo="Nível de autoridade"
              opcoes={opcoes(NIVEL_AUTORIDADE)}
              dica="Preencha em precedentes; deixe vazio em sentença comum."
            />
          </Secao>

          <Secao titulo="Processo e juízo">
            <Selecao
              nome="processo_id"
              rotulo="Processo"
              opcoes={sel(processos)}
              vazio="Nenhum (decisão avulsa)"
              dica="Vincular o processo é o que liga esta decisão ao laudo pericial."
            />
            <Campo nome="numero_cnj" rotulo="Número CNJ" />
            <Selecao nome="orgao_julgador_id" rotulo="Órgão julgador" opcoes={sel(orgaos)} />
            <Selecao nome="magistrado_id" rotulo="Magistrado" opcoes={sel(magistrados)} />
            <Campo nome="relator" rotulo="Relator (texto livre)" />
            <Campo nome="tribunal" rotulo="Tribunal" dica="Ex.: TRF3, STJ, TNU." />
            <Selecao nome="beneficio_id" rotulo="Benefício" opcoes={sel(beneficios)} />
          </Secao>

          <Secao titulo="Desfecho">
            <Selecao nome="resultado" rotulo="Resultado" opcoes={opcoes(RESULTADO)} />
            <Selecao
              nome="favoravel"
              rotulo="Foi favorável ao cliente?"
              vazio="Deduzir do resultado"
              opcoes={[
                { valor: "sim", texto: "Sim" },
                { valor: "nao", texto: "Não" },
              ]}
              dica="Informe manualmente quando o recurso foi do INSS: um 'desprovido' ali é favorável."
            />
            <Campo nome="data_decisao" rotulo="Data da decisão" tipo="date" />
            <Campo nome="data_publicacao" rotulo="Data da publicação" tipo="date" />
          </Secao>

          <Secao titulo="Conteúdo" colunas={1}>
            <AreaTexto nome="ementa" rotulo="Ementa" linhas={4} />
            <AreaTexto nome="dispositivo" rotulo="Dispositivo" linhas={3} />
            <AreaTexto
              nome="texto_integral"
              rotulo="Inteiro teor"
              linhas={10}
              dica="Cole o texto completo: é ele que alimenta a busca."
            />
          </Secao>

          <Secao titulo="Teses e referências">
            <MultiSelecao
              nome="teses"
              rotulo="Teses suscitadas"
              opcoes={sel(teses)}
              dica="Segure Ctrl (ou Cmd) para marcar mais de uma."
            />
            <div className="space-y-4">
              <Campo
                nome="tags"
                rotulo="Etiquetas"
                dica="Separadas por vírgula."
              />
              <Campo nome="fonte" rotulo="Fonte" />
              <Campo nome="url_fonte" rotulo="Link do inteiro teor" tipo="url" />
            </div>
            <div className="sm:col-span-2">
              <AreaTexto nome="observacoes" rotulo="Observações internas" linhas={3} />
            </div>
          </Secao>
        </Formulario>
      </div>
    </>
  );
}
