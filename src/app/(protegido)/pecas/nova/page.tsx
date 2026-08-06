import Link from "next/link";
import { catalogos } from "@/lib/queries";
import { TIPO_PECA, opcoes } from "@/lib/labels";
import { criarPeca } from "../actions";
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

export default async function NovaPeca() {
  const [beneficios, teses, processos] = await Promise.all([
    catalogos.beneficios(),
    catalogos.teses(),
    catalogos.processos(),
  ]);

  const sel = (l: { id: string; texto: string }[]) =>
    l.map((o) => ({ valor: o.id, texto: o.texto }));

  return (
    <>
      <div className="mb-4">
        <Link href="/pecas" className="text-sm" style={{ color: "var(--marinho)" }}>
          ← Peças
        </Link>
      </div>

      <TituloPagina
        titulo="Cadastrar peça"
        descricao="O texto colado aqui é indexado e passa a ser pesquisável em todo o acervo."
      />

      <div className="max-w-4xl">
        <Formulario action={criarPeca} rotuloEnvio="Salvar peça">
          <Secao titulo="Identificação">
            <div className="sm:col-span-2">
              <Campo nome="titulo" rotulo="Título" obrigatorio />
            </div>
            <Selecao
              nome="tipo"
              rotulo="Tipo de peça"
              padrao="peticao_inicial"
              vazio="Petição inicial"
              opcoes={opcoes(TIPO_PECA)}
            />
            <Selecao nome="beneficio_id" rotulo="Benefício" opcoes={sel(beneficios)} />
            <Campo nome="autor" rotulo="Redigida por" />
            <Campo nome="data_peca" rotulo="Data" tipo="date" />
            <Selecao
              nome="processo_id"
              rotulo="Processo"
              opcoes={sel(processos)}
              vazio="Nenhum"
            />
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" name="modelo" className="h-4 w-4" />
                Marcar como modelo reutilizável
              </label>
            </div>
          </Secao>

          <Secao titulo="Conteúdo" colunas={1}>
            <AreaTexto
              nome="resumo"
              rotulo="Resumo"
              linhas={3}
              dica="Uma ou duas frases sobre a tese central — é o que aparece na listagem."
            />
            <AreaTexto nome="texto" rotulo="Texto integral" linhas={14} />
          </Secao>

          <Secao titulo="Classificação">
            <MultiSelecao
              nome="teses"
              rotulo="Teses sustentadas"
              opcoes={sel(teses)}
              dica="Segure Ctrl (ou Cmd) para marcar mais de uma."
            />
            <div className="space-y-4">
              <Campo nome="tags" rotulo="Etiquetas" dica="Separadas por vírgula." />
              <AreaTexto nome="observacoes" rotulo="Observações internas" linhas={3} />
            </div>
          </Secao>
        </Formulario>
      </div>
    </>
  );
}
